import json
import logging
from typing import Any, cast

from dependencies import get_db_client, get_summarizer
from services.execution_policy import (
    WorkloadKind,
    current_execution_provenance,
)
from services.formatting import format_markdown_from_raw_segments
from services.output_intent import resolve_output_intent
from services.summarizer.validation import (
    parse_summary_payload_v4,
    validate_catalog_summary_payload,
)
from utils.language_utils import normalize_lang_code
from workflow import VideoProcessingState
from workflow import app as workflow_app

logger = logging.getLogger(__name__)


class NonRetryableJobError(Exception):
    """A valid queue job cannot succeed without different persisted input."""


async def run_pipeline(
    task_id: str,
    video_url: str,
    user_id: str,
    guest_id: str | None = None,
) -> None:
    """
    Execute one pipeline attempt.

    Durable retry and terminal failure handling belong to the queue worker.
    Exceptions deliberately propagate to that boundary.
    """
    logger.info("[Pipeline Start] Task=%s, URL=%s", task_id, video_url)
    initial_state: VideoProcessingState = {
        "task_id": task_id,
        "user_id": user_id,
        "guest_id": guest_id,
        "video_url": video_url,
        "errors": [],
        "cache_hit": False,
        "is_youtube": False,
    }
    final_state = await workflow_app.ainvoke(cast(Any, initial_state))
    errors = final_state.get("errors") if isinstance(final_state, dict) else None
    if errors:
        error_text = "; ".join(str(error) for error in errors if error)
        raise RuntimeError(error_text or "Pipeline completed with errors")


async def handle_retry_output(output_id: str, user_id: str) -> None:
    """
    Handle logic for retrying a single output.
    Does NOT re-download video. Relies on existing Script output content if available.
    """
    db_client = get_db_client()
    summarizer = get_summarizer()

    out = db_client.get_output(output_id)
    if not out:
        raise NonRetryableJobError(f"Output {output_id} does not exist")
    if out.get("user_id") != user_id:
        raise NonRetryableJobError("Output is not owned by the queued user")

    task_id = out.get("task_id")
    kind = out.get("kind")
    if not task_id or not kind:
        raise NonRetryableJobError("Output record is missing task_id or kind")

    outputs = db_client.get_task_outputs(task_id)
    script_output = next((o for o in outputs if o.get("kind") == "script"), None)
    script_raw_output = next(
        (o for o in outputs if o.get("kind") == "script_raw"), None
    )

    if kind == "script":
        if not script_raw_output or not script_raw_output.get("content"):
            raise NonRetryableJobError(
                "No raw transcript segments found; create a new task to re-transcribe"
            )
        try:
            payload = json.loads(script_raw_output["content"])
            raw_segments = payload.get("segments", [])
            detected_language = payload.get("language", "unknown")
        except (json.JSONDecodeError, TypeError, AttributeError) as exc:
            raise NonRetryableJobError(
                "Persisted raw transcript segments are malformed"
            ) from exc

        md_with_ts = format_markdown_from_raw_segments(
            raw_segments,
            detected_language=detected_language,
        )
        clean = await summarizer.optimize_transcript(md_with_ts)
        db_client.update_output_status(
            output_id,
            status="completed",
            progress=100,
            content=clean,
            error="",
        )
        return

    if not script_output or not script_output.get("content"):
        raise NonRetryableJobError("Missing script content; output cannot be retried")

    script_text = script_output["content"]
    try:
        script_text = await summarizer.optimize_transcript(script_text)
    except Exception:
        logger.info(
            "Transcript optimization failed for retry %s; using original text",
            output_id,
            exc_info=True,
        )

    if kind == "summary":
        task = db_client.get_task(task_id)
        video_title = (task or {}).get("video_title") or ""
        workload_kind = (task or {}).get("workload_kind") or WorkloadKind.USER_SUBMISSION
        db_client.update_output_status(
            output_id,
            status="processing",
            progress=30,
            error="",
        )
        script_raw_json = None
        transcript_language = "unknown"
        try:
            if script_raw_output and script_raw_output.get("content"):
                script_raw_json = script_raw_output.get("content")
                payload = json.loads(script_raw_json or "{}")
                transcript_language = payload.get("language") or "unknown"
        except (json.JSONDecodeError, TypeError, AttributeError):
            logger.warning(
                "Ignoring malformed raw transcript metadata for output %s",
                output_id,
            )

        persisted_intent = dict(out.get("intent") or {})
        if out.get("locale"):
            persisted_intent["target_locale"] = out["locale"]
        resolved_intent = resolve_output_intent(persisted_intent, transcript_language)
        target_language = resolved_intent["target_locale"]
        summary_json = await summarizer.summarize_in_language_with_anchors(
            script_text,
            summary_language=target_language,
            video_title=video_title,
            script_raw_json=script_raw_json,
        )
        payload = parse_summary_payload_v4(summary_json)
        if normalize_lang_code(payload.get("language")) != target_language:
            raise ValueError(f"Summary language does not match requested locale {target_language}")
        if workload_kind == WorkloadKind.CATALOG_SUPPLY and target_language in {"en", "zh"}:
            validate_catalog_summary_payload(payload, target_language)
        validated_summary = json.dumps(
            payload,
            ensure_ascii=False,
        )

        db_client.update_output_status(
            output_id,
            status="completed",
            progress=100,
            content=validated_summary,
            error="",
            locale=target_language,
            intent=resolved_intent,
            provenance={
                "source_task_id": task_id,
                "source_kind": "script",
                "transcript_language": transcript_language,
                **current_execution_provenance(workload_kind),
            },
        )
        return

    raise NonRetryableJobError(f"Retry is not supported for output kind: {kind}")
