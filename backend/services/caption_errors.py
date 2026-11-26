"""Public outcomes for a failed final caption request."""

try:
    from requests.exceptions import Timeout as RequestsTimeout
except ImportError:  # yt-dlp can use the standard-library HTTP handler alone.
    TIMEOUT_ERRORS = (TimeoutError,)
else:
    TIMEOUT_ERRORS = (TimeoutError, RequestsTimeout)

CAPTIONS_RATE_LIMITED = (
    "captions_unavailable: rate_limited: Caption requests were temporarily rate limited."
)
CAPTIONS_PROVIDER_UNAVAILABLE = (
    "captions_unavailable: provider_unavailable: The caption service did not respond successfully."
)


class CaptionRequestFailure(Exception):
    public_message: str


class CaptionRateLimited(CaptionRequestFailure):
    public_message = CAPTIONS_RATE_LIMITED


class CaptionProviderUnavailable(CaptionRequestFailure):
    public_message = CAPTIONS_PROVIDER_UNAVAILABLE


def caption_request_failure(exc: BaseException) -> CaptionRequestFailure | None:
    """Prefer an actual HTTP response over timeout context from an underlying handler."""
    seen = set()
    pending = [exc]
    timed_out = False
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        status = getattr(current, "status", None) or getattr(current, "code", None)
        if isinstance(status, int) and 100 <= status <= 599:
            if status == 429:
                return CaptionRateLimited()
            if status == 503:
                return CaptionProviderUnavailable()
            return None
        timed_out |= isinstance(current, TIMEOUT_ERRORS)
        links = [current.__context__, current.__cause__, getattr(current, "cause", None),
                 getattr(current, "reason", None)]
        exc_info = getattr(current, "exc_info", None)
        if isinstance(exc_info, tuple) and len(exc_info) >= 2:
            links.append(exc_info[1])
        pending.extend(link for link in links if isinstance(link, BaseException))
    return CaptionProviderUnavailable() if timed_out else None
