from __future__ import annotations

import asyncio
import json
import re
import signal
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.execution_policy import WorkerProfile
from services.task_queue import QueuedJob
from worker import AgentAnswerWorker, WorkerConfig, build_agent_worker, serve


def worker_config(max_attempts: int = 3) -> WorkerConfig:
    return WorkerConfig(
        visibility_timeout_seconds=300,
        heartbeat_interval_seconds=60,
        execution_timeout_seconds=60,
        max_attempts=max_attempts,
        max_poll_seconds=1,
    )


def agent_job(*, message_id: int = 21, read_count: int = 1) -> QueuedJob:
    return QueuedJob(
        message_id=message_id,
        read_count=read_count,
        message={
            "version": 1,
            "kind": "agent_continue",
            "job_id": "00000000-0000-0000-0000-000000000021",
            "turn_id": "turn-1",
        },
    )


def running_turn(
    *,
    status: str = "running",
    queue_name: str = "agent_answers",
    runtime: str = "api",
    attempts: int = 0,
    lease_seconds: int = -30,
) -> dict[str, object]:
    return {
        "id": "turn-1",
        "status": status,
        "lease_until": datetime.now(timezone.utc) + timedelta(seconds=lease_seconds),
        "continuation_queue": queue_name,
        "runtime_config": {"runtime": runtime},
        "continuation_attempts": attempts,
    }


def install_agent_turns(monkeypatch: pytest.MonkeyPatch, service: MagicMock) -> None:
    monkeypatch.setitem(
        __import__("sys").modules,
        "services.agent_turns",
        SimpleNamespace(AgentTurns=lambda _db: service),
    )


class FakeResponse:
    def __init__(self, *, status_code: int, payload: dict[str, object]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, object]:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")


class RecordingAsyncClient:
    def __init__(self, *, response: FakeResponse, recorder: list[dict[str, object]], **_kwargs):
        self._response = response
        self._recorder = recorder

    async def __aenter__(self) -> "RecordingAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, url: str, *, content: str, headers: dict[str, str]) -> FakeResponse:
        self._recorder.append({"url": url, "content": content, "headers": headers})
        return self._response


@pytest.mark.asyncio
async def test_agent_worker_signs_fixed_callback_and_archives_after_terminal_commit(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    service.get.side_effect = [
        running_turn(),
        running_turn(status="completed"),
    ]
    install_agent_turns(monkeypatch, service)
    db = MagicMock()
    monkeypatch.setattr("worker.get_db_client", lambda: db)
    monkeypatch.setattr("worker.time.time", lambda: 1_700_000_000)
    recorded: list[dict[str, object]] = []
    monkeypatch.setattr(
        "worker.httpx.AsyncClient",
        lambda **kwargs: RecordingAsyncClient(
            response=FakeResponse(status_code=200, payload={"completed": True}),
            recorder=recorded,
            **kwargs,
        ),
    )
    worker = AgentAnswerWorker(
        queue,
        worker_config(),
        "https://agent.example/internal/continue",
        "s" * 32,
        "api",
    )

    await worker._process(agent_job(message_id=77, read_count=4))

    assert len(recorded) == 1
    request = recorded[0]
    assert request["url"] == "https://agent.example/internal/continue"
    assert request["content"] == (
        '{"turnId":"turn-1","jobId":"00000000-0000-0000-0000-000000000021",'
        '"queueName":"agent_answers","messageId":77,"readCount":4}'
    )
    assert request["headers"]["x-agent-sent-at"] == "1700000000"
    assert request["headers"]["x-agent-signature"] == (
        "70d9a6807dc41e78877aca74abc0a5ce1c97bed06cc540dc5e217cc874068f8b"
    )
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000021",
        message_id=77,
        status="completed",
    )
    service.fail_continuation.assert_not_called()


@pytest.mark.asyncio
async def test_agent_worker_defers_when_turn_is_already_finalizing_with_active_lease(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    service.get.return_value = running_turn(status="finalizing", lease_seconds=45)
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    worker = AgentAnswerWorker(
        queue, worker_config(), "https://agent.example/continue", "s" * 32, "api"
    )

    await worker._process(agent_job(message_id=31))

    queue.set_visibility.assert_called_once()
    args = queue.set_visibility.call_args.args
    assert args[0] == 31
    assert 1 <= args[1] <= 46
    queue.archive.assert_not_called()
    service.fail_continuation.assert_not_called()


@pytest.mark.asyncio
async def test_agent_worker_rejects_persisted_capability_mismatch_and_archives_failed(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    service.get.return_value = running_turn(queue_name="agent_answers_local_fixture")
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    worker = AgentAnswerWorker(
        queue, worker_config(), "https://agent.example/continue", "s" * 32, "api"
    )

    await worker._process(agent_job(message_id=32))

    service.fail_continuation.assert_called_once_with(
        "turn-1", "00000000-0000-0000-0000-000000000021"
    )
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000021",
        message_id=32,
        status="failed",
    )
    queue.set_visibility.assert_not_called()


@pytest.mark.asyncio
async def test_agent_worker_model_budget_uses_continuation_attempts_not_delivery_count(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    service.get.return_value = running_turn(attempts=2)
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    worker = AgentAnswerWorker(
        queue,
        worker_config(max_attempts=2),
        "https://agent.example/continue",
        "s" * 32,
        "api",
    )

    await worker._process(agent_job(message_id=33, read_count=99))

    service.fail_continuation.assert_called_once_with(
        "turn-1", "00000000-0000-0000-0000-000000000021"
    )
    queue.archive.assert_called_once_with(
        job_id="00000000-0000-0000-0000-000000000021",
        message_id=33,
        status="failed",
    )


@pytest.mark.asyncio
async def test_agent_worker_failed_attempt_budget_reads_turn_continuation_attempts(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    worker = AgentAnswerWorker(
        queue,
        worker_config(max_attempts=3),
        "https://agent.example/continue",
        "s" * 32,
        "api",
    )
    job = agent_job(read_count=99)

    service.get.return_value = running_turn(status="failed", attempts=1)
    assert await worker._has_exhausted_attempts(job) is False

    service.get.return_value = running_turn(status="failed", attempts=3)
    assert await worker._has_exhausted_attempts(job) is True


@pytest.mark.asyncio
async def test_agent_worker_finalizing_turn_does_not_burn_model_attempt_budget(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    worker = AgentAnswerWorker(
        queue,
        worker_config(max_attempts=1),
        "https://agent.example/continue",
        "s" * 32,
        "api",
    )

    service.get.return_value = running_turn(status="finalizing", attempts=99)
    assert await worker._has_exhausted_attempts(agent_job(read_count=99)) is False


@pytest.mark.asyncio
async def test_agent_worker_202_response_defers_active_delivery_without_failure(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    service.get.return_value = running_turn()
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    monkeypatch.setattr(
        "worker.httpx.AsyncClient",
        lambda **kwargs: RecordingAsyncClient(
            response=FakeResponse(status_code=202, payload={"deferSeconds": 45}),
            recorder=[],
            **kwargs,
        ),
    )
    worker = AgentAnswerWorker(
        queue, worker_config(), "https://agent.example/continue", "s" * 32, "api"
    )

    await worker._process(agent_job(message_id=34))

    queue.set_visibility.assert_called_once_with(34, 45)
    queue.archive.assert_not_called()
    service.fail_continuation.assert_not_called()


@pytest.mark.asyncio
async def test_agent_worker_requires_terminal_commit_before_archive(
    monkeypatch: pytest.MonkeyPatch,
):
    queue = MagicMock()
    queue.queue_name = "agent_answers"
    queue.db = MagicMock()
    service = MagicMock()
    service.get.side_effect = [
        running_turn(),
        running_turn(status="running"),
        running_turn(status="running"),
    ]
    install_agent_turns(monkeypatch, service)
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())
    monkeypatch.setattr(
        "worker.httpx.AsyncClient",
        lambda **kwargs: RecordingAsyncClient(
            response=FakeResponse(status_code=200, payload={"completed": True}),
            recorder=[],
            **kwargs,
        ),
    )
    worker = AgentAnswerWorker(
        queue, worker_config(), "https://agent.example/continue", "s" * 32, "api"
    )

    await worker._process(agent_job(message_id=35))

    queue.set_visibility.assert_called_once_with(35, 30)
    queue.archive.assert_not_called()
    service.fail_continuation.assert_not_called()


@pytest.mark.asyncio
async def test_build_agent_worker_validates_url_secret_and_local_queue(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("worker.get_db_client", lambda: MagicMock())

    monkeypatch.delenv("AGENT_INTERNAL_SECRET", raising=False)
    monkeypatch.delenv("AGENT_CONTINUATION_URL", raising=False)
    assert await build_agent_worker() is None

    monkeypatch.setenv("AGENT_INTERNAL_SECRET", "short")
    monkeypatch.setenv("AGENT_CONTINUATION_URL", "https://agent.example/continue")
    with pytest.raises(RuntimeError, match="callback URL and a service secret"):
        await build_agent_worker()

    monkeypatch.setenv("AGENT_INTERNAL_SECRET", "s" * 32)
    monkeypatch.setenv("AGENT_CONTINUATION_URL", "https://user:pass@agent.example/continue?x=1")
    with pytest.raises(RuntimeError, match="Invalid fixed Agent continuation URL"):
        await build_agent_worker()

    monkeypatch.setenv("AGENT_CONTINUATION_URL", "http://agent.example/continue")
    monkeypatch.setenv("AGENT_CONTINUATION_RUNTIME", "codex_local")
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers")
    monkeypatch.setenv("RAILWAY_PROJECT_ID", "railway")
    with pytest.raises(RuntimeError, match="HTTPS hosted runtime"):
        await build_agent_worker()

    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    with pytest.raises(RuntimeError, match="developer-scoped queue"):
        await build_agent_worker()


@pytest.mark.asyncio
async def test_build_agent_worker_creates_local_queue_only_for_local_runtime(
    monkeypatch: pytest.MonkeyPatch,
):
    db = MagicMock()
    monkeypatch.setattr("worker.get_db_client", lambda: db)
    monkeypatch.setattr("worker.WorkerConfig.from_env", lambda: worker_config())
    monkeypatch.setenv("AGENT_INTERNAL_SECRET", "s" * 32)
    monkeypatch.setenv("AGENT_CONTINUATION_URL", "https://agent.example/continue")

    monkeypatch.setenv("AGENT_CONTINUATION_RUNTIME", "api")
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers")
    api_worker = await build_agent_worker()
    assert api_worker is not None
    assert api_worker.runtime == "api"
    assert api_worker.profile.name == WorkerProfile.HOSTED_API
    db._execute_query.assert_not_called()

    db.reset_mock()
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers_local_fixture_api")
    local_api_worker = await build_agent_worker()
    assert local_api_worker is not None
    assert local_api_worker.runtime == "api"
    assert local_api_worker.queue.queue_name == "agent_answers_local_fixture_api"
    db._execute_query.assert_called_once_with(
        "SELECT pgmq.create(:name)", {"name": "agent_answers_local_fixture_api"}
    )

    db.reset_mock()
    monkeypatch.setenv("AGENT_CONTINUATION_RUNTIME", "codex_local")
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers_local_fixture")
    local_worker = await build_agent_worker()
    assert local_worker is not None
    assert local_worker.runtime == "codex_local"
    assert local_worker.queue.queue_name == "agent_answers_local_fixture"
    assert local_worker.profile.name == WorkerProfile.HOSTED_API
    db._execute_query.assert_called_once_with(
        "SELECT pgmq.create(:name)", {"name": "agent_answers_local_fixture"}
    )


def stop_serve_after_first_polls(
    monkeypatch: pytest.MonkeyPatch, *workers: SimpleNamespace
) -> None:
    """Exercise the real consumers without installing process signal handlers."""
    handlers = {}
    monkeypatch.setattr(
        asyncio.get_running_loop(),
        "add_signal_handler",
        lambda number, callback: handlers.__setitem__(number, callback),
    )
    polled = set()

    def run_once_for(current: SimpleNamespace):
        async def run_once():
            polled.add(id(current))
            if len(polled) == len(workers):
                handlers[signal.SIGTERM]()
            # Both hosted consumers must get a turn before the loop stops.
            await asyncio.sleep(0)
            return True

        return AsyncMock(side_effect=run_once)

    for current in workers:
        current.run_once = run_once_for(current)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "queue_name",
    [
        None,
        "",
        "agent_answers",
        "video_processing",
        "podcast_supply",
        "agent_answers_local",
        "agent_answers_locality_fixture",
        "custom_agent_answers_local_fixture",
    ],
)
async def test_agent_only_rejects_non_local_queue_before_building_any_worker(
    monkeypatch: pytest.MonkeyPatch, queue_name: str | None
):
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    if queue_name is None:
        monkeypatch.delenv("AGENT_CONTINUATION_QUEUE", raising=False)
    else:
        monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", queue_name)
    video_builder = AsyncMock()
    agent_builder = AsyncMock()
    monkeypatch.setattr("worker.build_worker", video_builder)
    monkeypatch.setattr("worker.build_agent_worker", agent_builder)

    with pytest.raises(RuntimeError, match="local developer-scoped"):
        await serve(agent_only=True)

    video_builder.assert_not_called()
    agent_builder.assert_not_called()


@pytest.mark.asyncio
async def test_agent_only_rejects_railway_before_building_any_worker(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("RAILWAY_PROJECT_ID", "railway-fixture")
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers_local_fixture")
    video_builder = AsyncMock()
    agent_builder = AsyncMock()
    monkeypatch.setattr("worker.build_worker", video_builder)
    monkeypatch.setattr("worker.build_agent_worker", agent_builder)

    with pytest.raises(RuntimeError, match="local developer-scoped"):
        await serve(agent_only=True)

    video_builder.assert_not_called()
    agent_builder.assert_not_called()


@pytest.mark.asyncio
async def test_agent_only_requires_continuation_configuration(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers_local_fixture")
    video_builder = AsyncMock()
    agent_builder = AsyncMock(return_value=None)
    monkeypatch.setattr("worker.build_worker", video_builder)
    monkeypatch.setattr("worker.build_agent_worker", agent_builder)

    with pytest.raises(RuntimeError, match="continuation configuration"):
        await serve(agent_only=True)

    video_builder.assert_not_called()
    agent_builder.assert_awaited_once_with()


@pytest.mark.asyncio
@pytest.mark.parametrize("runtime", ["api", "codex_local"])
async def test_agent_only_runs_only_the_local_continuation_consumer(
    monkeypatch: pytest.MonkeyPatch, runtime: str
):
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers_local_fixture")
    monkeypatch.setenv("AGENT_CONTINUATION_RUNTIME", runtime)
    continuation = SimpleNamespace(
        queue=SimpleNamespace(queue_name="agent_answers_local_fixture")
    )
    video_builder = AsyncMock()
    agent_builder = AsyncMock(return_value=continuation)
    monkeypatch.setattr("worker.build_worker", video_builder)
    monkeypatch.setattr("worker.build_agent_worker", agent_builder)
    stop_serve_after_first_polls(monkeypatch, continuation)

    await asyncio.wait_for(serve(agent_only=True), timeout=1)

    video_builder.assert_not_called()
    agent_builder.assert_awaited_once_with()
    continuation.run_once.assert_awaited_once_with()


@pytest.mark.asyncio
@pytest.mark.parametrize("has_continuation", [False, True])
async def test_normal_serve_keeps_hosted_video_and_optional_agent_consumers(
    monkeypatch: pytest.MonkeyPatch, has_continuation: bool
):
    monkeypatch.setenv("RAILWAY_PROJECT_ID", "railway-fixture")
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers")
    video = SimpleNamespace(
        profile=SimpleNamespace(name=WorkerProfile.HOSTED_API),
        queue=SimpleNamespace(queue_name="video_processing"),
    )
    continuation = SimpleNamespace(queue=SimpleNamespace(queue_name="agent_answers"))
    video_builder = AsyncMock(return_value=video)
    agent_builder = AsyncMock(
        return_value=continuation if has_continuation else None
    )
    monkeypatch.setattr("worker.build_worker", video_builder)
    monkeypatch.setattr("worker.build_agent_worker", agent_builder)
    consumers = [video, continuation] if has_continuation else [video]
    stop_serve_after_first_polls(monkeypatch, *consumers)

    await asyncio.wait_for(serve(), timeout=1)

    video_builder.assert_awaited_once_with()
    agent_builder.assert_awaited_once_with()
    for consumer in consumers:
        consumer.run_once.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_normal_serve_keeps_trusted_catalog_consumer_separate(
    monkeypatch: pytest.MonkeyPatch,
):
    catalog = SimpleNamespace(
        profile=SimpleNamespace(name=WorkerProfile.TRUSTED_CODEX),
        queue=SimpleNamespace(queue_name="podcast_supply"),
    )
    video_builder = AsyncMock(return_value=catalog)
    agent_builder = AsyncMock()
    monkeypatch.setattr("worker.build_worker", video_builder)
    monkeypatch.setattr("worker.build_agent_worker", agent_builder)
    stop_serve_after_first_polls(monkeypatch, catalog)

    await asyncio.wait_for(serve(), timeout=1)

    video_builder.assert_awaited_once_with()
    agent_builder.assert_not_called()
    catalog.run_once.assert_awaited_once_with()


def test_development_compose_worker_is_explicitly_agent_only():
    compose = (Path(__file__).resolve().parents[2] / "docker-compose.yml").read_text()
    worker_section = re.search(
        r"^  worker-dev:\n(.*?)(?=^  [\w-]+:\n|\Z)",
        compose,
        flags=re.MULTILINE | re.DOTALL,
    )
    assert worker_section is not None
    command = re.search(r"^    command: (.+)$", worker_section[1], re.MULTILINE)
    assert command is not None
    assert json.loads(command[1]) == ["python", "worker.py", "--agent-only"]
