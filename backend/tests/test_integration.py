import pytest
from httpx import AsyncClient
from sqlalchemy import text
from main import app
from dependencies import get_current_user, get_db_client, get_task_queue
import dependencies as deps

pytestmark = pytest.mark.integration

# --- Authentication Mock ---
# Bypass Supabase token validation logic in main.py,
# but we MUST ensure this user exists in our Test DB (auth.users)
TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


async def mock_get_current_user():
    return TEST_USER_ID


@pytest.fixture(autouse=True)
def isolate_quota():
    """Guest usage is now tracked in DB. No in-memory state to reset."""
    yield


@pytest.fixture
def mock_auth():
    """Override get_current_user to return TEST_USER_ID (opt-in per test)."""
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_current_user] = mock_get_current_user
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved)


@pytest.fixture(autouse=True)
def setup_test_data(async_client):
    """Ensure test user exists in DB before each test."""
    try:
        db = app.dependency_overrides[get_db_client]()
    except KeyError:
        return

    if not db.engine:
        return

    with db.engine.connect() as conn:
        # 1. Create fake user in auth.users
        conn.execute(text("""
            INSERT INTO auth.users (id, email)
            VALUES (:uid, 'test@example.com')
            ON CONFLICT (id) DO NOTHING
        """), {"uid": TEST_USER_ID})

        # 2. Create profile
        conn.execute(text("""
            INSERT INTO public.profiles (id, tier, usage_limit, usage_count)
            VALUES (:uid, 'free', 100, 0)
            ON CONFLICT (id) DO UPDATE SET usage_count = 0
        """), {"uid": TEST_USER_ID})

        # Clean tasks and guest usage
        conn.execute(text("DELETE FROM task_outputs"))
        conn.execute(text("DELETE FROM tasks"))
        conn.execute(text("DELETE FROM guest_usage"))

        conn.commit()


@pytest.mark.asyncio
async def test_process_video_endpoint_real_db(async_client: AsyncClient, monkeypatch, mock_auth):
    """Test creating and enqueueing a video task using the real test database."""
    monkeypatch.setenv("DEV_AUTH_BYPASS", "false")

    response = await async_client.post(
        "/api/process-video",
        data={"video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        headers={"Authorization": "Bearer fake-token"},  # mark as authenticated
    )

    assert response.status_code == 200, f"Response: {response.text}"
    data = response.json()
    task_id = data["task_id"]
    assert task_id

    # --- VERIFY DB SIDE EFFECTS ---
    db = app.dependency_overrides[get_db_client]()
    with db.engine.connect() as conn:
        # 1. Task created with correct user and URL
        res = conn.execute(
            text("SELECT * FROM tasks WHERE id = :tid"), {"tid": task_id}
        ).fetchone()
        assert res is not None
        assert str(res._mapping["user_id"]) == TEST_USER_ID
        assert res._mapping["video_url"] == "https://youtube.com/watch?v=dQw4w9WgXcQ"

        # 2. Placeholder outputs created
        res_outs = conn.execute(
            text("SELECT * FROM task_outputs WHERE task_id = :tid"), {"tid": task_id}
        ).fetchall()
        kinds = [row._mapping["kind"] for row in res_outs]
        assert "script" in kinds
        assert "summary" in kinds

    # 3. Durable queue boundary was invoked.
    queue = app.dependency_overrides[get_task_queue]()
    queue.submit_process_video.assert_called_with(
        video_url="https://youtube.com/watch?v=dQw4w9WgXcQ",
        user_id=TEST_USER_ID,
        guest_id=None,
    )


@pytest.mark.asyncio
async def test_process_video_guest_quota_exceeded_real_db(
    async_client: AsyncClient, monkeypatch
):
    """Guest quota enforcement: second request with the same X-Guest-Id returns 402."""
    monkeypatch.setenv("DEV_AUTH_BYPASS", "false")
    guest_id = "integration-test-guest-001"

    # First request — should succeed
    r1 = await async_client.post(
        "/api/process-video",
        data={"video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        headers={"X-Guest-Id": guest_id},
    )
    assert r1.status_code == 200, f"First guest request failed: {r1.text}"

    # Second request with same guest_id — quota exceeded
    r2 = await async_client.post(
        "/api/process-video",
        data={"video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        headers={"X-Guest-Id": guest_id},
    )
    assert r2.status_code == 402
    assert "quota" in r2.json()["detail"].lower()
