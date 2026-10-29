import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from services.video_intake import VideoIntakeGateway, VideoIntakeOptions


def _raw(segments, language="en"):
    return json.dumps({"language": language, "segments": segments})


class FakeSupadata:
    last_error = None

    def __init__(self, result):
        self.result = result

    async def get_transcript_async(self, url):
        return self.result


class FakeVideoProcessor:
    def __init__(self, *, captions=None, metadata=None):
        self.captions = captions
        self.metadata = metadata or {
            "title": "Test Video",
            "thumbnail": "https://example.com/thumb.jpg",
            "duration": 123,
            "author": "Author",
            "author_url": "https://example.com/author",
            "audio_url": "https://example.com/audio.m4a",
        }

    async def extract_info_only(self, url):
        return self.metadata

    async def extract_captions(self, url):
        return self.captions

    async def download_and_convert(self, url, temp_dir):
        return str(Path(temp_dir) / "audio.m4a"), "Test Video", None, None, {}


class FakeTranscriber:
    async def transcribe_with_raw(self, audio_path):
        return (
            "**[00:00]**\n\nASR text",
            _raw([{"start": 0, "end": 3, "text": "ASR text"}]),
            "en",
        )


@pytest.mark.asyncio
async def test_gateway_prefers_supadata_for_youtube():
    gateway = VideoIntakeGateway(
        supadata_client=FakeSupadata(
            (
                "**[00:00]**\n\nProvider text",
                _raw([{"start": 0, "end": 2, "text": "Provider text"}]),
                "en",
            )
        ),
        video_processor=FakeVideoProcessor(),
        transcriber=FakeTranscriber(),
    )

    result = await gateway.get_video_context(
        VideoIntakeOptions(url="https://www.youtube.com/watch?v=abc&utm_source=x")
    )

    assert result.normalized_url == "https://youtube.com/watch?v=abc"
    assert result.source == "supadata"
    assert result.quality == "provider"
    assert result.status == "completed"
    assert result.transcript[0].text == "Provider text"
    assert result.metadata["title"] == "Test Video"
    assert result.attempts[1].provider == "supadata"
    assert result.attempts[1].status == "success"


@pytest.mark.asyncio
async def test_gateway_falls_back_to_vtt_when_supadata_has_no_content():
    supadata = FakeSupadata((None, None, None))
    supadata.last_error = "Supadata missing key"
    gateway = VideoIntakeGateway(
        supadata_client=supadata,
        video_processor=FakeVideoProcessor(
            captions=(
                "**[00:00]**\n\nCaption text",
                _raw([{"start": 0, "duration": 4, "text": "Caption text"}], language="zh"),
                "zh",
            )
        ),
        transcriber=FakeTranscriber(),
    )

    result = await gateway.get_video_context(VideoIntakeOptions(url="https://youtu.be/abc"))

    assert result.source == "vtt"
    assert result.quality == "caption"
    assert result.language == "zh"
    assert result.transcript[0].end == 4
    assert [attempt.provider for attempt in result.attempts] == ["metadata", "supadata", "vtt"]


@pytest.mark.asyncio
async def test_gateway_returns_partial_context_when_no_captions_are_available():
    gateway = VideoIntakeGateway(
        supadata_client=FakeSupadata((None, None, None)),
        video_processor=FakeVideoProcessor(captions=None),
        transcriber=FakeTranscriber(),
    )

    result = await gateway.get_video_context(VideoIntakeOptions(url="https://youtube.com/watch?v=abc"))

    assert result.status == "partial"
    assert result.source == "none"
    assert result.quality == "missing"
    assert result.transcript == []
    assert result.errors == ["No usable captions are available. Audio transcription is not supported."]
    assert [attempt.provider for attempt in result.attempts] == ["metadata", "supadata", "vtt"]


@pytest.mark.asyncio
async def test_legacy_asr_option_cannot_download_audio_or_transcribe():
    processor = FakeVideoProcessor(captions=None)
    processor.download_and_convert = AsyncMock(side_effect=AssertionError("Audio download is disabled"))
    transcriber = FakeTranscriber()
    transcriber.transcribe_with_raw = AsyncMock(side_effect=AssertionError("ASR is disabled"))
    gateway = VideoIntakeGateway(
        supadata_client=FakeSupadata((None, None, None)),
        video_processor=processor,
        transcriber=transcriber,
    )

    result = await gateway.get_video_context(
        VideoIntakeOptions(url="https://youtube.com/watch?v=abc", allow_asr=True)
    )

    assert result.status == "partial"
    assert result.source == "none"
    assert result.quality == "missing"
    assert result.transcript == []
    assert "Audio transcription is not supported" in result.warnings[0]
    processor.download_and_convert.assert_not_awaited()
    transcriber.transcribe_with_raw.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("url", [
    "https://podcasts.apple.com/us/podcast/name/id123?i=456",
    "https://www.xiaoyuzhoufm.com/episode/abc",
    "https://www.bilibili.com/video/BV123",
    "https://youtube.com.evil.example/watch?v=abc",
    "https://youtube.com/playlist?list=abc",
])
async def test_unsupported_sources_are_rejected_before_any_provider_call(url):
    processor = FakeVideoProcessor()
    processor.extract_info_only = AsyncMock()
    processor.extract_captions = AsyncMock()
    processor.download_and_convert = AsyncMock()
    supadata = FakeSupadata((None, None, None))
    supadata.get_transcript_async = AsyncMock()
    gateway = VideoIntakeGateway(supadata_client=supadata, video_processor=processor)

    with pytest.raises(ValueError, match="Only YouTube videos with existing captions"):
        await gateway.get_video_context(VideoIntakeOptions(url=url, allow_asr=True))

    processor.extract_info_only.assert_not_awaited()
    processor.extract_captions.assert_not_awaited()
    processor.download_and_convert.assert_not_awaited()
    supadata.get_transcript_async.assert_not_awaited()
