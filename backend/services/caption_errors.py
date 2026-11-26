"""Caption acquisition outcomes shared by task ingestion and preview."""

CAPTIONS_RATE_LIMITED = (
    "captions_unavailable: rate_limited: Caption requests were temporarily rate limited."
)


class CaptionRateLimited(Exception):
    """The provider returned HTTP 429 and this download yielded no usable track."""


def is_http_rate_limit(exc: BaseException) -> bool:
    """yt-dlp wraps its transport's HTTPError in DownloadError."""
    seen = set()
    pending = [exc]
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if getattr(current, "status", None) == 429 or getattr(current, "code", None) == 429:
            return True
        links = [current.__cause__, current.__context__]
        exc_info = getattr(current, "exc_info", None)
        if isinstance(exc_info, tuple) and len(exc_info) >= 2:
            links.append(exc_info[1])
        pending.extend(link for link in links if isinstance(link, BaseException))
    return False
