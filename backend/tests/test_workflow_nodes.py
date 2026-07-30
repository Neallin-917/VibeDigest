"""Comprehensive tests for workflow.py node logic.

Tests all branch paths in check_cache, ingest, cognition, cleanup,
and route_after_cache. Mocks external dependencies (DB, LLM, video processor)
but validates internal decision logic, error handling, and state transitions.
"""

import json
import os
import pytest
from pathlib import Path
from typing import cast
from unittest.mock import MagicMock, AsyncMock, patch
from uuid import uuid4

import workflow
from workflow import (
    check_cache,
    ingest,
    cognition,
    cleanup,
    route_after_cache,
    VideoProcessingState,
)
from constants import OutputKind, TaskStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_state(**overrides) -> VideoProcessingState:
    """Build a minimal valid VideoProcessingState with sensible defaults."""
    base = {
        "task_id": str(uuid4()),
        "user_id": str(uuid4()),
        "video_url": "https://www.youtube.com/watch?v=abc123",
        "video_title": "",
        "thumbnail_url": "",
        "author": "",
        "duration": 0.0,
        "audio_path": None,
        "direct_audio_url": None,
        "transcript_text": None,
        "transcript_raw": None,
        "transcript_lang": "",
        "classification_result": None,
        "final_summary_json": None,
        "comprehension_brief_json": None,
        "cache_hit": False,
        "is_youtube": True,
        "errors": [],
        "transcript_source": None,
        "ingest_error": None,
    }
    return cast(VideoProcessingState, {**base, **overrides})


class MockModel:
    """Mimics a Pydantic model with model_dump/model_dump_json."""
    def __init__(self, data):
        self.data = data

    def model_dump(self):
        return self.data

    def model_dump_json(self):
        return json.dumps(self.data)


def _valid_summary_payload(overview: str, *, title: str = "Point A", detail: str = "Important detail.") -> dict:
    return {
        "version": 4,
        "language": "en",
        "tl_dr": "Short take.",
        "overview": overview,
        "keypoints": [
            {
                "title": title,
                "detail": detail,
                "evidence": "Quoted support.",
            }
        ],
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _patch_workflow_deps():
    """Patch all workflow getter functions for every test."""
    mock_db = MagicMock()
    mock_db.get_task.return_value = {"progress": 0}
    mock_db.get_task_outputs.return_value = []

    mock_supadata = AsyncMock()
    mock_vp = AsyncMock()
    mock_transcriber = AsyncMock()

    mock_summarizer = MagicMock()
    mock_summarizer.classify_content = AsyncMock()
    mock_summarizer.summarize = AsyncMock()
    mock_summarizer.optimize_transcript = AsyncMock()
    mock_summarizer.fast_clean_transcript = MagicMock(side_effect=lambda x: x)

    mock_comprehension = AsyncMock()

    patches = {
        "_get_db_client": mock_db,
        "_get_supadata_client": mock_supadata,
        "_get_video_processor": mock_vp,
        "_get_transcriber": mock_transcriber,
        "_get_summarizer": mock_summarizer,
        "_get_comprehension_agent": mock_comprehension,
    }

    started = []
    for attr, mock in patches.items():
        p = patch(f"workflow.{attr}", return_value=mock)
        p.start()
        started.append(p)

    yield patches

    for p in started:
        p.stop()


@pytest.fixture
def mock_db(_patch_workflow_deps):
    return _patch_workflow_deps["_get_db_client"]


@pytest.fixture
def mock_supadata(_patch_workflow_deps):
    return _patch_workflow_deps["_get_supadata_client"]


@pytest.fixture
def mock_vp(_patch_workflow_deps):
    return _patch_workflow_deps["_get_video_processor"]


@pytest.fixture
def mock_transcriber(_patch_workflow_deps):
    return _patch_workflow_deps["_get_transcriber"]


@pytest.fixture
def mock_summarizer(_patch_workflow_deps):
    return _patch_workflow_deps["_get_summarizer"]


@pytest.fixture
def mock_comprehension(_patch_workflow_deps):
    return _patch_workflow_deps["_get_comprehension_agent"]


# ===================================================================
# check_cache
# ===================================================================

class TestCheckCache:
    """Test all branch paths in the check_cache node."""

    @pytest.mark.asyncio
    async def test_no_cache_hit(self, mock_db):
        """No existing task found → cache_hit=False."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = None
        state = _make_state()

        result = await check_cache(state)

        assert result["cache_hit"] is False

    @pytest.mark.asyncio
    async def test_cache_lookup_is_scoped_to_exact_guest_owner(self, mock_db):
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = None
        state = _make_state(
            user_id="00000000-0000-0000-0000-000000000001",
            guest_id="guest-a",
        )

        await check_cache(state)

        assert mock_db.find_latest_task_with_valid_script_for_owner.call_args_list
        for call in mock_db.find_latest_task_with_valid_script_for_owner.call_args_list:
            assert call.args[0] == "00000000-0000-0000-0000-000000000001"
            assert call.args[1] == "guest-a"

    @pytest.mark.asyncio
    async def test_cache_hit_all_outputs_complete(self, mock_db):
        """Existing task with script + summary → copies both, cache_hit=True."""
        existing_task_id = str(uuid4())
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": existing_task_id,
            "video_title": "Cached Video",
            "thumbnail_url": "http://thumb.jpg",
        }
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SCRIPT,
                "status": TaskStatus.COMPLETED,
                "content": "Transcript text here",
                "locale": "en",
            },
            {
                "kind": OutputKind.SCRIPT_RAW,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"segments": [], "language": "en"}),
                "locale": "en",
            },
            {
                "kind": OutputKind.SUMMARY,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"overview": "Summary", "keypoints": [], "language": "en"}),
                "locale": "en",
            },
        ]

        state = _make_state()
        result = await check_cache(state)

        assert result["cache_hit"] is True
        assert result["video_title"] == "Cached Video"
        assert result["transcript_text"] == "Transcript text here"
        assert result["transcript_lang"] == "en"
        assert result["final_summary_json"] is not None
        # Verify DB calls: script + script_raw + summary copied
        assert mock_db.upsert_completed_task_output.call_count >= 3

    @pytest.mark.asyncio
    async def test_cache_hit_summary_missing(self, mock_db):
        """Existing task with script but NO summary → copies script, cache_hit=True, no summary."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": str(uuid4()),
            "video_title": "Partial Cache",
            "thumbnail_url": None,
        }
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SCRIPT,
                "status": TaskStatus.COMPLETED,
                "content": "Some transcript",
                "locale": "en",
            },
            {
                "kind": OutputKind.SCRIPT_RAW,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"language": "en"}),
                "locale": "en",
            },
        ]

        state = _make_state()
        result = await check_cache(state)

        assert result["cache_hit"] is True
        assert result["transcript_text"] == "Some transcript"
        assert result.get("final_summary_json") is None

    @pytest.mark.asyncio
    async def test_cache_hit_script_missing_treated_as_miss(self, mock_db):
        """Existing task found but script output missing/empty → treated as cache miss."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": str(uuid4()),
            "video_title": "No Script Task",
            "thumbnail_url": None,
        }
        # Only non-script outputs exist
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SUMMARY,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"overview": "x", "keypoints": []}),
                "locale": "en",
            },
        ]

        state = _make_state()
        result = await check_cache(state)

        # Script is missing → integrity check forces cache miss
        assert result["cache_hit"] is False
        assert result.get("transcript_text") is None

    @pytest.mark.asyncio
    async def test_cache_hit_skips_incomplete_outputs(self, mock_db):
        """Outputs with status != COMPLETED are NOT copied."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": str(uuid4()),
            "video_title": "Mixed Outputs",
            "thumbnail_url": None,
        }
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SCRIPT,
                "status": TaskStatus.COMPLETED,
                "content": "Good script",
                "locale": "en",
            },
            {
                "kind": OutputKind.SUMMARY,
                "status": TaskStatus.ERROR,  # Not completed!
                "content": "",
                "locale": None,
            },
        ]

        state = _make_state()
        result = await check_cache(state)

        assert result["cache_hit"] is True
        assert result["transcript_text"] == "Good script"
        assert result.get("final_summary_json") is None  # Error summary not copied

    @pytest.mark.asyncio
    async def test_cache_hit_summary_language_mismatch_skipped(self, mock_db):
        """Summary in different language than transcript → NOT copied."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": str(uuid4()),
            "video_title": "Lang Mismatch",
            "thumbnail_url": None,
        }
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SCRIPT,
                "status": TaskStatus.COMPLETED,
                "content": "Chinese transcript",
                "locale": "zh",
            },
            {
                "kind": OutputKind.SCRIPT_RAW,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"language": "zh"}),
                "locale": "zh",
            },
            {
                "kind": OutputKind.SUMMARY,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"overview": "English summary", "keypoints": [], "language": "en"}),
                "locale": "en",
            },
        ]

        state = _make_state()
        result = await check_cache(state)

        assert result["cache_hit"] is True
        assert result["transcript_lang"] == "zh"
        # Summary language (en) != transcript language (zh) → not copied
        assert result.get("final_summary_json") is None

    @pytest.mark.asyncio
    async def test_cache_db_exception_graceful_degradation(self, mock_db):
        """DB error during cache check → graceful fallback to cache_hit=False."""
        mock_db.find_latest_task_with_valid_script_for_owner.side_effect = Exception("DB connection lost")

        state = _make_state()
        result = await check_cache(state)

        assert result["cache_hit"] is False

    @pytest.mark.asyncio
    async def test_cache_hit_non_youtube_url(self, mock_db):
        """Non-YouTube URL → is_youtube=False."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = None

        state = _make_state(video_url="https://www.bilibili.com/video/BV123")
        result = await check_cache(state)

        assert result["is_youtube"] is False

    @pytest.mark.asyncio
    async def test_cache_hit_copies_audio_output(self, mock_db):
        """Audio output is in the reusable set → gets copied."""
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": str(uuid4()),
            "video_title": "Audio Task",
            "thumbnail_url": None,
        }
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SCRIPT,
                "status": TaskStatus.COMPLETED,
                "content": "Has audio",
                "locale": "en",
            },
            {
                "kind": OutputKind.AUDIO,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"audioUrl": "http://audio.mp3"}),
                "locale": None,
            },
        ]

        state = _make_state()
        result = await check_cache(state)

        assert result["cache_hit"] is True
        # Audio is in the reusable set (SCRIPT, SCRIPT_RAW, AUDIO)
        upsert_calls = mock_db.upsert_completed_task_output.call_args_list
        # str(OutputKind.AUDIO) may produce "OutputKind.AUDIO" or "audio"
        upsert_kinds = [str(call.args[2]) for call in upsert_calls]
        assert any("audio" in k.lower() for k in upsert_kinds)


# ===================================================================
# ingest
# ===================================================================

class TestIngest:
    """Test all transcript acquisition strategies and fallback logic."""

    @pytest.mark.asyncio
    async def test_skip_when_transcript_already_present(self, mock_db, mock_supadata):
        """If transcript_text already exists (cache hit), ingest returns empty."""
        state = _make_state(transcript_text="Already have this")

        result = await ingest(state)

        assert result == {}
        mock_supadata.get_transcript_async.assert_not_called()

    @pytest.mark.asyncio
    async def test_youtube_supadata_success(self, mock_db, mock_supadata, mock_vp):
        """YouTube URL + Supadata returns valid data → source=supadata."""
        mock_vp.extract_info_only.return_value = {
            "title": "YT Video", "thumbnail": "http://thumb", "duration": 300,
            "author": "Author", "audio_url": None,
        }
        mock_supadata.get_transcript_async.return_value = ("MD transcript", '{"segments":[]}', "en")

        state = _make_state(is_youtube=True)
        result = await ingest(state)

        assert result["transcript_source"] == "supadata"
        assert result["transcript_text"] == "MD transcript"
        assert result["video_title"] == "YT Video"
        mock_db.update_task_output_by_kind.assert_any_call(
            state["task_id"], OutputKind.SCRIPT.value,
            content="MD transcript", status=TaskStatus.COMPLETED, progress=100,
        )

    @pytest.mark.asyncio
    async def test_youtube_supadata_fails_vtt_success(self, mock_db, mock_supadata, mock_vp, mock_summarizer):
        """Supadata fails → VTT fallback succeeds → source=vtt."""
        mock_vp.extract_info_only.return_value = {
            "title": "VTT Video", "thumbnail": None, "duration": 100,
            "author": "", "audio_url": None,
        }
        # Supadata fails
        mock_supadata.get_transcript_async.return_value = (None, None, None)
        mock_supadata.last_error = "Rate limited"

        # VTT succeeds
        mock_vp.extract_captions.return_value = ("VTT transcript", '{"lang":"en"}', "en")

        state = _make_state(is_youtube=True)
        result = await ingest(state)

        assert result["transcript_source"] == "vtt"
        assert result["transcript_text"] == "VTT transcript"

    @pytest.mark.asyncio
    async def test_youtube_all_strategies_fail(self, mock_db, mock_supadata, mock_vp, mock_transcriber, mock_summarizer):
        """All three strategies fail → errors populated, task marked ERROR."""
        mock_vp.extract_info_only.return_value = {
            "title": "Fail Video", "thumbnail": None, "duration": 0,
            "author": "", "audio_url": None,
        }
        # Supadata fails
        mock_supadata.get_transcript_async.return_value = (None, None, None)
        mock_supadata.last_error = "API down"
        # VTT fails
        mock_vp.extract_captions.return_value = None
        # Whisper fails
        mock_vp.download_and_convert.side_effect = Exception("Download failed: 403")

        state = _make_state(is_youtube=True)
        result = await ingest(state)

        assert len(result["errors"]) > 0
        assert result.get("ingest_error") is not None
        # Verify task was marked as error in DB
        error_calls = [
            c for c in mock_db.update_task_status.call_args_list
            if c.kwargs.get("status") == TaskStatus.ERROR
        ]
        assert len(error_calls) > 0

    @pytest.mark.asyncio
    async def test_non_youtube_skips_supadata_and_vtt(self, mock_db, mock_supadata, mock_vp, mock_transcriber, mock_summarizer):
        """Non-YouTube URL → skips Supadata and VTT, goes straight to Whisper."""
        mock_vp.extract_info_only.return_value = {
            "title": "Bilibili Video", "thumbnail": "http://t", "duration": 600,
            "author": "UP主", "audio_url": None,
        }
        mock_vp.download_and_convert.return_value = (
            "/tmp/audio.m4a", "Bilibili Video", "http://t", None, {"duration": 600}
        )
        mock_transcriber.transcribe_with_raw.return_value = ("Whisper text", '{}', "zh")
        mock_summarizer.optimize_transcript.return_value = "Cleaned whisper text"

        state = _make_state(
            video_url="https://www.bilibili.com/video/BV123",
            is_youtube=False,
        )
        result = await ingest(state)

        assert result["transcript_source"] == "whisper"
        assert result["transcript_text"] == "Cleaned whisper text"
        # Supadata and VTT should NOT be called
        mock_supadata.get_transcript_async.assert_not_called()
        mock_vp.extract_captions.assert_not_called()

    @pytest.mark.asyncio
    async def test_metadata_extraction_failure_continues(self, mock_db, mock_supadata, mock_vp):
        """Metadata extraction fails → ingest continues with transcript."""
        mock_vp.extract_info_only.side_effect = Exception("yt-dlp error")
        mock_supadata.get_transcript_async.return_value = ("Good transcript", '{}', "en")

        state = _make_state(is_youtube=True)
        result = await ingest(state)

        # Should still succeed with transcript
        assert result["transcript_source"] == "supadata"
        assert result["transcript_text"] == "Good transcript"

    @pytest.mark.asyncio
    async def test_podcast_url_includes_audio_output(self, mock_db, mock_supadata, mock_vp, mock_transcriber, mock_summarizer):
        """Podcast URL (xiaoyuzhoufm) → AUDIO output kind is created."""
        mock_vp.extract_info_only.return_value = {
            "title": "Podcast", "thumbnail": "http://cover", "duration": 1800,
            "author": "Host", "audio_url": "http://audio.mp3",
        }
        mock_vp.download_and_convert.return_value = (
            "/tmp/pod.m4a", "Podcast", "http://cover", "http://audio.mp3", {"duration": 1800}
        )
        mock_transcriber.transcribe_with_raw.return_value = ("Podcast text", '{}', "zh")
        mock_summarizer.optimize_transcript.return_value = "Clean podcast text"

        state = _make_state(
            video_url="https://www.xiaoyuzhoufm.com/episode/abc",
            is_youtube=False,
        )
        result = await ingest(state)

        # Audio output should be persisted
        audio_calls = [
            c for c in mock_db.update_task_output_by_kind.call_args_list
            if c.args[1] == OutputKind.AUDIO.value
        ]
        assert len(audio_calls) > 0

    @pytest.mark.asyncio
    async def test_language_correction_for_cjk(self, mock_db, mock_supadata, mock_vp):
        """Provider claims 'en' but text is CJK → language corrected to detected."""
        mock_vp.extract_info_only.return_value = {
            "title": "中文视频", "thumbnail": None, "duration": 100,
            "author": "", "audio_url": None,
        }
        # Supadata returns Chinese text but claims "en"
        chinese_text = "这是一段中文转录文本，用于测试语言检测功能。" * 5
        mock_supadata.get_transcript_async.return_value = (chinese_text, '{}', "en")

        state = _make_state(is_youtube=True)
        result = await ingest(state)

        # Language should be corrected from "en" to a CJK language
        assert result["transcript_lang"] != "en"


# ===================================================================
# cognition
# ===================================================================

class TestCognition:
    """Test cognition node: classification, summarization, comprehension."""

    @pytest.mark.asyncio
    async def test_no_transcript_returns_error(self):
        """No transcript text → immediate error return."""
        state = _make_state(transcript_text=None)
        result = await cognition(state)

        assert "No transcript text" in result["errors"][0]

    @pytest.mark.asyncio
    async def test_short_transcript_skipped(self):
        """Transcript < 50 chars → skipped with error message."""
        state = _make_state(transcript_text="Too short")
        result = await cognition(state)

        assert "too short" in result["errors"][0].lower()

    @pytest.mark.asyncio
    async def test_parallel_all_succeed(self, mock_summarizer, mock_comprehension):
        """All three cognitive tasks succeed → all outputs present."""
        transcript = "Long enough transcript for analysis to proceed. " * 10
        mock_summarizer.classify_content.return_value = MockModel({"category": "Tech"})
        mock_summarizer.summarize.return_value = MockModel(_valid_summary_payload("Great summary"))
        mock_comprehension.generate_comprehension_brief.return_value = '{"insights": []}'

        state = _make_state(transcript_text=transcript)

        with patch.object(workflow.settings, "COGNITION_SEQUENTIAL", False):
            result = await cognition(state)

        assert result["classification_result"] == {"category": "Tech"}
        assert result["final_summary_json"]["overview"] == "Great summary"
        assert result["comprehension_brief_json"] is not None
        assert "errors" not in result or len(result.get("errors", [])) == 0

    @pytest.mark.asyncio
    async def test_sequential_mode(self, mock_summarizer, mock_comprehension):
        """COGNITION_SEQUENTIAL=True → runs sequentially, classification passed to summarizer."""
        transcript = "Sequential test transcript with enough length. " * 10
        mock_summarizer.classify_content.return_value = MockModel({"category": "Education"})
        mock_summarizer.summarize.return_value = MockModel(_valid_summary_payload("Edu summary"))
        mock_comprehension.generate_comprehension_brief.return_value = '{"brief": "ok"}'

        state = _make_state(transcript_text=transcript)

        with patch.object(workflow.settings, "COGNITION_SEQUENTIAL", True), \
             patch.object(workflow.settings, "COGNITION_DELAY", 0):
            result = await cognition(state)

        assert result["classification_result"] == {"category": "Education"}
        # Verify classification result was passed to summarize
        summarize_call = mock_summarizer.summarize.call_args
        assert summarize_call.kwargs.get("existing_classification") == MockModel({"category": "Education"}).model_dump() or \
               summarize_call.kwargs.get("existing_classification") is not None

    @pytest.mark.asyncio
    async def test_classification_fails_summary_succeeds(self, mock_db, mock_summarizer, mock_comprehension):
        """Classification raises exception → summary still runs, error recorded."""
        transcript = "Partial failure test transcript enough text. " * 10
        mock_summarizer.classify_content.side_effect = Exception("LLM timeout")
        mock_summarizer.summarize.return_value = MockModel(_valid_summary_payload("Still works"))
        mock_comprehension.generate_comprehension_brief.return_value = '{"brief": "ok"}'

        state = _make_state(transcript_text=transcript)

        with patch.object(workflow.settings, "COGNITION_SEQUENTIAL", False):
            result = await cognition(state)

        # Summary should still succeed
        assert result["final_summary_json"]["overview"] == "Still works"
        # Classification error should be recorded
        assert any("LLM timeout" in e for e in result.get("errors", []))
        # Classification result should not be set (None is passed to summarize)
        assert result.get("classification_result") is None

    @pytest.mark.asyncio
    async def test_summary_fails_classification_succeeds(self, mock_db, mock_summarizer, mock_comprehension):
        """Summary raises exception → classification still present, error recorded, DB updated."""
        transcript = "Summary failure test with enough content here. " * 10
        mock_summarizer.classify_content.return_value = MockModel({"category": "News"})
        mock_summarizer.summarize.side_effect = Exception("Token limit exceeded")
        mock_comprehension.generate_comprehension_brief.return_value = '{"brief": "ok"}'

        state = _make_state(transcript_text=transcript)

        with patch.object(workflow.settings, "COGNITION_SEQUENTIAL", False):
            result = await cognition(state)

        assert result["classification_result"] == {"category": "News"}
        assert any("Token limit" in e for e in result.get("errors", []))
        # Summary DB output should be marked as error
        error_calls = [
            c for c in mock_db.update_task_output_by_kind.call_args_list
            if c.args[1] == OutputKind.SUMMARY.value and c.kwargs.get("status") == TaskStatus.ERROR
        ]
        assert len(error_calls) > 0

    @pytest.mark.asyncio
    async def test_comprehension_fails_others_succeed(self, mock_db, mock_summarizer, mock_comprehension):
        """Comprehension brief fails → others still present, error recorded."""
        transcript = "Comprehension failure scenario test content. " * 10
        mock_summarizer.classify_content.return_value = MockModel({"category": "Tech"})
        mock_summarizer.summarize.return_value = MockModel(_valid_summary_payload("Summary ok"))
        mock_comprehension.generate_comprehension_brief.side_effect = Exception("Model unavailable")

        state = _make_state(transcript_text=transcript)

        with patch.object(workflow.settings, "COGNITION_SEQUENTIAL", False):
            result = await cognition(state)

        assert result["classification_result"] == {"category": "Tech"}
        assert result["final_summary_json"]["overview"] == "Summary ok"
        assert any("Model unavailable" in e for e in result.get("errors", []))

    @pytest.mark.asyncio
    async def test_all_cognition_tasks_fail(self, mock_summarizer, mock_comprehension):
        """All three tasks fail → all errors collected."""
        transcript = "Total failure scenario with sufficient length. " * 10
        mock_summarizer.classify_content.side_effect = Exception("Classify error")
        mock_summarizer.summarize.side_effect = Exception("Summarize error")
        mock_comprehension.generate_comprehension_brief.side_effect = Exception("Comprehension error")

        state = _make_state(transcript_text=transcript)

        with patch.object(workflow.settings, "COGNITION_SEQUENTIAL", False):
            result = await cognition(state)

        errors = result.get("errors", [])
        assert len(errors) >= 2  # At least classify + summarize errors
        assert result.get("classification_result") is None
        assert result.get("final_summary_json") is None


# ===================================================================
# cleanup
# ===================================================================

class TestCleanup:
    """Test cleanup node: file deletion and final status."""

    @pytest.mark.asyncio
    async def test_no_errors_completed(self, mock_db):
        """No errors → task marked COMPLETED."""
        state = _make_state(errors=[], audio_path=None)
        await cleanup(state)

        mock_db.update_task_status.assert_called_with(
            state["task_id"], status=TaskStatus.COMPLETED, progress=100,
        )

    @pytest.mark.asyncio
    async def test_with_errors_marked_error(self, mock_db):
        """Errors present → task marked ERROR with joined message."""
        state = _make_state(errors=["LLM timeout", "Classification failed"])
        await cleanup(state)

        call_kwargs = mock_db.update_task_status.call_args.kwargs
        assert call_kwargs["status"] == TaskStatus.ERROR
        assert "LLM timeout" in call_kwargs["error"]
        assert "Classification failed" in call_kwargs["error"]

    @pytest.mark.asyncio
    async def test_temp_audio_file_deleted(self, mock_db, tmp_path):
        """Temp audio file exists → gets deleted."""
        audio_file = tmp_path / "test_audio.m4a"
        audio_file.write_text("fake audio data")
        assert audio_file.exists()

        state = _make_state(errors=[], audio_path=str(audio_file))
        await cleanup(state)

        assert not audio_file.exists()

    @pytest.mark.asyncio
    async def test_missing_audio_file_no_crash(self, mock_db):
        """Audio path points to nonexistent file → no crash."""
        state = _make_state(errors=[], audio_path="/tmp/nonexistent_audio_12345.m4a")
        # Should not raise
        await cleanup(state)

        mock_db.update_task_status.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_audio_path(self, mock_db):
        """No audio_path at all → cleanup succeeds."""
        state = _make_state(errors=[], audio_path=None)
        await cleanup(state)

        mock_db.update_task_status.assert_called_once()


# ===================================================================
# route_after_cache
# ===================================================================

class TestRouteAfterCache:
    """Test conditional routing logic."""

    def test_cache_miss_routes_to_ingest(self):
        state = _make_state(cache_hit=False)
        assert route_after_cache(state) == "ingest"

    def test_cache_hit_with_summary_routes_to_cleanup(self):
        state = _make_state(
            cache_hit=True,
            final_summary_json=json.dumps({"overview": "exists"}),
        )
        assert route_after_cache(state) == "cleanup"

    def test_cache_hit_without_summary_routes_to_cognition(self):
        state = _make_state(cache_hit=True, final_summary_json=None)
        assert route_after_cache(state) == "cognition"

    def test_cache_hit_empty_summary_routes_to_cognition(self):
        """Empty string summary → treated as missing → cognition."""
        state = _make_state(cache_hit=True, final_summary_json="")
        # Empty string is falsy → routes to cognition
        assert route_after_cache(state) == "cognition"
