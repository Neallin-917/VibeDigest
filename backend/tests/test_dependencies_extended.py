"""Extended tests for dependencies.py — get_current_user branches."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from dependencies import get_current_user, get_db_client


# ---------------------------------------------------------------------------
# Minimal app for testing get_current_user dependency
# ---------------------------------------------------------------------------

def _make_app(db_mock):
    """Create a minimal FastAPI app with a /me endpoint that uses get_current_user."""
    from fastapi import Depends
    app = FastAPI()
    app.dependency_overrides[get_db_client] = lambda: db_mock

    @app.get("/me")
    async def me(user_id: str = Depends(get_current_user)):
        return {"user_id": user_id}

    return app


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.is_auth_configured.return_value = True
    db.validate_token.return_value = None  # default: invalid token
    return db


# ---------------------------------------------------------------------------
# MOCK_MODE path
# ---------------------------------------------------------------------------

class TestMockMode:
    def test_mock_mode_returns_hardcoded_uuid(self, mock_db):
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = True
            app = _make_app(mock_db)
            with TestClient(app) as c:
                response = c.get("/me")

        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Bearer token paths
# ---------------------------------------------------------------------------

class TestBearerToken:
    def test_valid_token_returns_user_id(self, mock_db):
        mock_db.validate_token.return_value = "user-abc-123"
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            app = _make_app(mock_db)
            with TestClient(app) as c:
                response = c.get(
                    "/me",
                    headers={"Authorization": "Bearer valid-token"},
                )

        assert response.status_code == 200
        assert response.json()["user_id"] == "user-abc-123"

    def test_invalid_token_raises_401(self, mock_db):
        mock_db.validate_token.return_value = None  # token rejected
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            app = _make_app(mock_db)
            with TestClient(app) as c:
                response = c.get(
                    "/me",
                    headers={"Authorization": "Bearer bad-token"},
                )

        assert response.status_code == 401
    def test_auth_misconfigured_raises_503(self, mock_db):
        mock_db.is_auth_configured.return_value = False
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            app = _make_app(mock_db)
            with TestClient(app) as c:
                response = c.get(
                    "/me",
                    headers={"Authorization": "Bearer some-token"},
                )

        assert response.status_code == 503


# ---------------------------------------------------------------------------
# Guest ID paths
# ---------------------------------------------------------------------------

class TestGuestId:
    def test_guest_within_quota_returns_guest_id(self, mock_db):
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            app = _make_app(mock_db)
            with TestClient(app) as c:
                response = c.get(
                    "/me",
                    headers={"X-Guest-Id": "guest-xyz"},
                )

        assert response.status_code == 200
        assert response.json()["user_id"] == "guest-xyz"
        mock_db.get_task_count.assert_not_called()


# ---------------------------------------------------------------------------
# Fallback path (no auth headers)
# ---------------------------------------------------------------------------

class TestFallbackUser:
    def test_no_headers_rejected(self, mock_db):
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            app = _make_app(mock_db)
            with TestClient(app) as c:
                response = c.get("/me")

        assert response.status_code == 401
