"""Offline regression tests for Sentry environment and alert capture policy."""

import os
from pathlib import Path
import subprocess
import sys
import textwrap

import pytest

from utils.sentry_config import _before_send, resolve_sentry_environment


def test_explicit_sentry_environment_takes_precedence(monkeypatch):
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    monkeypatch.setenv("RAILWAY_PUBLIC_DOMAIN", "example.up.railway.app")

    assert resolve_sentry_environment() == "production"


def test_explicit_development_is_preserved(monkeypatch):
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "development")
    monkeypatch.delenv("RAILWAY_PUBLIC_DOMAIN", raising=False)
    monkeypatch.delenv("RAILWAY_PROJECT_NAME", raising=False)

    assert resolve_sentry_environment() == "development"


def test_railway_runtime_defaults_to_production(monkeypatch):
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    monkeypatch.setenv("RAILWAY_PROJECT_NAME", "vibedigest")

    assert resolve_sentry_environment() == "production"


def test_default_environment_is_development(monkeypatch):
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_PUBLIC_DOMAIN", raising=False)
    monkeypatch.delenv("RAILWAY_PROJECT_NAME", raising=False)

    assert resolve_sentry_environment() == "development"


@pytest.mark.parametrize(
    "payload_kind",
    ["message", "logentry.message", "logentry.formatted", "exception", "hint"],
)
@pytest.mark.parametrize(
    "message,suppressed",
    [
        ("Authentication failed with dummy-key", True),
        ("Token validation failed: bad", True),
        ("Missing credentials. Please provide an API key.", False),
        ("RunTree.patch() got an unexpected keyword argument 'exclude_inputs'", False),
        ("Provider request failed unexpectedly", False),
    ],
)
def test_noise_filter_handles_sentry_payload_shapes(payload_kind, message, suppressed):
    event = {"event_id": "test-event"}
    hint = {}
    if payload_kind == "message":
        event["message"] = message
    elif payload_kind.startswith("logentry."):
        event["logentry"] = {payload_kind.split(".")[1]: message}
    elif payload_kind == "exception":
        event["exception"] = {
            "values": [
                {"type": "RuntimeError", "value": "outer exception"},
                {"type": "ValueError", "value": message},
            ]
        }
    else:
        hint["exc_info"] = (RuntimeError, RuntimeError(message), None)

    result = _before_send(event, hint)

    if suppressed:
        assert result is None
    else:
        assert result is event


def test_logging_preserves_alerts_without_duplicate_events(tmp_path):
    """Exercise both installed logging integrations without global SDK leakage."""
    script = textwrap.dedent(
        r'''
        import logging
        import sys
        from unittest.mock import patch

        sys.path.insert(0, sys.argv[1])

        # Fail closed if an SDK integration tries network access or env files.
        def audit(event, args):
            if event == "open" and isinstance(args[0], (str, bytes)):
                name = str(args[0]).rsplit("/", 1)[-1]
                assert not name.startswith(".env"), "Test must not read env files"
            if event in ("socket.connect", "socket.getaddrinfo"):
                raise AssertionError("Test must not access the network")
        sys.addaudithook(audit)

        import sentry_sdk
        from loguru import logger
        from sentry_sdk.transport import Transport
        from utils.logging import InterceptHandler
        from utils.sentry_config import init_sentry

        class MemoryTransport(Transport):
            def __init__(self):
                super().__init__()
                self.events = []

            def capture_envelope(self, envelope):
                for item in envelope.items:
                    if item.type == "event":
                        self.events.append(item.payload.json)

        transport = MemoryTransport()
        sdk_init = sentry_sdk.init

        def offline_init(*args, **kwargs):
            kwargs.update(transport=transport)
            return sdk_init(*args, **kwargs)

        # Match production ordering: configure Loguru before Sentry adds sinks.
        logger.remove()
        logger.add(lambda message: None, level="INFO")
        logging.basicConfig(handlers=[InterceptHandler()], level=logging.INFO, force=True)
        with patch.object(sentry_sdk, "init", offline_init):
            init_sentry("https://public@example.invalid/1")

        logging.getLogger("sentry-regression").error("stdlib-error-marker")
        assert len(transport.events) == 1, transport.events
        assert transport.events[0]["logentry"]["formatted"].strip() == "stdlib-error-marker"

        logger.error("loguru-error-marker")
        assert len(transport.events) == 2, transport.events
        assert transport.events[1]["logentry"]["formatted"].strip() == "loguru-error-marker"

        logger.error("Authentication failed with dummy-key")
        assert len(transport.events) == 2, transport.events

        # Handled exceptions (e.g. translated to an HTTP 503) must remain visible
        # even when the caller never invokes capture_exception explicitly.
        try:
            raise RuntimeError("handled-exception-marker")
        except RuntimeError as exc:
            logger.exception("handled-failure-marker")
            assert len(transport.events) == 3, transport.events
            event = transport.events[-1]
            assert event["exception"]["values"][-1]["value"] == "handled-exception-marker"
            sentry_sdk.capture_exception(exc)
            assert len(transport.events) == 3, transport.events

        # Independent explicitly captured exceptions still produce their event.
        try:
            raise ValueError("explicit-exception-marker")
        except ValueError as exc:
            sentry_sdk.capture_exception(exc)
        sentry_sdk.flush()

        assert len(transport.events) == 4, transport.events
        event = transport.events[-1]
        assert event["exception"]["values"][-1]["value"] == "explicit-exception-marker"
        breadcrumbs = event["breadcrumbs"]["values"]
        for marker in ("stdlib-error-marker", "loguru-error-marker", "handled-failure-marker"):
            assert any(marker in crumb.get("message", "") for crumb in breadcrumbs), breadcrumbs
        sentry_sdk.get_client().close()
        '''
    )
    # No inherited credentials/config. -I ignores PYTHONPATH and cwd imports.
    env = {
        "PATH": os.defpath,
        "SENTRY_TRACES_SAMPLE_RATE": "0",
        "SENTRY_PROFILES_SAMPLE_RATE": "0",
        "SENTRY_ENVIRONMENT": "test",
    }
    result = subprocess.run(
        [sys.executable, "-I", "-c", script, str(Path(__file__).resolve().parents[1])],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_init_sentry_preserves_environment_sampling_and_filter(monkeypatch):
    import sentry_sdk
    from unittest.mock import Mock

    from utils.sentry_config import init_sentry

    sdk_init = Mock()
    monkeypatch.setattr(sentry_sdk, "init", sdk_init)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "staging")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.25")
    monkeypatch.setenv("SENTRY_PROFILES_SAMPLE_RATE", "0.05")

    init_sentry("https://public@example.invalid/1")

    sdk_init.assert_called_once()
    options = sdk_init.call_args.kwargs
    assert options["dsn"] == "https://public@example.invalid/1"
    assert options["environment"] == "staging"
    assert options["traces_sample_rate"] == 0.25
    assert options["profiles_sample_rate"] == 0.05
    assert options["before_send"] is _before_send
