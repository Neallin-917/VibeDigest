import pytest

from config import Settings


@pytest.mark.parametrize(
    "unsafe_flag",
    ["DEV_AUTH_BYPASS", "MOCK_MODE"],
)
def test_production_rejects_development_bypasses(monkeypatch, unsafe_flag):
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")
    monkeypatch.setenv(unsafe_flag, "true")

    with pytest.raises(RuntimeError, match="must be disabled in production"):
        Settings()
