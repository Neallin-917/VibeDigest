"""Preserve subtitle revision identity and HTTP failure details during downloads."""
import re

from yt_dlp import YoutubeDL
from yt_dlp.downloader import get_suitable_downloader
from yt_dlp.downloader.http import HttpFD
from yt_dlp.utils import DownloadError


class _CaptionConnection:
    """Bind a whole-file subtitle retry to the representation that supplied its prefix."""

    def __init__(self, ydl):
        self._ydl = ydl
        self._etag = None

    def __getattr__(self, name):
        return getattr(self._ydl, name)

    def urlopen(self, request):
        if "Range" in request.headers:
            request = request.copy()
            if self._etag is not None:
                request.headers["If-Range"] = self._etag
            else:
                # Without a strong validator, request the complete current file.
                del request.headers["Range"]
                request.headers.pop("If-Range", None)
        response = self._ydl.urlopen(request)
        if response.status == 200:
            tag = response.headers.get("ETag", "")
            self._etag = tag if re.fullmatch(r'"[!#-~\x80-\xff]*"', tag) else None
        return response


class _CaptionHttpFD(HttpFD):
    def report_retry(self, err, *args, **kwargs):
        try:
            return super().report_retry(err, *args, **kwargs)
        except DownloadError as failure:
            # yt-dlp's terminal retry report otherwise keeps only the error text.
            raise failure from err


class CaptionYoutubeDL(YoutubeDL):
    def dl(self, name, info, subtitle=False, test=False):
        if not subtitle or test or get_suitable_downloader(info, self.params) is not HttpFD:
            return super().dl(name, info, subtitle=subtitle, test=test)
        track = self._copy_infodict(info)
        if track.get("http_headers") is None:
            track["http_headers"] = self._calc_headers(track)
        # Explicit byte slices and chunked transfers are separate downloader contracts.
        whole_track = not (
            any(header.lower() == "range" for header in track["http_headers"])
            or self.params.get("http_chunk_size")
            or (track.get("downloader_options") or {}).get("http_chunk_size")
        )
        connection = _CaptionConnection(self) if whole_track else self
        downloader = _CaptionHttpFD(connection, self.params)
        for hook in self._progress_hooks:
            downloader.add_progress_hook(hook)
        return downloader.download(name, track, subtitle=True)
