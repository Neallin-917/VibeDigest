import pytest
from unittest.mock import AsyncMock, MagicMock

from scripts.tasks.create_demo import (
    create_demo_task,
    resolve_demo_user_id,
)
from services.task_queue import TaskSubmission


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
    db.get_task.return_value = {"id": "task-1", "status": "pending"}
    queue = MagicMock()
    queue.submit_catalog_video.return_value = TaskSubmission(
        task_id="task-1", resolution="created", message_id=1
    )
    monkeypatch.setenv("VIBEDIGEST_DEMO_USER_ID", "user-1")

    result = await create_demo_task(
        db=db,
        task_queue=queue,
        video_url="https://www.youtube.com/watch?v=7rzYDM6vMtI&utm_source=x",
        run_workflow=False,
    )

    assert result.task_id == "task-1"
    assert result.user_id == "user-1"
    assert result.video_url == "https://youtube.com/watch?v=7rzYDM6vMtI"
    assert result.ran_workflow is False
    queue.submit_catalog_video.assert_called_once_with(
        user_id="user-1",
        video_url="https://youtube.com/watch?v=7rzYDM6vMtI",
        publish_on_complete=True,
        output_intent={"source": "manual_demo"},
    )
    db.create_task.assert_not_called()


@pytest.mark.asyncio
async def test_create_demo_task_runs_workflow_when_enabled(monkeypatch):
    db = MagicMock()
    db.get_task.return_value = {"id": "task-1", "status": "completed"}
    queue = MagicMock()
    queue.submit_catalog_video.return_value = TaskSubmission(
        task_id="task-1", resolution="created", message_id=1
    )
    runner = AsyncMock()
    monkeypatch.setenv("VIBEDIGEST_DEMO_USER_ID", "user-1")

    result = await create_demo_task(
        db=db,
        task_queue=queue,
        video_url="https://youtube.com/watch?v=7rzYDM6vMtI",
        run_workflow=True,
        workflow_runner=runner,
    )

    runner.assert_awaited_once_with(1)
    assert result.status == "completed"
    assert result.ran_workflow is True
