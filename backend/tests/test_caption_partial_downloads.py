import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import yt_dlp

from services.video_processor import VideoProcessor


URL = "https://www.youtube.com/watch?v=caption-test"
LANGUAGES = ["en", "zh", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW"]
ENGLISH = b"WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nAn English line.\n"
CHINESE = "WEBVTT\n\n00:00:04.000 --> 00:00:06.000\n中文字幕。\n".encode()


@pytest.fixture
def download(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    sub_dir = Path("temp/subs")
    sub_dir.mkdir(parents=True)
    other = sub_dir / "other-run.en.vtt"
    other.write_bytes(b"independent download")
    processor = VideoProcessor()
    monkeypatch.setattr(processor, "_ydl_overrides", lambda: {})

    async def run(files, *, error=False):
        factory = MagicMock()
        downloader = factory.return_value.__enter__.return_value

        def write_tracks(urls):
            assert urls == [URL]
            template = factory.call_args.args[0]["outtmpl"]
            for suffix, body in files:
                Path(f"{template}.{suffix}").write_bytes(body)
            if error:
                raise yt_dlp.utils.DownloadError("HTTP Error 429: Too Many Requests")
            return 0

        downloader.download.side_effect = write_tracks
        monkeypatch.setattr(yt_dlp, "YoutubeDL", factory)
        result = await processor.extract_captions(URL)

        factory.assert_called_once()
        downloader.download.assert_called_once_with([URL])
        options = factory.call_args.args[0]
        assert options["skip_download"] is True
        assert options["noplaylist"] is True
        assert options["subtitlesformat"] == "vtt"
        assert options["subtitleslangs"] == LANGUAGES
        assert options["writesubtitles"] and options["writeautomaticsub"]
        assert other.read_bytes() == b"independent download"
        assert list(sub_dir.iterdir()) == [other]
        return result

    return run


def assert_english(result):
    assert result is not None
    markdown, raw, lang = result
    assert markdown == "[1.00-3.00] An English line."
    assert lang == "en"
    payload = json.loads(raw)
    assert payload["source_timed"] is True
    assert payload["language"] == lang
    assert payload["segments"] == [
        {"start": 1.0, "end": 3.0, "text": "An English line."}
    ]


@pytest.mark.asyncio
async def test_completed_english_survives_later_rate_limit(download):
    assert_english(
        await download([("en.vtt", ENGLISH), ("zh-Hans.vtt.part", CHINESE)], error=True)
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "broken",
    [
        b"",
        b"WEBVTT\n\nnot a timed cue",
        b"\xff\xfe",
        b"WEBVTT\n\n00:00:04.000 --> 00:00:01.000\nBackward cue.\n",
    ],
)
async def test_unusable_preferred_track_does_not_hide_english(download, broken):
    assert_english(await download([("en.vtt", ENGLISH), ("zh-Hans.vtt", broken)]))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "files",
    [
        [("en.vtt.part", ENGLISH)],
        [("en.vtt", b"broken"), ("zh.vtt", b"")],
        [],
    ],
    ids=["partial-only", "all-unusable", "no-output"],
)
async def test_no_completed_usable_caption_returns_none_and_cleans_up(download, files):
    assert await download(files, error=True) is None


@pytest.mark.asyncio
async def test_successful_download_preserves_usable_language_priority(download):
    result = await download([("en.vtt", ENGLISH), ("zh-Hans.vtt", CHINESE)])
    assert result is not None
    markdown, raw, lang = result
    assert lang == "zh"
    assert markdown == "[4.00-6.00] 中文字幕。"
    assert json.loads(raw)["segments"] == [
        {"start": 4.0, "end": 6.0, "text": "中文字幕。"}
    ]
