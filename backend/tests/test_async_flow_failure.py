import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import cast
from workflow import ingest, cognition, cleanup, VideoProcessingState
from constants import TaskStatus

@pytest.mark.asyncio
@pytest.mark.parametrize("provider_error", ["Supadata API rate-limited (429)", "Supadata API unavailable"])
async def test_ingest_caption_failure_is_atomic_and_never_downloads_audio(provider_error):
    state = cast(VideoProcessingState, {
        "task_id": "test-task-caption-failure", "user_id": "test-user",
        "video_url": "https://www.youtube.com/watch?v=test", "is_youtube": True,
        "errors": [], "transcript_text": None, "video_title": "", "thumbnail_url": "",
    })
    mock_db = MagicMock()
    mock_vp = AsyncMock()
    mock_vp.extract_info_only.return_value = {"title": "Test Video", "duration": 100}
    mock_vp.extract_captions.return_value = None
    mock_supa = MagicMock(last_error=provider_error)
    mock_supa.get_transcript_async = AsyncMock(return_value=(None, None, None))
    with patch('workflow._get_db_client', return_value=mock_db), \
         patch('workflow._get_video_processor', return_value=mock_vp), \
         patch('workflow._get_supadata_client', return_value=mock_supa):
        updates = await ingest(state)
    error = updates["ingest_error"]
    assert error.startswith("captions_unavailable:")
    assert "Audio transcription is not supported" in error
    assert provider_error not in error
    assert updates["errors"] == [error]
    mock_db.fail_caption_task.assert_called_once_with(state["task_id"], error)
    mock_vp.download_and_convert.assert_not_called()


@pytest.mark.asyncio
async def test_cognition_failure_handling():
    """
    Test that cognition node handles exceptions by returning them in errors list.
    """
    state = cast(VideoProcessingState, {
        "task_id": "test-task-sum-fail",
        "user_id": "test-user",
        "video_url": "http://test.com/video",
        "transcript_text": "Some text content that is long enough for analysis so it does not get skipped.",
        "video_title": "Test Video",
        "errors": [],
        "is_youtube": False,
        "cache_hit": False,
        "audio_path": None,
        "thumbnail_url": "",
        "author": "",
        "duration": 0,
        "direct_audio_url": None,
        "transcript_raw": None,
        "transcript_lang": "en",
        "final_summary_json": None,
        "transcript_source": None,
        "ingest_error": None
    })

    mock_db = MagicMock()
    mock_summarizer = MagicMock()

    with patch('workflow._get_db_client', return_value=mock_db), \
         patch('workflow._get_summarizer', return_value=mock_summarizer):

            # Mock summary failure.
            mock_summarizer.summarize = AsyncMock(side_effect=Exception("LLM Rate Limit"))

            # Mock DB interactions
            mock_db.get_task_outputs.return_value = []

            updates = await cognition(state)

            assert "errors" in updates
            assert any("LLM Rate Limit" in str(e) for e in updates["errors"])

            # Note: cognition returns the error in state, and cleanup is responsible
            # for marking the parent task as terminal error.

@pytest.mark.asyncio
async def test_cleanup_marks_parent_task_error_when_state_has_errors():
    state = cast(VideoProcessingState, {
        "task_id": "test-task-cleanup-error",
        "user_id": "test-user",
        "video_url": "http://test.com/video",
        "audio_path": None,
        "errors": ["summary failed"],
        "cache_hit": False,
        "is_youtube": False,
        "transcript_text": "long enough transcript",
        "video_title": "Test Video",
        "thumbnail_url": "",
        "author": "",
        "duration": 0,
        "direct_audio_url": None,
        "transcript_raw": None,
        "transcript_lang": "en",
        "final_summary_json": None,
        "transcript_source": None,
        "ingest_error": None
    })

    mock_db = MagicMock()

    with patch('workflow._get_db_client', return_value=mock_db):
        updates = await cleanup(state)

    assert updates == {}
    mock_db.update_task_status.assert_called_once()
    assert mock_db.update_task_status.call_args.kwargs['status'] == TaskStatus.ERROR
    assert mock_db.update_task_status.call_args.kwargs['progress'] == 100
