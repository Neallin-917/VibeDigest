from io import BytesIO
from unittest.mock import Mock

import pytest
from yt_dlp.networking import Response
from yt_dlp.networking.exceptions import HTTPError, TransportError
from yt_dlp.utils import DownloadError

from services.caption_downloader import CaptionYoutubeDL
from services.caption_errors import CaptionProviderUnavailable, caption_request_failure


@pytest.mark.parametrize("timeout", [False, True], ids=["http-503", "timeout"])
def test_terminal_http_downloader_report_retains_transport_type(
    tmp_path, monkeypatch, timeout
):
    url = "https://fixture.invalid/captions.vtt"
    error = (
        TransportError(cause=TimeoutError())
        if timeout
        else HTTPError(Response(BytesIO(), url, {}, status=503))
    )
    with CaptionYoutubeDL({"quiet": True, "retries": 0}) as downloader:
        open_request = Mock(side_effect=error)
        monkeypatch.setattr(downloader, "urlopen", open_request)
        with pytest.raises(DownloadError) as raised:
            downloader.dl(
                str(tmp_path / "track.vtt"), {"url": url, "ext": "vtt"}, subtitle=True
            )
    assert isinstance(caption_request_failure(raised.value), CaptionProviderUnavailable)
    open_request.assert_called_once()


def test_deliberately_requested_byte_slice_is_preserved(tmp_path, monkeypatch):
    url = "https://fixture.invalid/captions.vtt"
    content = b"subtitle archive"
    headers = []

    def send(request):
        headers.append((request.headers.get("Range"), request.headers.get("If-Range")))
        return Response(
            BytesIO(content[2:7]),
            url,
            {"Content-Length": "5", "Content-Range": f"bytes 2-6/{len(content)}"},
            status=206,
        )

    target = tmp_path / "slice"
    with CaptionYoutubeDL({"quiet": True, "retries": 0}) as downloader:
        monkeypatch.setattr(downloader, "urlopen", send)
        downloader.dl(
            str(target),
            {"url": url, "ext": "vtt", "http_headers": {"Range": "bytes=2-6"}},
            subtitle=True,
        )
    assert headers == [("bytes=2-6", None)]
    assert target.read_bytes() == content[2:7]
