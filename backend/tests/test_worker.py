import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from services.execution_policy import WorkerProfile, resolve_worker_profile
from services.task_queue import QueuedJob
from services.job_handlers import NonRetryableJobError
from worker import (
    LeaseLostError,
    TaskWorker,
    WorkerConfig,
    drain_worker,
    verify_codex_subscription,
)


def worker_config(
    max_attempts: int = 3,
    execution_timeout_seconds: int = 60,
) -> WorkerConfig:
    return WorkerConfig(
        visibility_timeout_seconds=300,
        heartbeat_interval_seconds=60,
        execution_timeout_seconds=execution_timeout_seconds,
        max_attempts=max_attempts,
        max_poll_seconds=1,
    )


def video_job(*, message_id: int = 11, read_count: int = 1) -> QueuedJob:
    return QueuedJob(
        message_id=message_id,
        read_count=read_count,
        message={
            "version": 1,
            "kind": "process_video",
            "job_id": "00000000-0000-0000-0000-000000000099",
            "task_id": "task-1",
        },
    )


@pytest.mark.asyncio
async def test_worker_processes_and_archives_video_job():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config())
    db = MagicMock()
    db.get_task.return_value = {
        "id": "task-1",
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "user_submission",
    }

    with (
        patch("worker.get_db_client", return_value=db),
        patch("worker.run_pipeline", new=AsyncMock()) as run_pipeline,
    ):
        await worker._process(video_job())

    run_pipeline.assert_awaited_once_with(
        task_id="task-1",
        video_url="https://example.com/video",
        user_id="user-1",
        guest_id=None,
    )
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000099",
        message_id=11,
        status="completed",
    )
    queue.set_visibility.assert_not_called()


@pytest.mark.asyncio
async def test_worker_archives_untraceable_poison_message():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config())
    job = QueuedJob(
        message_id=99,
        read_count=1,
        message={"version": 1, "kind": "process_video", "task_id": "task-1"},
    )

    await worker._process(job)

    queue.archive_invalid.assert_called_once_with(99)
    queue.archive.assert_not_called()
    queue.set_visibility.assert_not_called()


@pytest.mark.asyncio
async def test_worker_archives_message_with_non_uuid_job_id_before_dispatch():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config())
    job = QueuedJob(
        message_id=100,
        read_count=1,
        message={
            "version": 1,
            "kind": "process_video",
            "job_id": "not-a-uuid",
            "task_id": "task-1",
        },
    )

    await worker._process(job)

    queue.validate_delivery.assert_not_called()
    queue.archive_invalid.assert_called_once_with(100)


@pytest.mark.asyncio
async def test_worker_archives_message_when_handoff_does_not_match():
    queue = MagicMock()
    queue.validate_delivery.return_value = False
    worker = TaskWorker(queue, worker_config())

    await worker._process(video_job(message_id=101))

    queue.archive_invalid.assert_called_once_with(101)
    queue.archive.assert_not_called()


@pytest.mark.asyncio
async def test_worker_retries_failed_job_without_archiving():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config())
    db = MagicMock()
    db.get_task.return_value = {
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "user_submission",
    }

    with (
        patch("worker.get_db_client", return_value=db),
        patch(
            "worker.run_pipeline",
            new=AsyncMock(side_effect=RuntimeError("provider unavailable")),
        ),
    ):
        await worker._process(video_job(message_id=12))

    queue.set_visibility.assert_called_once_with(12, 30)
    queue.archive.assert_not_called()


@pytest.mark.asyncio
async def test_worker_archives_non_retryable_output_failure_immediately():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config())
    db = MagicMock()
    db.get_output.return_value = {
        "id": "output-1",
        "task_id": "task-1",
        "status": "pending",
        "user_id": "user-1",
    }
    db.get_task.return_value = {
        "id": "task-1",
        "workload_kind": "user_submission",
    }
    job = QueuedJob(
        message_id=17,
        read_count=1,
        message={
            "version": 1,
            "kind": "retry_output",
            "job_id": "00000000-0000-0000-0000-000000000098",
            "output_id": "output-1",
        },
    )

    with (
        patch("worker.get_db_client", return_value=db),
        patch(
            "worker.handle_retry_output",
            new=AsyncMock(side_effect=NonRetryableJobError("missing source")),
        ),
    ):
        await worker._process(job)

    db.mark_output_failed_if_not_completed.assert_called_once()
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000098",
        message_id=17,
        status="failed",
    )
    queue.set_visibility.assert_not_called()


@pytest.mark.asyncio
async def test_worker_marks_terminal_failure_and_archives():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config(max_attempts=2))
    db = MagicMock()
    db.get_task.return_value = {
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "user_submission",
    }

    with (
        patch("worker.get_db_client", return_value=db),
        patch(
            "worker.run_pipeline",
            new=AsyncMock(side_effect=RuntimeError("permanent failure")),
        ),
    ):
        await worker._process(video_job(message_id=13, read_count=2))

    db.mark_task_failed_if_not_completed.assert_called_once()
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000099",
        message_id=13,
        status="failed",
    )
    queue.set_visibility.assert_not_called()


@pytest.mark.asyncio
async def test_worker_does_not_archive_when_heartbeat_loses_lease():
    queue = MagicMock()
    worker = TaskWorker(
        queue,
        WorkerConfig(
            visibility_timeout_seconds=2,
            heartbeat_interval_seconds=1,
            execution_timeout_seconds=10,
            max_attempts=3,
            max_poll_seconds=1,
        ),
    )
    queue.set_visibility.side_effect = RuntimeError("lease missing")
    db = MagicMock()
    db.get_task.return_value = {
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "user_submission",
    }

    async def hang(**_):
        await asyncio.sleep(5)

    with (
        patch("worker.get_db_client", return_value=db),
        patch("worker.run_pipeline", new=AsyncMock(side_effect=hang)),
        pytest.raises(LeaseLostError),
    ):
        await worker._process(video_job(message_id=14))

    queue.archive.assert_not_called()


@pytest.mark.asyncio
async def test_worker_times_out_and_retries():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config(execution_timeout_seconds=1))
    db = MagicMock()
    db.get_task.return_value = {
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "user_submission",
    }

    async def hang(**_):
        await asyncio.sleep(5)

    with (
        patch("worker.get_db_client", return_value=db),
        patch("worker.run_pipeline", new=AsyncMock(side_effect=hang)),
    ):
        await worker._process(video_job(message_id=15))

    queue.set_visibility.assert_called_once_with(15, 30)
    queue.archive.assert_not_called()


def test_worker_config_rejects_slow_heartbeat(monkeypatch):
    monkeypatch.setenv("TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS", "60")
    monkeypatch.setenv("TASK_QUEUE_HEARTBEAT_INTERVAL_SECONDS", "60")

    with pytest.raises(ValueError, match="must be shorter"):
        WorkerConfig.from_env()


@pytest.mark.asyncio
async def test_worker_never_downgrades_completed_task_after_archive_retries():
    queue = MagicMock()
    worker = TaskWorker(queue, worker_config(max_attempts=2))
    db = MagicMock()
    db.get_task.return_value = {
        "id": "task-1",
        "status": "completed",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "guest_id": None,
        "workload_kind": "user_submission",
    }

    with (
        patch("worker.get_db_client", return_value=db),
        patch("worker.run_pipeline", new=AsyncMock()) as run_pipeline,
    ):
        await worker._process(video_job(message_id=18, read_count=4))

    run_pipeline.assert_not_awaited()
    db.mark_task_failed_if_not_completed.assert_not_called()
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000099",
        message_id=18,
        status="completed",
    )


@pytest.mark.asyncio
async def test_hosted_worker_fails_closed_on_catalog_task():
    queue = MagicMock()
    worker = TaskWorker(
        queue,
        worker_config(),
        resolve_worker_profile(WorkerProfile.HOSTED_API),
    )
    db = MagicMock()
    db.get_task.return_value = {
        "id": "task-1",
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "catalog_supply",
    }

    with (
        patch("worker.get_db_client", return_value=db),
        patch("worker.run_pipeline", new=AsyncMock()) as run_pipeline,
    ):
        await worker._process(video_job(message_id=19))

    run_pipeline.assert_not_awaited()
    db.mark_task_failed_if_not_completed.assert_called_once()
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000099",
        message_id=19,
        status="failed",
    )


@pytest.mark.asyncio
async def test_trusted_codex_worker_processes_catalog_task():
    queue = MagicMock()
    worker = TaskWorker(
        queue,
        worker_config(),
        resolve_worker_profile(WorkerProfile.TRUSTED_CODEX),
    )
    db = MagicMock()
    db.get_task.return_value = {
        "id": "task-1",
        "status": "pending",
        "video_url": "https://example.com/video",
        "user_id": "user-1",
        "workload_kind": "catalog_supply",
    }

    with (
        patch("worker.get_db_client", return_value=db),
        patch("worker.run_pipeline", new=AsyncMock()) as run_pipeline,
    ):
        await worker._process(video_job(message_id=20))

    run_pipeline.assert_awaited_once()
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000099",
        message_id=20,
        status="completed",
    )


@pytest.mark.asyncio
async def test_codex_subscription_preflight_requires_chatgpt_account():
    codex = AsyncMock()
    codex.account.return_value = SimpleNamespace(
        account=SimpleNamespace(root=SimpleNamespace(type="apiKey"))
    )
    context = AsyncMock()
    context.__aenter__.return_value = codex

    with pytest.raises(RuntimeError, match="ChatGPT subscription"):
        await verify_codex_subscription(codex_factory=MagicMock(return_value=context))


@pytest.mark.asyncio
async def test_codex_subscription_preflight_returns_plan_without_email():
    account = SimpleNamespace(type="chatgpt", plan_type="plus", email="secret@example.com")
    codex = AsyncMock()
    codex.account.return_value = SimpleNamespace(
        account=SimpleNamespace(root=account)
    )
    context = AsyncMock()
    context.__aenter__.return_value = codex

    plan = await verify_codex_subscription(
        codex_factory=MagicMock(return_value=context)
    )

    assert plan == "plus"


@pytest.mark.asyncio
async def test_bounded_worker_drain_stops_when_queue_is_empty():
    worker = MagicMock()
    worker.run_once = AsyncMock(side_effect=[True, True, False])

    processed = await drain_worker(worker, max_jobs=5)

    assert processed == 2
    assert worker.run_once.await_count == 3


@pytest.mark.asyncio
async def test_bounded_worker_drain_respects_maximum():
    worker = MagicMock()
    worker.run_once = AsyncMock(return_value=True)

    processed = await drain_worker(worker, max_jobs=2)

    assert processed == 2
    assert worker.run_once.await_count == 2
