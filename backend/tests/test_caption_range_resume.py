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


async def download_track(monkeypatch, url, open_request, finalized, *, retries):
    def download(self, urls):
        self.params.update(retries=retries, noprogress=True)
        metadata = {"id": "fixture", "title": "fixture", "ext": "mp4"}
        formats = {"zh-Hans": [{"url": url, "ext": "vtt"}]}
        metadata["requested_subtitles"] = self.process_subtitles("fixture", {}, formats)
        tracks = self._write_subtitles(metadata, self.prepare_filename(metadata))
        finalized.extend(Path(path).read_bytes() for path, _ in tracks)

    monkeypatch.setattr(CaptionYoutubeDL, "urlopen", open_request)
    monkeypatch.setattr(CaptionYoutubeDL, "download", download)
    return await VideoProcessor().extract_captions(
        "https://www.youtube.com/watch?v=fixture"
    )


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
                InterruptedBody(full[:cut]),
                url,
                {"Content-Length": str(len(full)), "ETag": '"release-1"'},
            )
        assert requested == f"bytes={cut}-"
        assert request.headers["If-Range"] == '"release-1"'
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
        return Response(
            io.BytesIO(full),
            url,
            {"Content-Length": str(len(full)), "ETag": '"release-1"'},
        )

    result = await download_track(monkeypatch, url, open_request, finalized, retries=1)

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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "first_tag",
    ['"edition-one"', 'W/"edition-one"', None],
    ids=["changed-strong", "weak", "missing"],
)
@pytest.mark.parametrize(
    "interrupt_replacement", [False, True], ids=["new-file", "resume-new-file"]
)
async def test_retry_uses_current_edition_and_its_validator(
    tmp_path, monkeypatch, first_tag, interrupt_replacement
):
    monkeypatch.chdir(tmp_path)
    url = "https://fixture.invalid/updated.vtt"

    def caption(word):
        return (
            "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n" + word * 1500 + "\n"
        ).encode()

    original = caption("甲")
    replacement = caption("乙")
    second_tag = '"edition-two"'
    requests = []
    finalized = []
    first_cut, second_cut = 1400, 2100

    def open_request(self, request):
        byte_range = request.headers.get("Range")
        condition = request.headers.get("If-Range")
        requests.append((byte_range, condition))
        if len(requests) == 1:
            headers = {"Content-Length": str(len(original))}
            if first_tag:
                headers["ETag"] = first_tag
            return Response(InterruptedBody(original[:first_cut]), url, headers)
        if len(requests) == 2:
            # The resource has changed. The server returns the complete replacement.
            body = (
                InterruptedBody(replacement[:second_cut])
                if interrupt_replacement
                else io.BytesIO(replacement)
            )
            return Response(
                body, url, {"ETag": second_tag, "Content-Length": str(len(replacement))}
            )
        suffix = replacement[second_cut:]
        return Response(
            io.BytesIO(suffix),
            url,
            {
                "ETag": second_tag,
                "Content-Range": f"bytes {second_cut}-{len(replacement) - 1}/{len(replacement)}",
                "Content-Length": str(len(suffix)),
            },
            status=206,
        )

    result = await download_track(monkeypatch, url, open_request, finalized, retries=2)
    expected = [(None, None)]
    expected.append(
        (f"bytes={first_cut}-", first_tag)
        if first_tag == '"edition-one"'
        else (None, None)
    )
    if interrupt_replacement:
        expected.append((f"bytes={second_cut}-", second_tag))
    assert requests == expected
    assert finalized == [replacement]
    assert result is not None
    assert json.loads(result[1])["segments"][0]["text"] == "乙" * 1500
    assert list((tmp_path / "temp/subs").iterdir()) == []
