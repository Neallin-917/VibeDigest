"""Tests for api/routes/system.py — system endpoints."""

from unittest.mock import MagicMock, AsyncMock

import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI

from api.routes.system import router
from dependencies import get_db_client, get_notifier


def _make_app(db_mock=None, notifier_mock=None):
    """Create a minimal test FastAPI app with the system router."""
    app = FastAPI()
    app.include_router(router)

    if db_mock is not None:
        app.dependency_overrides[get_db_client] = lambda: db_mock
    if notifier_mock is not None:
        app.dependency_overrides[get_notifier] = lambda: notifier_mock

    return app


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.validate_token.return_value = None  # anonymous by default
    return db


@pytest.fixture
def mock_notifier():
    notifier = MagicMock()
    notifier.send_feedback_email = MagicMock()
    return notifier


@pytest.fixture
def client(mock_db, mock_notifier):
    app = _make_app(db_mock=mock_db, notifier_mock=mock_notifier)
    return TestClient(app)


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------

class TestReadRoot:
    def test_returns_200(self, client):
        response = client.get("/")
        assert response.status_code == 200

    def test_returns_status_message(self, client):
        response = client.get("/")
        data = response.json()
        assert "status" in data
        assert "VibeDigest" in data["status"] or "running" in data["status"]

    def test_returns_docs_link(self, client):
        response = client.get("/")
        data = response.json()
        assert "docs" in data


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

class TestHealthCheck:
    def test_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_returns_healthy_status(self, client):
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "healthy"

    def test_returns_service_name(self, client):
        response = client.get("/health")
        data = response.json()
        assert "service" in data


class TestReadinessCheck:
    def test_returns_ready_when_the_submission_contract_is_available(self, client, mock_db):
        mock_db._execute_query.return_value = [{
            "submission_function_ready": True,
            "queue_schema_ready": True,
            "task_intent_ready": True,
            "output_intent_ready": True,
            "output_provenance_ready": True,
            "monthly_quota_ready": True,
        }]

        response = client.get("/health/ready")

        assert response.status_code == 200
        assert response.json()["status"] == "ready"
        query = mock_db._execute_query.call_args.args[0]
        assert "submit_video_task(uuid,text,text,integer,jsonb,text)" in query

    def test_returns_503_when_a_required_database_contract_is_missing(self, client, mock_db):
        mock_db._execute_query.return_value = [{
            "submission_function_ready": True,
            "queue_schema_ready": True,
            "task_intent_ready": True,
            "output_intent_ready": False,
            "output_provenance_ready": True,
            "monthly_quota_ready": True,
        }]

        response = client.get("/health/ready")

        assert response.status_code == 503
        assert response.json()["detail"] == "Service is not ready"

    def test_returns_503_when_the_readiness_query_fails(self, client, mock_db):
        mock_db._execute_query.side_effect = RuntimeError("connection unavailable")

        response = client.get("/health/ready")

        assert response.status_code == 503
        assert response.json()["detail"] == "Service is not ready"


# ---------------------------------------------------------------------------
# POST /api/feedback — anonymous (no Authorization header)
# ---------------------------------------------------------------------------

class TestSubmitFeedbackAnonymous:
    def test_returns_200_without_auth(self, client):
        response = client.post(
            "/api/feedback",
            json={
                "category": "bug",
                "message": "Found an issue with the UI",
            },
        )
        assert response.status_code == 200

    def test_returns_received_status(self, client):
        response = client.post(
            "/api/feedback",
            json={"category": "feature", "message": "Add dark mode"},
        )
        data = response.json()
        assert data["status"] == "received"

    def test_anonymous_user_without_auth_header(self, client, mock_db):
        client.post(
            "/api/feedback",
            json={"category": "bug", "message": "Test feedback"},
        )
        # Without Authorization header, validate_token should not be called
        mock_db.validate_token.assert_not_called()

    def test_includes_optional_contact_email(self, client):
        response = client.post(
            "/api/feedback",
            json={
                "category": "other",
                "message": "Some feedback",
                "contact_email": "user@example.com",
            },
        )
        assert response.status_code == 200

    def test_missing_required_fields_returns_422(self, client):
        response = client.post(
            "/api/feedback",
            json={"category": "bug"},  # missing 'message'
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/feedback — authenticated (with Authorization header)
# ---------------------------------------------------------------------------

class TestSubmitFeedbackAuthenticated:
    def test_valid_token_uses_user_id(self, mock_db, mock_notifier):
        mock_db.validate_token.return_value = "user-123"
        app = _make_app(db_mock=mock_db, notifier_mock=mock_notifier)

        with TestClient(app) as c:
            response = c.post(
                "/api/feedback",
                headers={"Authorization": "Bearer valid-token"},
                json={"category": "bug", "message": "Authenticated feedback"},
            )

        assert response.status_code == 200
        mock_db.validate_token.assert_called_once_with("Bearer valid-token")

    def test_invalid_token_falls_back_to_anonymous(self, mock_db, mock_notifier):
        mock_db.validate_token.return_value = None  # token invalid
        app = _make_app(db_mock=mock_db, notifier_mock=mock_notifier)

        with TestClient(app) as c:
            response = c.post(
                "/api/feedback",
                headers={"Authorization": "Bearer invalid-token"},
                json={"category": "bug", "message": "Invalid token test"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "received"

    def test_email_task_scheduled_in_background(self, mock_db, mock_notifier):
        """send_feedback_email should be scheduled as a background task."""
        app = _make_app(db_mock=mock_db, notifier_mock=mock_notifier)

        with TestClient(app) as c:
            c.post(
                "/api/feedback",
                json={"category": "feature", "message": "Background test"},
            )

        # TestClient runs background tasks synchronously
        mock_notifier.send_feedback_email.assert_called_once()
