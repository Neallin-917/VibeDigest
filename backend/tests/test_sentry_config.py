"""Tests for Sentry environment resolution."""

from utils.sentry_config import resolve_sentry_environment


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
