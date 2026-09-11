"""Comprehensive tests for workflow.py node logic.

Tests all branch paths in check_cache, ingest, cognition, cleanup,
and route_after_cache. Mocks external dependencies (DB, LLM, video processor)
but validates internal decision logic, error handling, and state transitions.
"""

import json
import pytest
from typing import cast
from unittest.mock import MagicMock, AsyncMock, patch
from uuid import uuid4

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
        "final_summary_json": None,
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


def _valid_catalog_summary_payload(locale: str) -> dict:
    is_chinese = locale == "zh"
    overview = (
        "这是一段满足公开播客内容质量门槛的完整中文概览，包含足够的信息用于验证双语摘要生成与持久化流程。" * 2
        if is_chinese
        else "This complete catalog overview is deliberately long enough to pass the public content quality threshold."
    )
    takeaway = (
        "这是一条长度足够、可以用于公开播客卡片展示的中文核心结论。"
        if is_chinese
        else "This is a sufficiently complete takeaway for the public catalog card."
    )
    return {
        "version": 5,
        "language": locale,
        "tl_dr": takeaway,
        "overview": overview,
        "keypoints": [
            {
                "title": f"Point {index}",
                "detail": f"Important detail {index}.",
                "evidence": f"Quoted support {index}.",
            }
            for index in range(1, 4)
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
    mock_db.create_task_output.return_value = {"id": "summary-output"}

    mock_supadata = AsyncMock()
    mock_vp = AsyncMock()
    mock_transcriber = AsyncMock()

    mock_summarizer = MagicMock()
    mock_summarizer.summarize = AsyncMock()
    mock_summarizer.optimize_transcript = AsyncMock()
    mock_summarizer.fast_clean_transcript = MagicMock(side_effect=lambda x: x)

    patches = {
        "_get_db_client": mock_db,
        "_get_supadata_client": mock_supadata,
        "_get_video_processor": mock_vp,
        "_get_transcriber": mock_transcriber,
        "_get_summarizer": mock_summarizer,
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
    async def test_catalog_cache_hit_with_one_locale_continues_to_cognition(self, mock_db):
        mock_db.find_latest_task_with_valid_script_for_owner.return_value = {
            "id": str(uuid4()),
            "video_title": "Cached catalog episode",
            "thumbnail_url": "https://example.com/cover.jpg",
        }
        mock_db.get_task.return_value = {
            "progress": 0,
            "workload_kind": "catalog_supply",
        }
        mock_db.get_task_outputs.return_value = [
            {
                "kind": OutputKind.SCRIPT,
                "status": TaskStatus.COMPLETED,
                "content": "English transcript text",
                "locale": None,
            },
            {
                "kind": OutputKind.SCRIPT_RAW,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps({"language": "en"}),
                "locale": None,
            },
            {
                "kind": OutputKind.SUMMARY,
                "status": TaskStatus.COMPLETED,
                "content": json.dumps(_valid_summary_payload("Cached English overview")),
                "locale": "en",
            },
        ]

        result = await check_cache(_make_state())

        assert result["cache_hit"] is True
        assert result.get("final_summary_json") is None
        assert route_after_cache(result) == "cognition"

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
        await ingest(state)

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
    """Test the single default cognition step: summary generation."""

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
    async def test_summary_succeeds(self, mock_summarizer):
        """A valid transcript produces the single user-facing summary."""
        transcript = "Long enough transcript for analysis to proceed. " * 10
        mock_summarizer.summarize.return_value = MockModel(_valid_summary_payload("Great summary"))

        state = _make_state(transcript_text=transcript)
        result = await cognition(state)

        assert result["final_summary_json"]["overview"] == "Great summary"
        assert "errors" not in result or len(result.get("errors", [])) == 0
        mock_summarizer.summarize.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_summary_uses_persisted_explicit_locale(self, mock_db, mock_summarizer):
        transcript = "Long enough English transcript for analysis to proceed. " * 10
        mock_db.get_task.return_value = {
            "progress": 0,
            "output_intent": {
                "target_locale": "zh",
                "locale_source": "explicit_instruction",
            },
        }
        mock_db.get_task_outputs.return_value = [
            {"id": "summary-zh", "kind": "summary", "locale": "zh"},
        ]
        mock_summarizer.summarize.return_value = MockModel({
            **_valid_summary_payload("中文摘要"),
            "language": "zh",
        })

        result = await cognition(_make_state(transcript_text=transcript, transcript_lang="en"))

        assert result["final_summary_json"]["overview"] == "中文摘要"
        assert mock_summarizer.summarize.call_args.kwargs["target_language"] == "zh"
        assert mock_db.update_output_status.call_args.args[0] == "summary-zh"
        assert mock_db.update_output_status.call_args.kwargs["locale"] == "zh"

    @pytest.mark.asyncio
    async def test_catalog_summary_generates_english_and_chinese_outputs(
        self, mock_db, mock_summarizer
    ):
        transcript = "Long enough English transcript for analysis to proceed. " * 10
        mock_db.get_task.return_value = {
            "progress": 0,
            "workload_kind": "catalog_supply",
            "output_intent": {"target_locale": "en"},
        }
        mock_db.get_task_outputs.return_value = [
            {"id": "summary-en", "kind": "summary", "locale": "en", "status": "pending"},
            {"id": "summary-zh", "kind": "summary", "locale": "zh", "status": "pending"},
        ]
        mock_summarizer.summarize.side_effect = [
            MockModel(_valid_catalog_summary_payload("en")),
            MockModel(_valid_catalog_summary_payload("zh")),
        ]

        result = await cognition(
            _make_state(transcript_text=transcript, transcript_lang="en")
        )

        assert result["final_summary_json"]["language"] == "en"
        assert [
            call.kwargs["target_language"]
            for call in mock_summarizer.summarize.await_args_list
        ] == ["en", "zh"]
        completed_calls = [
            call
            for call in mock_db.update_output_status.call_args_list
            if call.kwargs.get("status") == TaskStatus.COMPLETED
        ]
        assert [call.args[0] for call in completed_calls] == ["summary-en", "summary-zh"]
        assert [call.kwargs["locale"] for call in completed_calls] == ["en", "zh"]
        assert all(
            call.kwargs["intent"]["locale_source"] == "catalog_bilingual"
            for call in completed_calls
        )

    @pytest.mark.asyncio
    async def test_catalog_summary_reuses_completed_locale_and_generates_missing_locale(
        self, mock_db, mock_summarizer
    ):
        transcript = "Long enough English transcript for analysis to proceed. " * 10
        mock_db.get_task.return_value = {
            "progress": 0,
            "workload_kind": "catalog_supply",
            "output_intent": {"target_locale": "en"},
        }
        mock_db.get_task_outputs.return_value = [
            {
                "id": "summary-en",
                "kind": "summary",
                "locale": "en",
                "status": "completed",
                "content": json.dumps(_valid_catalog_summary_payload("en")),
            },
            {"id": "summary-zh", "kind": "summary", "locale": "zh", "status": "pending"},
        ]
        mock_summarizer.summarize.return_value = MockModel(
            _valid_catalog_summary_payload("zh")
        )

        result = await cognition(
            _make_state(transcript_text=transcript, transcript_lang="en")
        )

        assert result["final_summary_json"]["language"] == "en"
        mock_summarizer.summarize.assert_awaited_once()
        assert mock_summarizer.summarize.call_args.kwargs["target_language"] == "zh"
        assert mock_db.update_output_status.call_args.args[0] == "summary-zh"

    @pytest.mark.asyncio
    async def test_summary_failure_marks_summary_output_error(self, mock_db, mock_summarizer):
        """A summary error is recorded and its output becomes terminally failed."""
        transcript = "Summary failure test with enough content here. " * 10
        mock_summarizer.summarize.side_effect = Exception("Token limit exceeded")

        state = _make_state(transcript_text=transcript)
        result = await cognition(state)

        assert any("Token limit" in e for e in result.get("errors", []))
        # Summary DB output should be marked as error
        error_calls = [
            c for c in mock_db.update_output_status.call_args_list
            if c.args[0] == "summary-output" and c.kwargs.get("status") == TaskStatus.ERROR
        ]
        assert len(error_calls) > 0


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


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_locale", [None, "zh", "en"])
async def test_catalog_cache_only_skips_generation_for_two_valid_summaries(mock_db, invalid_locale):
    mock_db.find_latest_task_with_valid_script_for_owner.return_value = {"id": "cached", "video_title": "Cached"}
    mock_db.get_task.return_value = {"workload_kind": "catalog_supply", "progress": 0}
    outputs = [{"kind": "script", "status": "completed", "content": "Shared source", "locale": None}]
    for locale in ("en", "zh"):
        payload = _valid_catalog_summary_payload(locale)
        if locale == invalid_locale:
            payload["keypoints"] = []
        outputs.append({"kind": "summary", "status": "completed", "locale": locale, "content": json.dumps(payload)})
    mock_db.get_task_outputs.return_value = outputs
    result = await check_cache(_make_state())
    assert route_after_cache(result) == ("cognition" if invalid_locale else "cleanup")
    copied_locales = [c.kwargs["locale"] for c in mock_db.upsert_completed_task_output.call_args_list if c.args[2] == "summary"]
    assert copied_locales == [locale for locale in ("en", "zh") if locale != invalid_locale]


@pytest.mark.asyncio
async def test_catalog_second_language_failure_preserves_completed_english(mock_db, mock_summarizer):
    mock_db.get_task.return_value = {"workload_kind": "catalog_supply", "output_intent": {"target_locale": "en"}, "progress": 0}
    mock_db.get_task_outputs.return_value = [
        {"id": f"summary-{locale}", "kind": "summary", "locale": locale, "status": "pending"}
        for locale in ("en", "zh")
    ]
    mock_summarizer.summarize.side_effect = [
        MockModel(_valid_catalog_summary_payload("en")),
        MockModel(_valid_catalog_summary_payload("en")),
    ]
    result = await cognition(_make_state(transcript_text="Shared transcript with enough context. " * 20, transcript_lang="en"))
    assert result.get("errors")
    status_calls = [(c.args[0], c.kwargs.get("status")) for c in mock_db.update_output_status.call_args_list]
    assert ("summary-en", TaskStatus.COMPLETED) in status_calls
    assert ("summary-zh", TaskStatus.ERROR) in status_calls
    assert ("summary-en", TaskStatus.ERROR) not in status_calls
