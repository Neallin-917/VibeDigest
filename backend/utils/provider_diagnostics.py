"""Safe, operator-facing diagnostics for external LLM providers.

Provider SDK exceptions may embed request headers or other request metadata.
These helpers deliberately expose only a numeric HTTP status when available.
"""

from __future__ import annotations

from urllib.parse import urlsplit


def provider_failure_message(error: BaseException) -> str:
    """Return a diagnostic that never includes the provider exception body."""
    status_code = getattr(error, "status_code", None)
    if type(status_code) is int and 100 <= status_code <= 599:
        return f"Provider request failed (HTTP {status_code})."
    return "Provider request failed."


def safe_provider_endpoint(value: str | None) -> str:
    """Return a display-safe provider endpoint without credentials or query data."""
    if not value:
        return "<not configured>"

    try:
        parsed = urlsplit(value)
        port = f":{parsed.port}" if parsed.port else ""
    except ValueError:
        return "<configured>"

    if not parsed.scheme or not parsed.hostname:
        return "<configured>"

    return f"{parsed.scheme}://{parsed.hostname}{port}"
