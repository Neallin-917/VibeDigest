import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import cast
from workflow import ingest, cognition, cleanup, VideoProcessingState
from constants import TaskStatus

@pytest.mark.asyncio
async def test_ingest_failure_handling():
    """
    Test that ingest node handles exceptions by updating task status to 'error'.
    """
    # Setup State
    state = cast(VideoProcessingState, {
        "task_id": "test-task-failure",
        "user_id": "test-user",
        "video_url": "http://test.com/video",
        "audio_path": "/tmp/test.mp3",
        "errors": [],
        "cache_hit": False,
        "is_youtube": False,
        "transcript_text": None,
        "video_title": "",
        "thumbnail_url": "",
        "author": "",
        "duration": 0,
        "direct_audio_url": None,
        "transcript_raw": None,
        "transcript_lang": "en",
        "classification_result": None,
        "final_summary_json": None,
        "comprehension_brief_json": None,
        "transcript_source": None,
        "ingest_error": None
    })

    mock_db = MagicMock()
    mock_vp = AsyncMock()
    mock_supa = AsyncMock()
    mock_transcriber = AsyncMock()

    with patch('workflow._get_db_client', return_value=mock_db), \
         patch('workflow._get_video_processor', return_value=mock_vp), \
         patch('workflow._get_supadata_client', return_value=mock_supa), \
         patch('workflow._get_transcriber', return_value=mock_transcriber):

        # Mock Metadata extraction
        mock_vp.extract_info_only = AsyncMock(return_value={
            "title": "Test Video",
            "thumbnail": "http://thumb",
            "duration": 100
        })

        # Strategy 1 (Supadata) fails
        mock_supa.get_transcript_async = AsyncMock(side_effect=Exception("Supadata Failed"))

        # Strategy 2 (VTT) fails
        mock_vp.extract_captions = AsyncMock(side_effect=Exception("VTT Failed"))

        # Strategy 3 (Whisper) setup
        mock_vp.download_and_convert = AsyncMock(return_value=(
            "/tmp/test.mp3", "Test Video", "http://thumb", "http://audio", {"duration": 100}
        ))

        # Strategy 3 Transcribe fails
        mock_transcriber.transcribe_with_raw = AsyncMock(side_effect=Exception("Whisper Failed"))

        # Mock DB interactions
        mock_db.get_task_outputs.return_value = []

        # Execute Node
        updates = await ingest(state)

        # Verify Error Handling
        # The ingest node appends the error string to the errors list
        assert "errors" in updates or "ingest_error" in updates
        errors = updates.get("errors", [])
        # Also check ingest_error
        ingest_error = updates.get("ingest_error")

        has_whisper_error = "Whisper Failed" in str(ingest_error) if ingest_error else False
        if not has_whisper_error:
            has_whisper_error = any("Whisper Failed" in str(e) for e in errors)

        assert has_whisper_error, f"Expected 'Whisper Failed' in errors. Got: {errors}, ingest_error: {ingest_error}"

        # Verify DB Updates
        # Should have called update_task_status with status='error'
        error_calls = [
            c for c in mock_db.update_task_status.call_args_list
            if c.kwargs.get('status') == 'error' or c.kwargs.get('status') == TaskStatus.ERROR
        ]
        assert len(error_calls) >= 1
        assert "Whisper Failed" in error_calls[0].kwargs.get('error', '')

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
        "classification_result": None,
        "final_summary_json": None,
        "comprehension_brief_json": None,
        "transcript_source": None,
        "ingest_error": None
    })

    mock_db = MagicMock()
    mock_summarizer = MagicMock()

    with patch('workflow._get_db_client', return_value=mock_db), \
         patch('workflow._get_summarizer', return_value=mock_summarizer), \
         patch('workflow.settings') as mock_settings:

            # Force sequential execution to be deterministic
            mock_settings.COGNITION_SEQUENTIAL = True
            mock_settings.COGNITION_DELAY = 0

            # Mock Classify success
            mock_summarizer.classify_content = AsyncMock(return_value={"category": "Tech"})

            # Mock Summarize failure
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
        "classification_result": None,
        "final_summary_json": None,
        "comprehension_brief_json": None,
        "transcript_source": None,
        "ingest_error": None
    })

    mock_db = MagicMock()

    with patch('workflow._get_db_client', return_value=mock_db), \
         patch('workflow.event_bus.publish_progress', new=AsyncMock()), \
         patch('workflow.event_bus.publish_error', new=AsyncMock()):
        updates = await cleanup(state)

    assert updates == {}
    mock_db.update_task_status.assert_called_once()
    assert mock_db.update_task_status.call_args.kwargs['status'] == TaskStatus.ERROR
    assert mock_db.update_task_status.call_args.kwargs['progress'] == 100
