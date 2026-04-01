import pytest
from unittest.mock import MagicMock, AsyncMock, patch
import os
from main import app
from dependencies import get_current_user, get_db_client, get_video_processor
from httpx import AsyncClient, ASGITransport
from api.routes.tasks import get_or_create_task_for_request

@pytest.mark.asyncio
async def test_preview_video(api_client, mock_video_processor):
    response = await api_client.post("/api/preview-video", data={"url": "https://youtube.com/watch?v=123"})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Video"
    mock_video_processor.extract_info_only.assert_called_once()

@pytest.mark.asyncio
async def test_preview_video_invalid_url(api_client, mock_video_processor):
    with patch("api.routes.tasks.normalize_video_url", return_value=None):
        response = await api_client.post("/api/preview-video", data={"url": "invalid"})
        assert response.status_code == 400

@pytest.mark.asyncio
async def test_process_video_success(api_client, mock_db_client):
    """Successful task creation: task created and pipeline queued."""
    mock_db_client.create_task.return_value = {"id": "task_123"}
    mock_db_client.find_latest_inflight_task.return_value = None
    mock_db_client.find_latest_task_with_valid_script_for_user.return_value = None

    with patch("api.routes.tasks.run_pipeline"), \
         patch("dependencies.increment_guest_usage"):
        response = await api_client.post("/api/process-video", data={"video_url": "https://youtube.com/watch?v=123"})
        assert response.status_code == 200
        assert response.json() == {"task_id": "task_123", "message": "Task started"}
        mock_db_client.create_task.assert_called_once()


def test_get_or_create_task_for_request_reuses_inflight():
    mock_db = MagicMock()
    mock_db.find_latest_inflight_task.return_value = {"id": "task_inflight"}
    mock_db.find_latest_task_with_valid_script_for_user.return_value = None

    task, resolution = get_or_create_task_for_request(
        db=mock_db,
        user_id="u1",
        video_url="https://youtube.com/watch?v=abc",
    )

    assert task["id"] == "task_inflight"
    assert resolution == "reused_inflight"
    mock_db.create_task.assert_not_called()


def test_get_or_create_task_for_request_reuses_completed():
    mock_db = MagicMock()
    mock_db.find_latest_inflight_task.return_value = None
    mock_db.find_latest_task_with_valid_script_for_user.return_value = {"id": "task_completed"}

    task, resolution = get_or_create_task_for_request(
        db=mock_db,
        user_id="u1",
        video_url="https://youtube.com/watch?v=abc",
    )

    assert task["id"] == "task_completed"
    assert resolution == "reused_completed"
    mock_db.create_task.assert_not_called()


@pytest.mark.asyncio
async def test_process_video_reuses_inflight_task(api_client, mock_db_client):
    mock_db_client.find_latest_inflight_task.return_value = {"id": "task_inflight"}
    mock_db_client.find_latest_task_with_valid_script_for_user.return_value = None

    with patch("api.routes.tasks.run_pipeline") as mock_pipeline, \
         patch("dependencies.increment_guest_usage") as mock_increment_guest_usage:
        response = await api_client.post(
            "/api/process-video",
            data={"video_url": "https://youtube.com/watch?v=123"},
        )

    assert response.status_code == 200
    assert response.json() == {"task_id": "task_inflight", "message": "Task already in progress"}
    mock_db_client.create_task.assert_not_called()
    mock_pipeline.assert_not_called()
    mock_increment_guest_usage.assert_not_called()


@pytest.mark.asyncio
async def test_process_video_reuses_completed_task(api_client, mock_db_client):
    mock_db_client.find_latest_inflight_task.return_value = None
    mock_db_client.find_latest_task_with_valid_script_for_user.return_value = {"id": "task_completed"}

    with patch("api.routes.tasks.run_pipeline") as mock_pipeline, \
         patch("dependencies.increment_guest_usage") as mock_increment_guest_usage:
        response = await api_client.post(
            "/api/process-video",
            data={"video_url": "https://youtube.com/watch?v=123"},
        )

    assert response.status_code == 200
    assert response.json() == {"task_id": "task_completed", "message": "Task already processed"}
    mock_db_client.create_task.assert_not_called()
    mock_pipeline.assert_not_called()
    mock_increment_guest_usage.assert_not_called()

@pytest.mark.asyncio
async def test_process_video_quota_exceeded(mock_db_client, mock_video_processor, mock_coinbase_client):
    """Guest quota exceeded: dependency raises 402 before the route body runs."""
    from fastapi import HTTPException as FastAPIHTTPException

    def _quota_exceeded():
        raise FastAPIHTTPException(status_code=402, detail="Guest quota exceeded")

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_client] = lambda: mock_db_client
    app.dependency_overrides[get_video_processor] = lambda: mock_video_processor
    app.dependency_overrides[get_current_user] = _quota_exceeded
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/api/process-video", data={"video_url": "https://youtube.com/watch?v=123"})
        assert response.status_code == 402
        assert "quota" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides = saved

@pytest.mark.asyncio
async def test_retry_output(api_client, mock_db_client):
    with patch("api.routes.tasks.handle_retry_output") as mock_handle:
        response = await api_client.post("/api/retry-output", data={"output_id": "out_123"})
        assert response.status_code == 200
        mock_db_client.update_output_status.assert_called_with("out_123", status="pending", progress=0, error="")

@pytest.mark.asyncio
async def test_update_task_title(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {"user_id": "test_user_id"}
    
    response = await api_client.patch("/api/tasks/task_123", json={"video_title": "New Title"})
    assert response.status_code == 200
    mock_db_client.update_task_status.assert_called_with("task_123", video_title="New Title")

@pytest.mark.asyncio
async def test_update_task_title_not_owner(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {"user_id": "other_user"}
    
    response = await api_client.patch("/api/tasks/task_123", json={"video_title": "New Title"})
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_get_task_status(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {
        "id": "task_123",
        "user_id": "test_user_id",
        "status": "completed",
        "progress": 100
    }
    
    response = await api_client.get("/api/tasks/task_123/status")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "task_123"

@pytest.mark.asyncio
async def test_get_task_status_not_found(api_client, mock_db_client):
    mock_db_client.get_task.return_value = None
    response = await api_client.get("/api/tasks/task_123/status")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_misconfigured_jwt_secret_returns_503(mock_db_client):
    """When JWT secret is missing, backend should return 503 instead of 401."""
    saved_overrides = dict(app.dependency_overrides)
    try:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides[get_db_client] = lambda: mock_db_client

        # Simulate missing JWT secret
        mock_db_client.is_auth_configured.return_value = False

        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            with patch.dict(os.environ, {"DEV_AUTH_BYPASS": "0"}, clear=False):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    response = await ac.post(
                        "/api/process-video",
                        data={"video_url": "http://test"},
                        headers={"Authorization": "Bearer some-token"}
                    )
                    assert response.status_code == 503
                    assert "misconfigured" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides = saved_overrides


@pytest.mark.asyncio
async def test_authenticated_user_can_create_task(mock_db_client, mock_video_processor):
    """Test that a valid JWT token allows task creation (real auth path, no get_current_user override)."""
    import jwt as pyjwt
    import time

    secret = "test-integration-secret"
    user_id = "550e8400-e29b-41d4-a716-446655440000"
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, secret, algorithm="HS256")

    # Configure mock db_client to validate the real token
    mock_db_client.is_auth_configured.return_value = True
    mock_db_client.validate_token.return_value = user_id
    mock_db_client.create_task.return_value = {"id": "task_real_auth"}
    mock_db_client.find_latest_inflight_task.return_value = None
    mock_db_client.find_latest_task_with_valid_script_for_user.return_value = None
    mock_db_client.check_and_consume_quota.return_value = True

    saved_overrides = dict(app.dependency_overrides)
    try:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides[get_db_client] = lambda: mock_db_client
        app.dependency_overrides[get_video_processor] = lambda: mock_video_processor

        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            with patch.dict(os.environ, {"DEV_AUTH_BYPASS": "0"}, clear=False), \
                 patch("api.routes.tasks.run_pipeline"), \
                 patch("dependencies.increment_guest_usage"):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    response = await ac.post(
                        "/api/process-video",
                        data={"video_url": "https://youtube.com/watch?v=test"},
                        headers={"Authorization": f"Bearer {token}"}
                    )
                    assert response.status_code == 200
                    assert response.json()["task_id"] == "task_real_auth"
    finally:
        app.dependency_overrides = saved_overrides


@pytest.mark.asyncio
async def test_unauthorized_access(mock_db_client):
    """Test that invalid auth token returns 401 when all bypasses are disabled."""
    saved_overrides = dict(app.dependency_overrides)
    try:
        # Only override db_client, do NOT override get_current_user
        # so the real auth logic runs
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides[get_db_client] = lambda: mock_db_client

        # Ensure validate_token returns None (invalid token)
        mock_db_client.validate_token.return_value = None

        # Disable ALL bypass paths: DEV_AUTH_BYPASS and MOCK_MODE
        with patch("dependencies.settings") as mock_settings:
            mock_settings.MOCK_MODE = False
            with patch.dict(os.environ, {"DEV_AUTH_BYPASS": "0"}, clear=False):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    response = await ac.post(
                        "/api/process-video",
                        data={"video_url": "http://test"},
                        headers={"Authorization": "Bearer invalid"}
                    )
                    assert response.status_code == 401
    finally:
        app.dependency_overrides = saved_overrides
