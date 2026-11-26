"""Caption acquisition outcomes shared by task ingestion and preview."""

CAPTIONS_RATE_LIMITED = (
    "captions_unavailable: rate_limited: Caption requests were temporarily rate limited."
)


class CaptionRateLimited(Exception):
    """The provider returned HTTP 429 and this download yielded no usable track."""


def is_http_rate_limit(exc: BaseException) -> bool:
    """yt-dlp wraps its transport's HTTPError in DownloadError."""
    seen = set()
    current = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if getattr(current, "status", None) == 429 or getattr(current, "code", None) == 429:
            return True
        current = current.__cause__ or current.__context__
    return False
