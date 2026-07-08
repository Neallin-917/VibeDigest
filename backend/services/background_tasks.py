import asyncio
import json
import logging
from typing import Any, cast

from workflow import app as workflow_app, VideoProcessingState
from .transcriber import format_markdown_from_raw_segments
from dependencies import get_db_client, get_summarizer
from services.summarizer.validation import parse_summary_payload_v4

logger = logging.getLogger(__name__)

# Concurrency Control
MAX_CONCURRENT_JOBS = 4
processing_limiter = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

async def run_pipeline(task_id: str, video_url: str, user_id: str):
    """
    Main orchestration pipeline.
    Wrapped in a Semaphore to limit concurrency.
    """
    db_client = get_db_client()

    async with processing_limiter:
        logger.info(
            f"Task {task_id} acquiring execution slot... (Active: {MAX_CONCURRENT_JOBS - processing_limiter._value})"
        )

        logger.info(
            f"[Pipeline Start] Task={task_id}, URL={video_url}"
        )

        try:
            # Initialize input state
            initial_state: VideoProcessingState = {
                "task_id": task_id,
                "user_id": user_id,
                "video_url": video_url,
                "errors": [],
                "cache_hit": False,
                "is_youtube": False,
            }

            # Invoke Graph
            await workflow_app.ainvoke(cast(Any, initial_state))

        except Exception as e:
            logger.error(f"Pipeline crashed: {e}", exc_info=True)
            try:
                db_client.update_task_status(task_id, status="error", error=str(e)[:500])
            except Exception as status_err:
                logger.error(
                    f"Failed to update task {task_id} status after crash: {status_err}"
                )


async def handle_retry_output(output_id: str, user_id: str):
    """
    Handle logic for retrying a single output.
    Does NOT re-download video. Relies on existing Script output content if available.
    """
    db_client = get_db_client()
    summarizer = get_summarizer()

    try:
        out = db_client.get_output(output_id)
        if not out:
            return
        if out.get("user_id") != user_id:
            db_client.update_output_status(
                output_id, status="error", error="Not authorized"
            )
            return

        task_id = out.get("task_id")
        kind = out.get("kind")
        if not task_id or not kind:
            db_client.update_output_status(
                output_id, status="error", error="Invalid output"
            )
            return

        outputs = db_client.get_task_outputs(task_id)
        script_output = next((o for o in outputs if o.get("kind") == "script"), None)
        script_raw_output = next(
            (o for o in outputs if o.get("kind") == "script_raw"), None
        )

        if kind == "script":
            # Prefer re-formatting from persisted raw segments.
            if not script_raw_output or not script_raw_output.get("content"):
                db_client.update_output_status(
                    output_id,
                    status="error",
                    error="No raw transcript segments found; please create a new task to re-transcribe.",
                )
                return
            try:
                payload = json.loads(script_raw_output["content"])
                raw_segments = payload.get("segments", [])
                detected_language = payload.get("language", "unknown")
                md_with_ts = format_markdown_from_raw_segments(
                    raw_segments, detected_language=detected_language
                )
                clean = await summarizer.optimize_transcript(md_with_ts)
                db_client.update_output_status(
                    output_id, status="completed", progress=100, content=clean, error=""
                )
                return
            except Exception as e:
                db_client.update_output_status(
                    output_id, status="error", error=f"Reformat failed: {str(e)}"
                )
                return

        # For summary/translation, rely on existing script content.
        if not script_output or not script_output.get("content"):
            db_client.update_output_status(
                output_id, status="error", error="Missing script content; cannot retry."
            )
            return

        script_text = script_output["content"]
        # Keep the existing optimization step consistent.
        try:
            script_text = await summarizer.optimize_transcript(script_text)
        except Exception:
            pass

        if kind == "summary":
            task = db_client.get_task(task_id)
            video_title = (task or {}).get("video_title") or ""
            try:
                db_client.update_output_status(
                    output_id, status="processing", progress=30, error=""
                )
                script_raw_json = None
                transcript_language = "unknown"
                try:
                    if script_raw_output and script_raw_output.get("content"):
                        script_raw_json = script_raw_output.get("content")
                        payload = json.loads(script_raw_json or "{}")
                        transcript_language = payload.get("language") or "unknown"
                except Exception:
                    script_raw_json = script_raw_json

                summary_json = await summarizer.summarize_in_language_with_anchors(
                    script_text,
                    summary_language=transcript_language,
                    video_title=video_title,
                    script_raw_json=script_raw_json,
                )
                validated_summary = json.dumps(
                    parse_summary_payload_v4(summary_json), ensure_ascii=False
                )

                db_client.update_output_status(
                    output_id,
                    status="completed",
                    progress=100,
                    content=validated_summary,
                    error="",
                )
            except Exception as e:
                db_client.update_output_status(output_id, status="error", error=str(e))
            return

        db_client.update_output_status(
            output_id, status="error", error=f"Retry not supported for kind: {kind}"
        )

    except Exception as e:
        db_client.update_output_status(output_id, status="error", error=str(e))
