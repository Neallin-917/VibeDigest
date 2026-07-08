import json
import re
from typing import Any, Optional


DEFAULT_ERROR_MESSAGE = "Unable to process this video right now."
UPSTREAM_BLOCKED_MESSAGE = (
    "The processing service is blocking automated access. Please try again later."
)
UPSTREAM_HTML_MESSAGE = (
    "The upstream service returned an unexpected error page. Please try again later."
)
MAX_MESSAGE_LENGTH = 280


def _extract_message(value: Any) -> Optional[str]:
    if isinstance(value, BaseException):
        return str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("detail", "details", "error", "message"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                return candidate
    return None


def _try_parse_json_message(value: str) -> Optional[str]:
    stripped = value.strip()
    if not stripped.startswith(("{", "[")):
        return None

    try:
        return _extract_message(json.loads(stripped))
    except Exception:
        return None


def _looks_like_html(value: str) -> bool:
    return bool(
        re.search(r"<!doctype\s+html", value, re.IGNORECASE)
        or re.search(r"<html[\s>]", value, re.IGNORECASE)
        or re.search(r"<script[\s>]", value, re.IGNORECASE)
    )


def _looks_like_antibot_challenge(value: str) -> bool:
    return bool(
        re.search(
            r"cloudflare|challenge-platform|cf-chl|cdn-cgi|just a moment|challenge-error-text",
            value,
            re.IGNORECASE,
        )
    )


def sanitize_error_message(value: Any, fallback: str = DEFAULT_ERROR_MESSAGE) -> str:
    extracted = _extract_message(value)
    parsed = _try_parse_json_message(extracted) if isinstance(extracted, str) else None
    raw = (parsed or extracted or fallback).strip()

    if not raw:
        return fallback

    if _looks_like_html(raw):
        if _looks_like_antibot_challenge(raw):
            return UPSTREAM_BLOCKED_MESSAGE
        return UPSTREAM_HTML_MESSAGE

    compact = re.sub(r"\s+", " ", raw)
    if len(compact) <= MAX_MESSAGE_LENGTH:
        return compact
    return f"{compact[: MAX_MESSAGE_LENGTH - 3]}..."
