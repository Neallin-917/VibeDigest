import re
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def _host_matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def is_supported_content_url(url: str | None) -> bool:
    """Return whether a URL identifies one supported video or podcast source."""
    if not url or not url.strip():
        return False

    candidate = url.strip()
    if not candidate.startswith(("http://", "https://")):
        candidate = "https://" + candidate

    try:
        parsed = urlparse(candidate)
        if parsed.scheme.lower() not in {"http", "https"}:
            return False

        host = (parsed.hostname or "").lower().rstrip(".")
        path = parsed.path
        segments = [segment for segment in path.split("/") if segment]

        if _host_matches(host, "youtu.be"):
            return bool(segments)
        if _host_matches(host, "youtube.com"):
            if path.rstrip("/") == "/watch":
                return bool((parse_qs(parsed.query).get("v") or [""])[0].strip())
            return (
                len(segments) >= 2
                and segments[0] in {"shorts", "live", "embed"}
                and bool(segments[1])
            )
        if _host_matches(host, "podcasts.apple.com"):
            return any(
                re.fullmatch(r"id\d+", segment, re.IGNORECASE) for segment in segments
            )
        if _host_matches(host, "bilibili.com"):
            return bool(
                re.match(
                    r"^/video/(?:BV[0-9A-Za-z]+|av\d+)(?:/|$)", path, re.IGNORECASE
                )
            )
        if _host_matches(host, "xiaoyuzhoufm.com"):
            return len(segments) >= 2 and segments[0] == "episode" and bool(segments[1])
        return False
    except (TypeError, ValueError):
        return False


def normalize_video_url(url: str) -> str:
    """
    Normalize a video URL to improve cache hit rates.
    - Adds scheme if missing.
    - Standardizes YouTube URLs to https://youtube.com/watch?v=...
    - Removes common tracking parameters (utm_*, ref, etc.)
    - Removes fragments.
    """
    if not url:
        return ""

    url = url.strip()

    # Defensive: Filter out Javascript string literals "undefined", "null"
    if url.lower() in ("undefined", "null", "none"):
        return ""

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        host = (parsed.hostname or "").lower().rstrip(".")
        path = parsed.path
        query = parse_qs(parsed.query)

        # Remove 'www.' prefix for consistency (except maybe for some sites? but usually safe)
        if netloc.startswith("www."):
            netloc = netloc[4:]

        # Handle YouTube specific normalization
        if _host_matches(host, "youtube.com") or _host_matches(host, "youtu.be"):
            video_id = None
            if _host_matches(host, "youtu.be"):
                # https://youtu.be/VIDEO_ID
                parts = path.split("/")
                if len(parts) > 1:
                    video_id = parts[1]
            elif _host_matches(host, "youtube.com"):
                # https://youtube.com/watch?v=VIDEO_ID
                # https://youtube.com/shorts/VIDEO_ID
                if "/shorts/" in path:
                    parts = path.split("/shorts/")
                    if len(parts) > 1:
                        video_id = parts[1].split("/")[0]  # handle trailing slashes
                elif "v" in query:
                    video_id = query["v"][0]

            if video_id:
                # Return canonical YouTube URL
                # We discard timestamps (t=...) for caching purposes?
                # Ideally yes, we want to cache the whole video processing.
                return f"https://youtube.com/watch?v={video_id}"

        # General Parameter Cleanup
        # Remove tracking parameters
        blocked_params = {
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "ref",
            "source",
            "from",
        }

        # Rebuild query keeping only non-blocked
        new_query_parts = []
        for key, values in query.items():
            if key.lower() not in blocked_params:
                for v in values:
                    new_query_parts.append((key, v))

        # Sort for determinism
        new_query_parts.sort()
        new_query_string = urlencode(new_query_parts)

        # Bilibili specific: normalize to https://bilibili.com/video/BV...
        if _host_matches(host, "bilibili.com"):
            # Check for /video/BV...
            # We preserve 'p' (page) if present, as it changes the content.
            pass

        return urlunparse((scheme, netloc, path, None, new_query_string, None))

    except Exception:
        # Fallback to original if parsing fails
        return url
