import unittest
from unittest.mock import MagicMock, AsyncMock, patch
from typing import cast
import sys
import os
from uuid import uuid4
import pytest
from yt_dlp.utils import DownloadError

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

import workflow
from workflow import VideoProcessingState, build_graph
from services.video_processor import VideoProcessor
from utils.url import normalize_video_url

# Test Constants
BILIBILI_URL = "https://www.bilibili.com/video/BV1vizZBHEhS/?spm_id_from=333.1007.tianma.1-3-3.click"
APPLE_URL = "https://podcasts.apple.com/cn/podcast/vol-004-对话郭山汕-不入江湖-但要继续赢/id1862365307?i=1000748467496"

pytestmark = pytest.mark.asyncio


class TestBilibiliAppleIntegration(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Setup common mocks similar to TestWorkflow
        self.mock_db = MagicMock()
        self.mock_db.get_task_outputs.return_value = []

        self.mock_supadata = AsyncMock()

        self.mock_vp = AsyncMock()

        self.mock_transcriber = AsyncMock()

        self.mock_summarizer = MagicMock()
        self.mock_summarizer.classify_content = AsyncMock()
        self.mock_summarizer.summarize = AsyncMock()
        self.mock_summarizer.optimize_transcript = AsyncMock()
        self.mock_summarizer.fast_clean_transcript = MagicMock(side_effect=lambda x: x)

        # Patch getter functions instead of setting module-level attributes
        for attr, mock in [
            ('_get_db_client', self.mock_db),
            ('_get_supadata_client', self.mock_supadata),
            ('_get_video_processor', self.mock_vp),
            ('_get_transcriber', self.mock_transcriber),
            ('_get_summarizer', self.mock_summarizer),
        ]:
            p = patch(f'workflow.{attr}', return_value=mock)
            p.start()
            self.addCleanup(p.stop)

    @pytest.mark.xfail(reason="Bilibili spm_id_from stripping not implemented yet")
    def test_url_normalization_bilibili(self):
        """Test Bilibili URL normalization (stripping tracking params)"""
        normalized = normalize_video_url(BILIBILI_URL)

        self.assertNotIn("spm_id_from", normalized)
        self.assertIn("bilibili.com/video/BV1vizZBHEhS", normalized)

    def test_url_normalization_apple(self):
        """Test Apple Podcast URL normalization (preserving i parameter)"""
        normalized = normalize_video_url(APPLE_URL)

        self.assertIn("i=1000748467496", normalized)
        self.assertIn("podcasts.apple.com", normalized)

    def test_bilibili_is_not_youtube(self):
        """Verify Bilibili is NOT detected as YouTube"""
        normalized = normalize_video_url(BILIBILI_URL)
        is_yt = "youtube.com" in normalized or "youtu.be" in normalized
        self.assertFalse(is_yt, "Bilibili URL incorrectly identified as YouTube")

    def test_apple_is_not_youtube(self):
        """Verify Apple Podcast is NOT detected as YouTube"""
        normalized = normalize_video_url(APPLE_URL)
        is_yt = "youtube.com" in normalized or "youtu.be" in normalized
        self.assertFalse(is_yt, "Apple Podcast URL incorrectly identified as YouTube")

    async def test_bilibili_full_pipeline_uses_whisper(self):
        """Test Bilibili Full Pipeline (Mocked) -> Uses Whisper"""
        # Setup Mocks
        self.mock_db.find_latest_task_with_valid_script_for_owner.return_value = (
            None  # Cache miss
        )
        self.mock_vp.extract_info_only.return_value = {
            "title": "Bilibili Video",
            "thumbnail": "img",
            "duration": 100,
        }
        self.mock_vp.download_and_convert.return_value = (
            "audio.mp3",
            "Bilibili Title",
            "thumb",
            None,
            {},
        )
        self.mock_transcriber.transcribe_with_raw.return_value = (
            "Whisper Transcript",
            "{}",
            "zh",
        )
        self.mock_summarizer.optimize_transcript.return_value = "Optimized Transcript"
        self.mock_summarizer.classify_content.return_value = {
            "category": "Entertainment"
        }  # Simple dict return
        self.mock_summarizer.summarize.return_value = {
            "overview": "Summary",
            "keypoints": [],
        }

        app = build_graph()

        inputs = cast(
            VideoProcessingState,
            {
                "task_id": str(uuid4()),
                "user_id": str(uuid4()),
                "video_url": BILIBILI_URL,
                "is_youtube": False,
                "cache_hit": False,
                "errors": [],
                "video_title": "",
                "thumbnail_url": "",
                "author": "",
                "duration": 0,
                "transcript_text": None,
                "transcript_raw": None,
                "transcript_lang": "",
                "classification_result": None,
                "final_summary_json": None,
                "comprehension_brief_json": None,
                "audio_path": None,
                "direct_audio_url": None,
                "transcript_source": None,
                "ingest_error": None,
            },
        )

        final_state = await app.ainvoke(inputs)

        # Verify Whisper was called
        self.assertTrue(
            self.mock_transcriber.transcribe_with_raw.called, "Whisper should be called"
        )
        # Verify Supadata was NOT called
        self.assertFalse(
            self.mock_supadata.get_transcript_async.called,
            "Supadata should NOT be called for Bilibili",
        )
        # Verify state
        self.assertEqual(final_state["transcript_source"], "whisper")
        self.assertFalse(final_state["is_youtube"])

    @pytest.mark.network
    async def test_bilibili_metadata_extraction_real(self):
        """Test Real Bilibili Metadata Extraction (Network)"""
        vp = VideoProcessor()
        # We verify that yt-dlp can actually talk to Bilibili
        # using the real URL
        try:
            info = await vp.extract_info_only(BILIBILI_URL)
        except DownloadError as exc:
            # Bilibili may block CI egress IPs with 412/403 anti-bot responses.
            msg = str(exc)
            if "HTTP Error 412" in msg or "HTTP Error 403" in msg:
                pytest.skip(f"Bilibili blocked test environment: {msg}")
            raise

        self.assertIsNotNone(info)
        self.assertIn("title", info)
        self.assertTrue(info.get("duration", 0) > 0)
        # Bilibili specific check: Title usually exists
        print(f"Bilibili Title: {info.get('title')}")

    @pytest.mark.xfail(reason="Apple Podcast extraction via yt-dlp is currently broken")
    @pytest.mark.network
    async def test_apple_metadata_extraction_real(self):
        """Test Real Apple Podcast Metadata Extraction (Network)"""
        vp = VideoProcessor()

        info = await vp.extract_info_only(APPLE_URL)

        self.assertIsNotNone(info)
        self.assertIn("title", info)
        # Apple Podcasts usually return an audio file url in 'url' or 'audio_url'?
        # extract_info_only returns dict.
        print(f"Apple Podcast Title: {info.get('title')}")
