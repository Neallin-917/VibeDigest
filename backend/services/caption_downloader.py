"""Preserve structured transport errors when yt-dlp reports a failed HTTP subtitle."""
from yt_dlp import YoutubeDL
from yt_dlp.downloader import get_suitable_downloader
from yt_dlp.downloader.http import HttpFD
from yt_dlp.utils import DownloadError


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
        downloader = _CaptionHttpFD(self, self.params)
        for hook in self._progress_hooks:
            downloader.add_progress_hook(hook)
        track = self._copy_infodict(info)
        if track.get("http_headers") is None:
            track["http_headers"] = self._calc_headers(track)
        return downloader.download(name, track, subtitle=True)
