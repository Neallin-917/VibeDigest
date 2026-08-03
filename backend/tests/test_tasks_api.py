import pytest
from dependencies import (
    get_current_user,
    get_db_client,
    get_task_queue,
)
from fastapi import HTTPException as FastAPIHTTPException
from httpx import ASGITransport, AsyncClient
from main import app
from services.task_queue import GuestQuotaExceededError, TaskSubmission


@pytest.mark.asyncio
async def test_process_video_success(api_client, mock_task_queue):
    response = await api_client.post(
        "/api/process-video",
        data={"video_url": "https://youtube.com/watch?v=123"},
    )

    assert response.status_code == 200
    assert response.json() == {"task_id": "task_123", "message": "Task queued"}
    mock_task_queue.submit_process_video.assert_called_once_with(
        video_url="https://youtube.com/watch?v=123",
        user_id="00000000-0000-0000-0000-000000000001",
        guest_id=None,
    )


@pytest.mark.asyncio
async def test_process_video_passes_guest_identity(
    api_client,
    mock_task_queue,
):
    response = await api_client.post(
        "/api/process-video",
        data={"video_url": "https://youtube.com/watch?v=123"},
        headers={"X-Guest-Id": "guest-123"},
    )

    assert response.status_code == 200
    mock_task_queue.submit_process_video.assert_called_once_with(
        video_url="https://youtube.com/watch?v=123",
        user_id="00000000-0000-0000-0000-000000000001",
        guest_id="guest-123",
    )


@pytest.mark.asyncio
async def test_process_video_returns_503_when_queue_is_unavailable(
    api_client,
    mock_task_queue,
):
    mock_task_queue.submit_process_video.side_effect = RuntimeError(
        "pgmq unavailable"
    )

    response = await api_client.post(
        "/api/process-video",
        data={"video_url": "https://youtube.com/watch?v=123"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Task queue is temporarily unavailable"


@pytest.mark.asyncio
async def test_process_video_returns_402_when_atomic_quota_is_exceeded(
    api_client,
    mock_task_queue,
):
    mock_task_queue.submit_process_video.side_effect = GuestQuotaExceededError(
        "Guest quota exceeded"
    )

    response = await api_client.post(
        "/api/process-video",
        data={"video_url": "https://youtube.com/watch?v=123"},
        headers={"X-Guest-Id": "guest-123"},
    )

    assert response.status_code == 402
    assert response.json()["detail"] == "Guest quota exceeded"


@pytest.mark.asyncio
async def test_process_video_reuses_inflight_task(
    api_client,
    mock_task_queue,
):
    mock_task_queue.submit_process_video.return_value = TaskSubmission(
        task_id="task_inflight",
        resolution="reused_inflight",
        message_id=10,
    )

    response = await api_client.post(
        "/api/process-video",
        data={"video_url": "https://youtube.com/watch?v=123"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "task_id": "task_inflight",
        "message": "Task already in progress",
    }


@pytest.mark.asyncio
async def test_process_video_reuses_completed_task(
    api_client,
    mock_task_queue,
):
    mock_task_queue.submit_process_video.return_value = TaskSubmission(
        task_id="task_completed",
        resolution="reused_completed",
        message_id=None,
    )

    response = await api_client.post(
        "/api/process-video",
        data={"video_url": "https://youtube.com/watch?v=123"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "task_id": "task_completed",
        "message": "Task already processed",
    }


@pytest.mark.asyncio
async def test_process_video_quota_exceeded(
    mock_db_client,
    mock_coinbase_client,
):
    def quota_exceeded():
        raise FastAPIHTTPException(status_code=402, detail="Guest quota exceeded")

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_client] = lambda: mock_db_client
    app.dependency_overrides[get_current_user] = quota_exceeded
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/api/process-video",
                data={"video_url": "https://youtube.com/watch?v=123"},
            )
        assert response.status_code == 402
        assert "quota" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides = saved


@pytest.mark.asyncio
async def test_retry_output(api_client, mock_db_client, mock_task_queue):
    mock_db_client.get_output.return_value = {
        "id": "out_123",
        "task_id": "task_123",
        "user_id": "test_user_id",
    }
    mock_db_client.get_task.return_value = {
        "id": "task_123",
        "user_id": "test_user_id",
        "guest_id": None,
    }

    response = await api_client.post(
        "/api/retry-output",
        data={"output_id": "out_123"},
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 200
    mock_task_queue.submit_retry_output.assert_called_once_with(
        output_id="out_123",
        user_id="test_user_id",
        guest_id=None,
    )
    mock_db_client.update_output_status.assert_not_called()


@pytest.mark.asyncio
async def test_retry_output_returns_503_when_queue_is_unavailable(
    api_client,
    mock_db_client,
    mock_task_queue,
):
    mock_db_client.get_output.return_value = {
        "id": "out_123",
        "task_id": "task_123",
        "user_id": "test_user_id",
    }
    mock_db_client.get_task.return_value = {
        "id": "task_123",
        "user_id": "test_user_id",
        "guest_id": None,
    }
    mock_task_queue.submit_retry_output.side_effect = RuntimeError(
        "pgmq unavailable"
    )

    response = await api_client.post(
        "/api/retry-output",
        data={"output_id": "out_123"},
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Task queue is temporarily unavailable"
    mock_db_client.update_output_status.assert_not_called()


@pytest.mark.asyncio
async def test_retry_output_rejects_non_owner(
    api_client,
    mock_db_client,
    mock_task_queue,
):
    mock_db_client.get_output.return_value = {
        "id": "out_123",
        "task_id": "task_123",
        "user_id": "other_user",
    }
    mock_db_client.get_task.return_value = {
        "id": "task_123",
        "user_id": "other_user",
        "guest_id": None,
    }

    response = await api_client.post(
        "/api/retry-output",
        data={"output_id": "out_123"},
        headers={"Authorization": "Bearer token"},
    )

    assert response.status_code == 403
    mock_task_queue.submit_retry_output.assert_not_called()


@pytest.mark.asyncio
async def test_update_task_title(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {"user_id": "test_user_id"}
    response = await api_client.patch(
        "/api/tasks/task_123",
        json={"video_title": "New Title"},
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 200
    mock_db_client.update_task_status.assert_called_with(
        "task_123",
        video_title="New Title",
    )


@pytest.mark.asyncio
async def test_update_task_title_not_owner(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {"user_id": "other_user"}
    response = await api_client.patch(
        "/api/tasks/task_123",
        json={"video_title": "New Title"},
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_task_status(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {
        "id": "task_123",
        "user_id": "test_user_id",
        "status": "completed",
        "progress": 100,
    }
    response = await api_client.get(
        "/api/tasks/task_123/status",
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_get_task_status_not_found(api_client, mock_db_client):
    mock_db_client.get_task.return_value = None
    response = await api_client.get(
        "/api/tasks/missing/status",
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_task_status_not_owner(api_client, mock_db_client):
    mock_db_client.get_task.return_value = {
        "id": "task_123",
        "user_id": "other_user",
        "is_demo": False,
    }
    response = await api_client.get(
        "/api/tasks/task_123/status",
        headers={"Authorization": "Bearer token"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_authenticated_user_can_create_task(
    mock_db_client,
    mock_coinbase_client,
    mock_task_queue,
):
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_client] = lambda: mock_db_client
    app.dependency_overrides[get_task_queue] = lambda: mock_task_queue
    app.dependency_overrides[get_current_user] = lambda: "auth-user-id"
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/api/process-video",
                data={"video_url": "https://youtube.com/watch?v=123"},
                headers={"Authorization": "Bearer token"},
            )
        assert response.status_code == 200
        mock_task_queue.submit_process_video.assert_called_once_with(
            video_url="https://youtube.com/watch?v=123",
            user_id="auth-user-id",
            guest_id=None,
        )
    finally:
        app.dependency_overrides = saved
