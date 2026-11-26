"""Exercise the real HTTP subtitle downloader with in-memory transport responses."""

import io
import json
from pathlib import Path

import pytest
from yt_dlp.networking import Response
from yt_dlp.networking.exceptions import TransportError

from services.caption_downloader import CaptionYoutubeDL
from services.video_processor import VideoProcessor


class InterruptedBody(io.BytesIO):
    def read(self, size=-1):
        data = super().read(size)
        if not data:
            raise TransportError("connection closed before end of body")
        return data


@pytest.mark.parametrize("recovery", ["206-resume", "200-restart", "206-interrupted"])
@pytest.mark.asyncio
async def test_caption_retry_uses_only_complete_utf8_cues(
    tmp_path, monkeypatch, recovery
):
    monkeypatch.chdir(tmp_path)
    # The first response cuts the second cue inside a multibyte character.
    first = "测试字幕" * 150
    second = "字幕恢复"
    full = (
        f"WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n{first}\n\n"
        f"00:00:03.000 --> 00:00:04.000\n{second}\n"
    ).encode()
    cut = full.index(second.encode()) + 1
    requests = []
    finalized = []
    url = "https://fixture.invalid/captions.vtt"

    def open_request(self, request):
        requested = request.headers.get("Range")
        requests.append(requested)
        if len(requests) == 1:
            return Response(
                InterruptedBody(full[:cut]), url, {"Content-Length": str(len(full))}
            )
        assert requested == f"bytes={cut}-"
        if recovery != "200-restart":
            body = (
                InterruptedBody(full[cut : cut + 2])
                if recovery == "206-interrupted"
                else io.BytesIO(full[cut:])
            )
            return Response(
                body,
                url,
                {
                    "Content-Range": f"bytes {cut}-{len(full) - 1}/{len(full)}",
                    "Content-Length": str(len(full) - cut),
                },
                status=206,
            )
        return Response(io.BytesIO(full), url, {"Content-Length": str(len(full))})

    def download(self, urls):
        self.params.update(retries=1, noprogress=True)
        metadata = {"id": "fixture", "title": "fixture", "ext": "mp4"}
        formats = {"zh-Hans": [{"url": url, "ext": "vtt"}]}
        metadata["requested_subtitles"] = self.process_subtitles("fixture", {}, formats)
        tracks = self._write_subtitles(metadata, self.prepare_filename(metadata))
        finalized.extend(Path(path).read_bytes() for path, _ in tracks)

    monkeypatch.setattr(CaptionYoutubeDL, "urlopen", open_request)
    monkeypatch.setattr(CaptionYoutubeDL, "download", download)
    result = await VideoProcessor().extract_captions(
        "https://www.youtube.com/watch?v=fixture"
    )

    assert requests == [None, f"bytes={cut}-"]
    assert list((tmp_path / "temp/subs").iterdir()) == []
    if recovery == "206-interrupted":
        assert result is None
        assert finalized == []
        return
    assert finalized == [full]
    assert result is not None
    markdown, raw, language = result
    assert language == "zh"
    assert markdown == f"[1.00-2.00] {first}\n\n[3.00-4.00] {second}"
    assert json.loads(raw)["segments"] == [
        {"start": 1.0, "end": 2.0, "text": first},
        {"start": 3.0, "end": 4.0, "text": second},
    ]
