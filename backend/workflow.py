import json
import logging
import os
from pathlib import Path
from typing import TypedDict, Optional, List, Dict, Any, Annotated
import operator
from urllib.parse import urlparse

from langgraph.graph import StateGraph, END

# Import existing instances/classes
from constants import OutputKind, TaskStatus
from dependencies import (
    get_db_client,
    get_video_processor,
    get_transcriber,
    get_summarizer,
    get_supadata_client,
)
from services.summarizer.validation import parse_summary_payload_v4, validate_catalog_summary_payload
from services.output_intent import resolve_output_intent
from services.execution_policy import (
    CATALOG_SUMMARY_LOCALES,
    WorkloadKind,
    current_execution_provenance,
)
from utils.url import normalize_video_url
from utils.language_utils import normalize_lang_code
from utils.text_utils import detect_language, is_cjk_language
from utils.trace_utils import build_trace_config

# Setup logger
logger = logging.getLogger(__name__)

# Unified singletons: delegate to dependencies.py (single source of truth)
# Lazy properties to avoid circular imports at module load time


def _get_db_client():
    return get_db_client()


def _get_video_processor():
    return get_video_processor()


def _get_transcriber():
    return get_transcriber()


def _get_summarizer():
    return get_summarizer()


def _get_supadata_client():
    return get_supadata_client()


# --- Progress Helpers ---


def _advance_task_progress(task_id: str, progress: int) -> None:
    """Only move task progress forward to avoid regression from parallel steps."""
    try:
        db = _get_db_client()
        task = db.get_task(task_id)
        current = int(task.get("progress") or 0) if task else 0
        if progress > current:
            db.update_task_status(task_id, status=TaskStatus.PROCESSING, progress=progress)
    except Exception as e:
        logger.warning(f"Failed to advance progress for {task_id}: {e}")

# --- State Definition ---


class VideoProcessingState(TypedDict):
    # Inputs
    task_id: str
    user_id: str
    guest_id: Optional[str]
    video_url: str

    # Metadata
    video_title: str
    thumbnail_url: str
    author: str
    duration: float

    # Intermediate Artifacts
    audio_path: Optional[str]
    direct_audio_url: Optional[str]
    transcript_text: Optional[str]  # Optimized/Clean
    transcript_raw: Optional[str]  # JSON with segments
    transcript_lang: str

    final_summary_json: Optional[str]

    # Processing Control
    cache_hit: bool
    is_youtube: bool

    # Status
    # Use operator.add to append errors instead of overwriting them
    errors: Annotated[List[str], operator.add]
    transcript_source: Optional[str]  # "supadata", "vtt", "whisper"
    ingest_error: Optional[str]


# --- Nodes ---


async def check_cache(state: VideoProcessingState) -> Dict:
    """Checks DB for existing completed tasks (deduplication)."""
    logger.info(f"Node: check_cache for {state['video_url']}")
    normalized_url = normalize_video_url(state["video_url"])
    updates = {
        "cache_hit": False,
        "errors": [],
        "is_youtube": "youtube.com" in normalized_url or "youtu.be" in normalized_url,
    }

    try:
        # Reuse only artifacts owned by the same authenticated user or guest.
        # Cross-owner task_outputs are never a cache, even when the source URL is public.
        owner_lookup = _get_db_client().find_latest_task_with_valid_script_for_owner
        existing_task = owner_lookup(
            state["user_id"],
            state.get("guest_id"),
            normalized_url,
        ) or owner_lookup(
            state["user_id"],
            state.get("guest_id"),
            state["video_url"],
        )

        if existing_task:
            logger.info(f"Cache hit (Script Found): using task {existing_task['id']}")
            updates["cache_hit"] = True
            current_task = _get_db_client().get_task(state["task_id"])
            is_catalog_task = (
                isinstance(current_task, dict)
                and current_task.get("workload_kind") == WorkloadKind.CATALOG_SUPPLY
            )
            cached_summary_locales: set[str] = set()
            updates["video_title"] = existing_task.get("video_title") or "Unknown"
            updates["thumbnail_url"] = existing_task.get("thumbnail_url")

            # Update current task metadata
            _get_db_client().update_task_status(
                state["task_id"],
                video_title=updates["video_title"],
                thumbnail_url=updates["thumbnail_url"],
            )

            # Copy outputs
            existing_outputs = _get_db_client().get_task_outputs(existing_task["id"])
            for out in existing_outputs:
                if out.get("status") != TaskStatus.COMPLETED:
                    continue

                k = out.get("kind")
                val = out.get("content")
                loc = out.get("locale")

                # Copy reusable outputs
                if k in [
                    OutputKind.SCRIPT,
                    OutputKind.SCRIPT_RAW,
                    OutputKind.AUDIO,
                ]:
                    try:
                        _get_db_client().upsert_completed_task_output(
                            state["task_id"], state["user_id"], str(k), str(val), locale=loc
                        )
                        if k == OutputKind.SCRIPT:
                            updates["transcript_text"] = val
                        elif k == OutputKind.SCRIPT_RAW:
                            updates["transcript_raw"] = val
                            try:
                                raw_payload = json.loads(val or "{}")
                                if isinstance(raw_payload, dict):
                                    detected_lang = raw_payload.get("language")
                                    if detected_lang:
                                        updates["transcript_lang"] = str(detected_lang)
                            except Exception:
                                pass
                    except Exception as e:
                        logger.warning(f"Failed to copy output {k}: {e}")

                # User summaries remain source-language compatible; catalog
                # summaries reuse each supported localized artifact.
                if k == OutputKind.SUMMARY:
                    summary_lang = None
                    try:
                        summary_payload = json.loads(val or "{}")
                        if isinstance(summary_payload, dict):
                            summary_lang = summary_payload.get("language")
                    except Exception:
                        summary_lang = None

                    transcript_lang = updates.get("transcript_lang")
                    summary_lang_norm = normalize_lang_code(summary_lang)
                    transcript_lang_norm = normalize_lang_code(transcript_lang)

                    if is_catalog_task:
                        if summary_lang_norm not in CATALOG_SUMMARY_LOCALES:
                            continue
                        try:
                            payload = parse_summary_payload_v4(val)
                            validate_catalog_summary_payload(payload, summary_lang_norm)
                        except ValueError:
                            continue
                        _get_db_client().upsert_completed_task_output(
                            state["task_id"], state["user_id"], str(k), str(val), locale=summary_lang_norm
                        )
                        cached_summary_locales.add(summary_lang_norm)
                        updates["final_summary_json"] = val
                    elif transcript_lang_norm == "unknown" or summary_lang_norm == transcript_lang_norm:
                        _get_db_client().upsert_completed_task_output(
                            state["task_id"], state["user_id"], str(k), str(val), locale=loc
                        )
                        updates["final_summary_json"] = val

            if is_catalog_task and not set(CATALOG_SUMMARY_LOCALES).issubset(cached_summary_locales):
                updates["final_summary_json"] = None

            # Validate Integrity: If script is missing, treat as miss
            if not updates.get("transcript_text"):
                logger.info(
                    "Cache hit but script missing/incomplete. Treating as Cache Miss."
                )
                updates["cache_hit"] = False
                updates["transcript_text"] = None

    except Exception as e:
        logger.error(f"Error in check_cache: {e}")

    return updates


# --- Ingest Helpers ---


async def _ingest_supadata(video_url: str, task_id: str) -> Optional[Dict]:
    client = _get_supadata_client()
    try:
        _get_db_client().update_task_status(task_id, status=TaskStatus.PROCESSING, progress=15)
        md, raw, lang = await client.get_transcript_async(video_url)
        if md and raw:
            logger.info("Strategy 1 (Supadata): Success")
            return {
                "transcript_text": _get_summarizer().fast_clean_transcript(md),
                "transcript_raw": raw,
                "transcript_lang": lang,
                "transcript_source": "supadata",
            }
    except Exception as e:
        logger.info(f"Strategy 1 (Supadata) skipped/failed: {e}")
        return {"error": f"Supadata failed: {e}"}

    if client.last_error:
        return {"error": f"Supadata failed: {client.last_error}"}

    return None


async def _ingest_vtt(video_url: str, task_id: str) -> Optional[Dict]:
    try:
        _get_db_client().update_task_status(task_id, status=TaskStatus.PROCESSING, progress=25)
        logger.info("Attempting Strategy 2 (Direct VTT)...")
        res = await _get_video_processor().extract_captions(video_url)
        if res:
            md, raw, lang = res
            logger.info("Strategy 2 (Direct VTT): Success")
            return {
                "transcript_text": _get_summarizer().fast_clean_transcript(md),
                "transcript_raw": raw,
                "transcript_lang": lang,
                "transcript_source": "vtt",
            }
    except Exception as e:
        logger.warning(f"Strategy 2 (Direct VTT) failed: {e}")
        return {"error": f"Direct VTT failed: {e}"}

    return {"error": "Direct VTT failed: no captions available"}


async def _ingest_whisper(state: VideoProcessingState) -> Optional[Dict]:
    task_id = state["task_id"]
    video_url = state["video_url"]

    try:
        _get_db_client().update_task_status(task_id, status=TaskStatus.PROCESSING, progress=30)
        logger.info("Attempting Strategy 3 (Download + Whisper)...")

        # 1. Download
        TEMP_DIR = Path("temp")
        TEMP_DIR.mkdir(exist_ok=True)

        (
            audio_path,
            title,
            thumb,
            direct_audio_url,
            info,
        ) = await _get_video_processor().download_and_convert(video_url, TEMP_DIR)

        updates = {
            "audio_path": audio_path,
            "video_title": title,
            "thumbnail_url": thumb,
            "direct_audio_url": direct_audio_url,
            "duration": info.get("duration"),
        }

        # 2. Transcribe
        _get_db_client().update_task_status(task_id, status=TaskStatus.PROCESSING, progress=50)
        (
            script_text_with_timestamps,
            raw_json,
            detected_language,
        ) = await _get_transcriber().transcribe_with_raw(audio_path)

        updates["transcript_raw"] = raw_json
        updates["transcript_lang"] = detected_language

        # 3. LLM Optimization
        _get_db_client().update_task_status(task_id, status=TaskStatus.PROCESSING, progress=70)
        trace_meta = build_trace_config(
            run_name="Ingest/Optimize",
            task_id=str(task_id),
            user_id=str(state["user_id"]),
            stage="ingest",
            source="whisper",
            metadata={"video_url": video_url},
        )
        cleaned = await _get_summarizer().optimize_transcript(
            script_text_with_timestamps, trace_metadata=trace_meta
        )

        updates["transcript_text"] = cleaned
        updates["transcript_source"] = "whisper"

        return updates

    except Exception as e:
        logger.error(f"Strategy 3 (Whisper) failed: {e}")
        return {"error": str(e)}  # Special key to indicate failure inside helper


async def ingest(state: VideoProcessingState) -> Dict:
    """Unified Ingest Node: URL -> Clean Transcript & Metadata."""
    logger.info(f"Node: ingest for {state['video_url']}")

    if state.get("transcript_text"):
        logger.info("Script already present (Cache Hit). Skipping ingest.")
        return {}

    updates: Dict[str, Any] = {
        "errors": [],
        "transcript_source": "unknown",
        "video_title": state.get("video_title") or "Unknown",
        "thumbnail_url": state.get("thumbnail_url"),
    }

    task_id = state["task_id"]
    user_id = state["user_id"]
    video_url = state["video_url"]
    is_youtube = state["is_youtube"]
    strategy_errors: List[str] = []

    # --- Step 1: Initialize DB Outputs ---
    required_outputs = [
        OutputKind.SCRIPT,
        OutputKind.SCRIPT_RAW,
        OutputKind.SUMMARY,
    ]

    host = urlparse(video_url).hostname or ""
    if host.replace("www.", "").endswith(("xiaoyuzhoufm.com", "apple.com")):
        required_outputs.append(OutputKind.AUDIO)

    _get_db_client().ensure_task_outputs(task_id, user_id, [k.value for k in required_outputs])

    # --- Step 2: Metadata Extraction ---
    try:
        meta = await _get_video_processor().extract_info_only(video_url)
        updates.update(
            {
                "video_title": str(meta.get("title") or updates["video_title"]),
                "thumbnail_url": str(meta.get("thumbnail") or updates["thumbnail_url"]),
                "author": str(meta.get("author") or ""),
                "duration": float(meta.get("duration") or 0),
                "direct_audio_url": str(meta.get("audio_url") or ""),
            }
        )
        _get_db_client().update_task_status(
            task_id,
            video_title=str(updates.get("video_title")),
            thumbnail_url=str(updates.get("thumbnail_url")),
            duration=float(updates.get("duration") or 0),
        )
    except Exception as e:
        logger.warning(f"Metadata extraction warning: {e}")

    # --- Step 3: Transcript Strategy ---
    result: Optional[Dict[str, Any]] = None

    # Strategy 1: Supadata
    if not result and is_youtube:
        result = await _ingest_supadata(video_url, task_id)
        if result and "error" in result:
            strategy_errors = [*strategy_errors, str(result["error"])]
            result = None

    # Strategy 2: VTT
    if not result and is_youtube:
        result = await _ingest_vtt(video_url, task_id)
        if result and "error" in result:
            strategy_errors = [*strategy_errors, str(result["error"])]
            result = None

    # Strategy 3: Whisper
    if not result:
        result = await _ingest_whisper(state)
        if result and "error" in result:
            whisper_error = f"Whisper failed: {result['error']}"
            strategy_errors = [*strategy_errors, whisper_error]
            result = None

    # Merge results
    if result:
        # Enforce SSOT: Source language is determined solely by the transcript text content.
        # This overrides potentially hallucinated metadata from providers.
        if result.get("transcript_text"):
            try:
                real_lang = detect_language(result["transcript_text"])
                original_claim = result.get("transcript_lang")

                # Only hard-enforce for CJK where char-set detection is reliable.
                if is_cjk_language(real_lang):
                    if original_claim and normalize_lang_code(original_claim) != real_lang:
                        logger.info(
                            f"Language Corrected: Provider claimed '{original_claim}', "
                            f"but text analysis says '{real_lang}'. Enforcing '{real_lang}'."
                        )
                    result["transcript_lang"] = real_lang
                else:
                    # For non-CJK languages, only fill when provider didn't supply.
                    if not original_claim:
                        result["transcript_lang"] = real_lang
            except Exception as e:
                logger.warning(f"Language detection failed, falling back to provider metadata: {e}")

        updates.update(result)
        # Persist finalized script
        _get_db_client().update_task_output_by_kind(
            task_id,
            OutputKind.SCRIPT_RAW.value,
            content=str(updates.get("transcript_raw") or ""),
            status=TaskStatus.COMPLETED,
            progress=100,
        )
        _get_db_client().update_task_output_by_kind(
            task_id,
            OutputKind.SCRIPT.value,
            content=str(updates.get("transcript_text") or ""),
            status=TaskStatus.COMPLETED,
            progress=100,
        )
    else:
        error_messages = strategy_errors or ["All ingest strategies failed."]
        updates["errors"] = [*error_messages]
        updates["ingest_error"] = error_messages[0]

        err_msg = " | ".join(error_messages)

        _get_db_client().update_task_status(
            task_id, status=TaskStatus.ERROR, error=err_msg
        )

    # Update Audio Logic
    if updates.get("direct_audio_url"):
        _get_db_client().ensure_task_outputs(task_id, user_id, [OutputKind.AUDIO.value])
        payload = {
            "audioUrl": updates["direct_audio_url"],
            "coverUrl": updates.get("thumbnail_url"),
        }
        _get_db_client().update_task_output_by_kind(
            task_id,
            OutputKind.AUDIO.value,
            content=json.dumps(payload, ensure_ascii=False),
            status=TaskStatus.COMPLETED,
            progress=100,
        )

    return updates


# --- Cognition Helpers ---


async def _run_summarize(
    transcript_text: str,
    task_id: str,
    user_id: str,
    transcript_language: Optional[str],
    transcript_source: Optional[str],
):
    active_output: Optional[Dict[str, Any]] = None
    try:
        logger.info("Cognition: Starting summarization...")
        _advance_task_progress(task_id, 85)

        trace_meta = build_trace_config(
            run_name="Task Process",
            task_id=str(task_id),
            user_id=str(user_id),
            stage="cognition",
            source=str(transcript_source or "unknown"),
            metadata={"node": "cognition_summarize"},
        )
        source_language = normalize_lang_code(transcript_language or "unknown")
        task = _get_db_client().get_task(task_id)
        task_intent = task.get("output_intent") if isinstance(task, dict) else None
        workload_kind = (
            task.get("workload_kind")
            if isinstance(task, dict) and task.get("workload_kind")
            else WorkloadKind.USER_SUBMISSION
        )
        resolved_intent = resolve_output_intent(task_intent, source_language)
        primary_language = resolved_intent["target_locale"]
        if primary_language == "unknown":
            primary_language = "en"
            resolved_intent = {
                **resolved_intent,
                "target_locale": primary_language,
                "locale_source": "default_locale",
            }
        target_languages = (
            CATALOG_SUMMARY_LOCALES
            if workload_kind == WorkloadKind.CATALOG_SUPPLY
            else (primary_language,)
        )
        outputs = _get_db_client().get_task_outputs(task_id)
        summary_payloads: Dict[str, Dict[str, Any]] = {}

        for target_language in target_languages:
            language_intent = {
                **resolved_intent,
                "target_locale": target_language,
                "locale_source": (
                    "catalog_bilingual"
                    if workload_kind == WorkloadKind.CATALOG_SUPPLY
                    else resolved_intent.get("locale_source")
                ),
            }
            active_output = next(
                (
                    output
                    for output in outputs
                    if output.get("kind") == OutputKind.SUMMARY.value
                    and output.get("locale") == target_language
                ),
                None,
            )
            if not active_output and workload_kind != WorkloadKind.CATALOG_SUPPLY:
                active_output = next(
                    (
                        output
                        for output in outputs
                        if output.get("kind") == OutputKind.SUMMARY.value
                        and output.get("locale") is None
                    ),
                    None,
                )
            if not active_output:
                active_output = _get_db_client().create_task_output(
                    task_id,
                    user_id,
                    OutputKind.SUMMARY.value,
                    locale=target_language,
                )
                if active_output:
                    outputs.append(active_output)
            if not active_output:
                raise RuntimeError(
                    f"Summary output placeholder is missing for locale {target_language}"
                )

            existing_content = active_output.get("content")
            if active_output.get("status") == TaskStatus.COMPLETED and existing_content:
                try:
                    existing_payload = parse_summary_payload_v4(existing_content)
                    if normalize_lang_code(existing_payload.get("language")) != target_language:
                        raise ValueError("persisted summary language mismatch")
                    if workload_kind == WorkloadKind.CATALOG_SUPPLY:
                        validate_catalog_summary_payload(existing_payload, target_language)
                except ValueError:
                    logger.info(
                        "Regenerating invalid persisted summary for task %s locale %s",
                        task_id,
                        target_language,
                    )
                else:
                    summary_payloads[target_language] = existing_payload
                    continue

            summary = await _get_summarizer().summarize(
                transcript_text,
                target_language=target_language,
                trace_metadata=trace_meta,
            )
            payload = parse_summary_payload_v4(summary)
            if normalize_lang_code(payload.get("language")) != target_language:
                raise ValueError(
                    f"Summary language does not match requested locale {target_language}"
                )
            if workload_kind == WorkloadKind.CATALOG_SUPPLY:
                validate_catalog_summary_payload(payload, target_language)

            _get_db_client().update_output_status(
                str(active_output["id"]),
                content=json.dumps(payload, ensure_ascii=False),
                status=TaskStatus.COMPLETED,
                progress=100,
                locale=target_language,
                intent=language_intent,
                provenance={
                    "source_task_id": task_id,
                    "source_kind": OutputKind.SCRIPT.value,
                    "transcript_language": source_language,
                    **current_execution_provenance(workload_kind),
                },
            )
            summary_payloads[target_language] = payload

        _advance_task_progress(task_id, 92)
        return summary_payloads.get(primary_language) or summary_payloads[target_languages[0]]
    except Exception as e:
        logger.error(f"Cognition: Summarization failed: {e}")
        if active_output:
            _get_db_client().update_output_status(
                str(active_output["id"]),
                status=TaskStatus.ERROR,
                progress=100,
                content="",
                error=str(e),
            )
        return e


async def cognition(state: VideoProcessingState) -> Dict:
    """Generate the single user-facing summary from a transcript."""
    logger.info("Node: cognition")

    transcript_text = state.get("transcript_text")
    task_id = state["task_id"]

    if not transcript_text:
        return {"errors": ["No transcript text available for cognition"]}

    # Smart Skip
    if len(transcript_text.strip()) < 50:
        logger.info("Transcript too short (<50 chars), skipping cognition.")
        return {"errors": ["Transcript too short for analysis"]}

    _advance_task_progress(task_id, 80)

    summary_res = await _run_summarize(
        transcript_text,
        task_id,
        state["user_id"],
        transcript_language=state.get("transcript_lang"),
        transcript_source=state.get("transcript_source"),
    )

    updates: Dict[str, Any] = {}

    # Process Summary
    if isinstance(summary_res, Exception):
        logger.error(f"Summarize Error: {summary_res}")
        err = str(summary_res)
        if "errors" not in updates:
            updates["errors"] = []
        updates["errors"].append(err)
    elif summary_res:
        updates["final_summary_json"] = (
            summary_res.model_dump()
            if hasattr(summary_res, "model_dump")
            else summary_res
        )

    return updates


async def cleanup(state: VideoProcessingState) -> Dict:
    """Cleanup temp files and finalize task."""
    task_id = state["task_id"]
    audio_path = state.get("audio_path")

    if audio_path:
        try:
            path = Path(audio_path)
            if path.exists():
                os.remove(path)
                logger.info(f"Deleted temp file: {path}")
        except Exception as e:
            logger.warning(f"Cleanup failed: {e}")

    # Final Task Status Update
    if not state.get("errors"):
        _get_db_client().update_task_status(
            task_id, status=TaskStatus.COMPLETED, progress=100
        )
    else:
        # Mark parent task as terminal error instead of leaving it stuck in processing.
        error_msg = "; ".join(state.get("errors", ["Unknown error"]))
        _get_db_client().update_task_status(
            task_id, status=TaskStatus.ERROR, progress=100, error=error_msg
        )

    return {}


# --- Graph Construction ---


def route_after_cache(state: VideoProcessingState):
    if state.get("cache_hit"):
        if not state.get("final_summary_json"):
            return "cognition"
        return "cleanup"
    return "ingest"


def build_graph():
    workflow = StateGraph(VideoProcessingState)
    workflow.add_node("check_cache", check_cache)
    workflow.add_node("ingest", ingest)
    workflow.add_node("cognition", cognition)
    workflow.add_node("cleanup", cleanup)

    workflow.set_entry_point("check_cache")
    workflow.add_conditional_edges(
        "check_cache",
        route_after_cache,
        {"cleanup": "cleanup", "ingest": "ingest", "cognition": "cognition"},
    )
    workflow.add_edge("ingest", "cognition")
    workflow.add_edge("cognition", "cleanup")
    workflow.add_edge("cleanup", END)

    return workflow.compile()


app = build_graph()
