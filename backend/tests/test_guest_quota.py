import pytest
from httpx import AsyncClient
from main import app
from unittest.mock import patch
import uuid
import asyncio
import dependencies as deps

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def isolate_guest_quota():
    """Guest usage is now tracked in DB. No in-memory state to reset."""
    yield

@pytest.mark.asyncio
async def test_guest_quota_enforcement(async_client: AsyncClient, monkeypatch):
    """
    TDD Test:
    1. First request with a new guest ID should succeed (200).
    2. Second request with the same guest ID should fail (402).
    """
    monkeypatch.setenv("DEV_AUTH_BYPASS", "false")
    guest_id = str(uuid.uuid4())
    headers = {"X-Guest-Id": guest_id}
    payload = {"video_url": "https://youtube.com/watch?v=first"}

    # Mock background pipeline to avoid real processing
    with patch("api.routes.tasks.run_pipeline"):
        
        # 1. First attempt - Should PASS
        response1 = await async_client.post(
            "/api/process-video", 
            data=payload,
            headers=headers
        )
        assert response1.status_code == 200, f"First request failed: {response1.text}"
        
        # Tiny delay to ensure DB write is committed and visible
        await asyncio.sleep(0.1)
        
        # 2. Second attempt with same Guest ID - Should FAIL with 402
        payload2 = {"video_url": "https://youtube.com/watch?v=second"}
        response2 = await async_client.post(
            "/api/process-video", 
            data=payload2,
            headers=headers
        )
        
        assert response2.status_code == 402
        assert "Guest quota exceeded" in response2.json()["detail"]

@pytest.mark.asyncio
async def test_different_guests_have_independent_quotas(async_client: AsyncClient, monkeypatch):
    """
    TDD Test: Guest A and Guest B should each get 1 free trial.
    """
    monkeypatch.setenv("DEV_AUTH_BYPASS", "false")
    guest_a = str(uuid.uuid4())
    guest_b = str(uuid.uuid4())
    
    with patch("api.routes.tasks.run_pipeline"):
        # Guest A's first request
        res_a = await async_client.post(
            "/api/process-video", 
            data={"video_url": "https://youtube.com/watch?v=a1"},
            headers={"X-Guest-Id": guest_a}
        )
        assert res_a.status_code == 200
        
        # Guest B's first request
        res_b = await async_client.post(
            "/api/process-video", 
            data={"video_url": "https://youtube.com/watch?v=b1"},
            headers={"X-Guest-Id": guest_b}
        )
        assert res_b.status_code == 200
