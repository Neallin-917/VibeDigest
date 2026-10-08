"""
Sentry configuration module.

Centralises all Sentry SDK initialisation logic so main.py stays thin and
the filtering/sampling rules are easy to audit in one place.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from loguru import logger


# ---------------------------------------------------------------------------
# Known-noise patterns we deliberately suppress from Sentry.
# Add new entries here rather than scattering `before_send` logic.
# ---------------------------------------------------------------------------
_SUPPRESSED_MESSAGES: tuple[str, ...] = (
    # litellm/langchain version mismatch — fixed by version pin (Category A)
    "isinstance() arg 2 must be a type",
    # Placeholder API key used in CI / local dev (Category B)
    "dummy-key",
    # JWT probing / scanner traffic — not a real error
    "Token validation failed: bad",
    # Coinbase webhook HMAC mismatch — this is *expected* behaviour for invalid
    # webhooks and is already handled gracefully in the route handler.
    "Coinbase signature error: Bad sig",
    # Startup guard that fires when env is intentionally incomplete (Category D)
    "SUPABASE_JWT_SECRET is required",
)

_RAILWAY_RUNTIME_MARKERS: tuple[str, ...] = (
    "RAILWAY_PUBLIC_DOMAIN",
    "RAILWAY_PROJECT_NAME",
)


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """
    Sentry before_send hook — return ``None`` to discard the event entirely.

    Suppresses known-noise events so the Sentry dashboard only surfaces
    actionable issues.
    """
    # SDK integrations use logentry and serialized exceptions; message alone
    # does not cover log-captured events or events without a live exc_info.
    logentry = event.get("logentry") or {}
    messages = [
        event.get("message"),
        logentry.get("message"),
        logentry.get("formatted"),
    ]
    messages.extend(
        value.get("value")
        for value in (event.get("exception") or {}).get("values", [])
    )
    exc_info = hint.get("exc_info")
    if exc_info:
        messages.append(str(exc_info[1]))

    for pattern in _SUPPRESSED_MESSAGES:
        if any(isinstance(message, str) and pattern in message for message in messages):
            logger.debug(f"[sentry] Suppressed event matching pattern '{pattern}'")
            return None

    return event


def resolve_sentry_environment() -> str:
    """Resolve the Sentry environment without assuming production by default."""
    explicit_environment = (os.getenv("SENTRY_ENVIRONMENT") or "").strip()
    if explicit_environment:
        return explicit_environment

    for marker in _RAILWAY_RUNTIME_MARKERS:
        if (os.getenv(marker) or "").strip():
            return "production"

    return "development"


def init_sentry(dsn: str) -> None:
    """
    Initialise the Sentry SDK with project-appropriate defaults.

    Called once at application startup.  Safe to call multiple times — the
    SDK de-duplicates initialisation internally.

    Args:
        dsn: The Sentry project DSN (must be non-empty).
    """
    import sentry_sdk
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.loguru import LoguruIntegration

    environment = resolve_sentry_environment()

    # Traces sample rate: configurable via env, default 10 %.
    # Error events are *not* affected by this setting.
    traces_sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    profiles_sample_rate = float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.1"))

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
        # InterceptHandler forwards standard logging to Loguru. Keep a single
        # log-event path: handled failures may only be reported by logger.exception
        # or logger.error. The SDK deduplicates repeated captures of an exception.
        # Exclude Loguru's timestamp/source prefix from event grouping messages.
        integrations=[
            LoggingIntegration(event_level=None),
            LoguruIntegration(event_level=logging.ERROR, event_format="{message}"),
        ],
        before_send=_before_send,
    )

    logger.info(
        f"[sentry] Initialised — environment={environment!r} "
        f"traces_sample_rate={traces_sample_rate} "
        f"profiles_sample_rate={profiles_sample_rate}"
    )
