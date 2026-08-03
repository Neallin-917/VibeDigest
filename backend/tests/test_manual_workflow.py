import asyncio
import sys
import logging
from typing import cast
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Setup path and env
sys.path.append(str(Path(__file__).parent.parent))

# Configure simplified logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# We need to import after sys.path is set, but we also want to patch BEFORE main logic runs if possible.
# Ideally we patch the module 'workflow' where these instances are.
from workflow import app, VideoProcessingState  # noqa: E402

async def test_workflow_mocked():
    print("--- Starting Mocked Workflow Test ---")

    # 1. Setup Mocks
    mock_db = MagicMock()
    mock_vp = AsyncMock()
    mock_transcriber = AsyncMock()
    mock_summarizer = MagicMock()
    mock_supadata = AsyncMock()

    with patch('workflow._get_db_client', return_value=mock_db), \
         patch('workflow._get_video_processor', return_value=mock_vp), \
         patch('workflow._get_transcriber', return_value=mock_transcriber), \
         patch('workflow._get_summarizer', return_value=mock_summarizer), \
         patch('workflow._get_supadata_client', return_value=mock_supadata):

        # --- Mock Supadata ---
        mock_supadata.get_transcript_async = AsyncMock(return_value=(None, None, None)) # Force fallback to download

        # --- Mock DB Behaviors ---
        mock_db.find_latest_completed_task_by_url.return_value = None  # Cache Miss

        # Mock get_task_outputs to return placeholders needed by nodes
        # Each node looks for specific kinds.
        mock_outputs = [
            {"id": "out-script", "kind": "script", "status": "pending", "locale": "en"},
            {"id": "out-raw", "kind": "script_raw", "status": "pending", "locale": "en"},
            {"id": "out-class", "kind": "classification", "status": "pending", "locale": "en"},
            {"id": "out-sum", "kind": "summary", "status": "pending", "locale": "en"},
            {"id": "out-audio", "kind": "audio", "status": "pending", "locale": "en"},
        ]
        mock_db.get_task_outputs.return_value = mock_outputs

        # --- Mock Video Processor ---
        mock_vp.extract_info_only = AsyncMock(return_value={
            "title": "Mock Video Title",
            "thumbnail": "http://thumb.url",
            "author": "Mock Author",
            "duration": 120,
            "audio_url": None
        })
        # Mock download_and_convert return: (audio_path, title, thumb, direct_url, meta)
        mock_vp.download_and_convert = AsyncMock(return_value=(
            "mock_audio.mp3",
            "Mock Video Title",
            "http://thumb.url",
            None,
            {"duration": 120, "author": "Mock Author"}
        ))

        # --- Mock Transcriber ---
        # Return: (script_md, raw_json, lang)
        mock_transcriber.transcribe_with_raw = AsyncMock(return_value=(
            "Mock transcript text with timestamps.",
            '{"segments": []}',
            "en"
        ))

        # --- Mock Summarizer ---
        # Mock class methods
        # IMPORTANT: Must be >50 chars to pass 'Smart Skip' in cognition node
        long_transcript = "Optimized mock transcript. " * 3
        mock_summarizer.optimize_transcript = AsyncMock(return_value=long_transcript)
        # Workflow calls .summarize() which internally might call others, but we should mock the entry point used by workflow.py
        mock_summarizer.summarize = AsyncMock(return_value={
            "version": 4,
            "language": "en",
            "overview": "Mock summary",
            "keypoints": [
                {
                    "title": "Mock insight",
                    "detail": "A deterministic summary for the workflow test.",
                    "evidence": "Optimized mock transcript.",
                }
            ],
            "sections": [],
        })
        mock_summarizer.summarize_in_language_with_anchors = AsyncMock(return_value='{"overview": "Mock summary"}')

        # --- Initial State ---
        initial_state = cast(VideoProcessingState, {
            "task_id": "test-task-123",
            "user_id": "test-user-456",
            "video_url": "https://youtube.com/watch?v=mock",
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
        })

        print(f"Running workflow for: {initial_state['video_url']}")

        # 2. Run Workflow
        final_state = await app.ainvoke(initial_state)

        # 3. Validation
        print("\n--- Workflow Finished ---")
        print(f"Final Transcript: {final_state.get('transcript_text')}")
        print(f"Final Summary: {final_state.get('final_summary_json')}")
        print(f"Errors: {final_state.get('errors')}")

        # Assertions
        assert final_state.get("transcript_text") == long_transcript
        assert final_state.get("final_summary_json") is not None
        print("\n✅ Verification SUCCESS: Graph executed all nodes correctly.")

if __name__ == "__main__":
    asyncio.run(test_workflow_mocked())
