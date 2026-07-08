import pytest
from unittest.mock import AsyncMock, MagicMock

from scripts.tasks.create_demo import (
    INITIAL_OUTPUT_KINDS,
    create_demo_task,
    resolve_demo_user_id,
)


def test_resolve_demo_user_id_prefers_explicit_value(monkeypatch):
    db = MagicMock()
    monkeypatch.setenv("VIBEDIGEST_DEMO_USER_ID", "env-user")

    result = resolve_demo_user_id(db, " explicit-user ")

    assert result == "explicit-user"
    db._execute_query.assert_not_called()


def test_resolve_demo_user_id_uses_configured_default(monkeypatch):
    db = MagicMock()
    monkeypatch.setenv("VIBEDIGEST_DEMO_USER_ID", "env-user")

    result = resolve_demo_user_id(db)

    assert result == "env-user"
    db._execute_query.assert_not_called()


def test_resolve_demo_user_id_falls_back_to_first_profile(monkeypatch):
    db = MagicMock()
    db._execute_query.return_value = [{"id": "profile-user"}]
    monkeypatch.delenv("VIBEDIGEST_DEMO_USER_ID", raising=False)
    monkeypatch.delenv("DEMO_USER_ID", raising=False)

    result = resolve_demo_user_id(db)

    assert result == "profile-user"
    db._execute_query.assert_called_once()


def test_resolve_demo_user_id_requires_an_account(monkeypatch):
    db = MagicMock()
    db._execute_query.return_value = []
    monkeypatch.delenv("VIBEDIGEST_DEMO_USER_ID", raising=False)
    monkeypatch.delenv("DEMO_USER_ID", raising=False)

    with pytest.raises(RuntimeError, match="No default profile found"):
        resolve_demo_user_id(db)


@pytest.mark.asyncio
async def test_create_demo_task_creates_public_task_without_running_workflow(monkeypatch):
    db = MagicMock()
    db.create_task.return_value = {"id": "task-1", "status": "pending"}
    db.get_task.return_value = {"id": "task-1", "status": "pending"}
    monkeypatch.setenv("VIBEDIGEST_DEMO_USER_ID", "user-1")

    result = await create_demo_task(
        db=db,
        video_url="https://www.youtube.com/watch?v=7rzYDM6vMtI&utm_source=x",
        run_workflow=False,
    )

    assert result.task_id == "task-1"
    assert result.user_id == "user-1"
    assert result.video_url == "https://youtube.com/watch?v=7rzYDM6vMtI"
    assert result.ran_workflow is False
    db.create_task.assert_called_once_with(
        user_id="user-1",
        video_url="https://youtube.com/watch?v=7rzYDM6vMtI",
        video_title=None,
        is_demo=True,
    )
    db.ensure_task_outputs.assert_called_once_with(
        "task-1",
        "user-1",
        INITIAL_OUTPUT_KINDS,
    )


@pytest.mark.asyncio
async def test_create_demo_task_runs_workflow_when_enabled(monkeypatch):
    db = MagicMock()
    db.create_task.return_value = {"id": "task-1", "status": "pending"}
    db.get_task.return_value = {"id": "task-1", "status": "completed"}
    runner = AsyncMock()
    monkeypatch.setenv("VIBEDIGEST_DEMO_USER_ID", "user-1")

    result = await create_demo_task(
        db=db,
        video_url="https://youtube.com/watch?v=7rzYDM6vMtI",
        run_workflow=True,
        workflow_runner=runner,
    )

    runner.assert_awaited_once_with(
        "task-1",
        "https://youtube.com/watch?v=7rzYDM6vMtI",
        "user-1",
    )
    assert result.status == "completed"
    assert result.ran_workflow is True
