import unittest
from unittest.mock import MagicMock, AsyncMock, patch
from typing import cast
import sys
import os
from uuid import uuid4
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# Patch external dependencies (Must happen before workflow import if possible, or patch modules)
# Since workflow uses getter functions, we patch them in setUp

import workflow
from workflow import ingest, cognition, build_graph, VideoProcessingState

class TestWorkflow(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        # Setup common mocks
        self.mock_db = MagicMock()
        self.mock_db.get_task_outputs.return_value = []

        self.mock_supadata = AsyncMock()
        self.mock_vp = AsyncMock()
        self.mock_transcriber = AsyncMock()

        # Use MagicMock as base, then attach AsyncMocks for async methods
        self.mock_summarizer = MagicMock()
        self.mock_summarizer.classify_content = AsyncMock()
        self.mock_summarizer.summarize = AsyncMock()
        self.mock_summarizer.optimize_transcript = AsyncMock()
        self.mock_summarizer.fast_clean_transcript = MagicMock(side_effect=lambda x: x)
        self.mock_comprehension = AsyncMock()
        self.mock_comprehension.generate_comprehension_brief = AsyncMock(return_value='{"brief": "ok"}')

        # Patch getter functions to return our mocks
        for attr, mock in [
            ('_get_db_client', self.mock_db),
            ('_get_supadata_client', self.mock_supadata),
            ('_get_video_processor', self.mock_vp),
            ('_get_transcriber', self.mock_transcriber),
            ('_get_summarizer', self.mock_summarizer),
            ('_get_comprehension_agent', self.mock_comprehension),
        ]:
            p = patch(f'workflow.{attr}', return_value=mock)
            p.start()
            self.addCleanup(p.stop)

    async def test_ingest_supadata_success(self):
        """Test Ingest strategy: Supadata"""
        print("\nRunning test_ingest_supadata_success...")
        # Setup
        self.mock_supadata.get_transcript_async.return_value = ("MD Content", "JSON Raw", "en")
        self.mock_vp.extract_info_only.return_value = {"title": "Test Video", "thumbnail": "url"}

        state = cast(VideoProcessingState, {
            "task_id": str(uuid4()),
            "user_id": str(uuid4()),
            "video_url": "https://www.youtube.com/watch?v=test",
            "is_youtube": True,
            "video_title": "",
            "thumbnail_url": ""
        })

        updates = await ingest(state)

        self.assertEqual(updates["transcript_source"], "supadata")
        self.assertEqual(updates["transcript_text"], "MD Content")
        # Check DB calls
        self.mock_db.ensure_task_outputs.assert_called()

    async def test_ingest_whisper_fallback(self):
        """Test Ingest strategy: Whisper fallback"""
        print("\nRunning test_ingest_whisper_fallback...")
        # Fail others
        self.mock_supadata.get_transcript_async.return_value = (None, None, None)
        self.mock_vp.extract_captions.return_value = None
        # Mock extract_info_only to return a dict (avoid AsyncMock return which causes warnings)
        self.mock_vp.extract_info_only.return_value = {"title": "Whisper Video", "thumbnail": "thumb"}

        # Whisper Success
        self.mock_vp.download_and_convert.return_value = ("audio.mp3", "Whisper Title", "thumb", None, {})
        self.mock_transcriber.transcribe_with_raw.return_value = ("Whisper Text", "Raw", "en")
        self.mock_summarizer.optimize_transcript.return_value = "Cleaned Whisper Test"

        state = cast(VideoProcessingState, {
            "task_id": str(uuid4()),
            "user_id": str(uuid4()),
            "video_url": "https://example.com/video",
            "is_youtube": False,
            "video_title": "",
            "thumbnail_url": ""
        })

        updates = await ingest(state)

        self.assertEqual(updates["transcript_source"], "whisper")
        self.assertEqual(updates["transcript_text"], "Cleaned Whisper Test")

    class MockModel:
        def __init__(self, data): self.data = data
        def model_dump(self): return self.data
        def model_dump_json(self): return json.dumps(self.data)

    def valid_summary(self, overview: str) -> dict:
        return {
            "version": 4,
            "language": "en",
            "tl_dr": "Short take.",
            "overview": overview,
            "keypoints": [
                {
                    "title": "Point A",
                    "detail": "Important detail.",
                    "evidence": "Quoted support.",
                }
            ],
        }

    async def test_cognition_parallel(self):
        """Test Cognition executed in parallel"""
        print("\nRunning test_cognition_parallel...")
        # Setup Mocks to return objects with model_dump
        self.mock_summarizer.classify_content.return_value = self.MockModel({"category": "Tech"})
        self.mock_summarizer.summarize.return_value = self.MockModel(self.valid_summary("Summary"))

        state = cast(VideoProcessingState, {
            "task_id": str(uuid4()),
            "user_id": str(uuid4()),
            "video_url": "http://test",
            "transcript_text": "Long enough transcript for analysis to proceed execution." * 10
        })

        updates = await cognition(state)

        self.assertIn("classification_result", updates)
        self.assertIn("final_summary_json", updates)
        self.assertTrue(self.mock_summarizer.classify_content.called)
        self.assertTrue(self.mock_summarizer.summarize.called)

    async def test_full_graph_integration(self):
        """Test the full graph flow: Cache Miss -> Ingest -> Cognition"""
        print("\nRunning test_full_graph_integration...")
        # Setup Mocks for happy path
        self.mock_db.find_latest_completed_task_by_url.return_value = None # Cache miss
        # Use a LONG transcript to ensure Smart Skip doesn't trigger
        long_transcript = "Graph MD Content " * 20
        self.mock_supadata.get_transcript_async.return_value = (long_transcript, "{}", "en")
        self.mock_vp.extract_info_only.return_value = {"title": "Graph Video", "thumbnail": "img"}
        self.mock_summarizer.classify_content.return_value = self.MockModel({"cat": "test"})
        self.mock_summarizer.summarize.return_value = self.MockModel(self.valid_summary("Graph summary"))

        app = build_graph()

        inputs = cast(VideoProcessingState, {
            "task_id": str(uuid4()),
            "user_id": str(uuid4()),
            "video_url": "https://youtube.com/graph_test",
            "is_youtube": True,
            "cache_hit": False,
            "errors": [],
            "video_title": "",
            "thumbnail_url": "",
            "author": "",
            "duration": 0
        })

        # We need to mock 'check_cache' effectively.
        # workflow.check_cache uses db_client.find... which we mocked.

        final_state = await app.ainvoke(inputs)

        print(f"DEBUG: Final State Keys: {final_state.keys()}")
        print(f"DEBUG: Final State Content: {final_state}")

        self.assertEqual(final_state["transcript_text"], long_transcript)
        self.assertEqual(final_state["classification_result"], {"cat": "test"})
        # Should have run through ingest and cognition
        self.assertTrue(self.mock_supadata.get_transcript_async.called)
        self.assertTrue(self.mock_summarizer.summarize.called)
        print("Integration executed successfully.")

if __name__ == '__main__':
    unittest.main()
