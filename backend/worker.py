import asyncio
import contextlib
import logging
import os
import signal
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from dependencies import get_db_client
from services.execution_policy import (
    ExecutionProfile,
    WorkerProfile,
    parse_workload_kind,
    resolve_worker_profile,
    validate_worker_runtime,
)
from services.job_handlers import (
    NonRetryableJobError,
    handle_retry_output,
    run_pipeline,
)
from services.task_queue import JOB_SCHEMA_VERSION, PostgresTaskQueue, QueuedJob

from config import settings

logger = logging.getLogger(__name__)


class PermanentJobError(Exception):
    """The message is validly delivered but cannot succeed on a later attempt."""


class LeaseLostError(Exception):
    """The PGMQ visibility lease can no longer be renewed."""


def _positive_int_env(name: str, default: int) -> int:
    raw_value = (os.getenv(name) or "").strip()
    if not raw_value:
        return default
    value = int(raw_value)
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


@dataclass(frozen=True)
class WorkerConfig:
    visibility_timeout_seconds: int
    heartbeat_interval_seconds: int
    execution_timeout_seconds: int
    max_attempts: int
    max_poll_seconds: int

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        visibility_timeout = _positive_int_env(
            "TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS", 300
        )
        heartbeat_interval = _positive_int_env(
            "TASK_QUEUE_HEARTBEAT_INTERVAL_SECONDS", 60
        )
        if heartbeat_interval >= visibility_timeout:
            raise ValueError(
                "TASK_QUEUE_HEARTBEAT_INTERVAL_SECONDS must be shorter than "
                "TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS"
            )
        return cls(
            visibility_timeout_seconds=visibility_timeout,
            heartbeat_interval_seconds=heartbeat_interval,
            execution_timeout_seconds=_positive_int_env(
                "TASK_QUEUE_EXECUTION_TIMEOUT_SECONDS", 3600
            ),
            max_attempts=_positive_int_env("TASK_QUEUE_MAX_ATTEMPTS", 3),
            max_poll_seconds=_positive_int_env("TASK_QUEUE_MAX_POLL_SECONDS", 5),
        )


class TaskWorker:
    def __init__(
        self,
        queue: PostgresTaskQueue,
        config: WorkerConfig,
        profile: ExecutionProfile | None = None,
    ) -> None:
        self.queue = queue
        self.config = config
        self.profile = profile or resolve_worker_profile(WorkerProfile.HOSTED_API)

    async def run_once(self) -> bool:
        jobs = await asyncio.to_thread(
            self.queue.read,
            visibility_timeout_seconds=self.config.visibility_timeout_seconds,
            max_poll_seconds=self.config.max_poll_seconds,
        )
        if not jobs:
            return False
        await self._process(jobs[0])
        return True

    async def _process(self, job: QueuedJob) -> None:
        try:
            job_id = job.job_id
        except ValueError as exc:
            logger.error(
                "Archiving invalid queue message %s: %s",
                job.message_id,
                exc,
            )
            await asyncio.to_thread(self.queue.archive_invalid, job.message_id)
            return

        is_valid_delivery = await asyncio.to_thread(
            self.queue.validate_delivery,
            job,
        )
        if not is_valid_delivery:
            logger.error(
                "Archiving queue message %s because its handoff does not match",
                job.message_id,
            )
            await asyncio.to_thread(self.queue.archive_invalid, job.message_id)
            return

        try:
            await self._run_with_heartbeat(job)
        except LeaseLostError:
            logger.exception("Queue lease lost for message %s", job.message_id)
            raise
        except (PermanentJobError, NonRetryableJobError) as exc:
            logger.warning("Rejecting permanent queue job %s: %s", job.message_id, exc)
            await self._mark_permanently_failed(job.message, str(exc))
            await self._archive(job, job_id=job_id, status="failed")
        except Exception as exc:
            logger.exception(
                "Queue job %s failed on attempt %s",
                job.message_id,
                job.read_count,
            )
            if job.read_count >= self.config.max_attempts:
                await self._mark_permanently_failed(job.message, str(exc))
                await self._archive(job, job_id=job_id, status="failed")
            else:
                retry_delay = min(30 * (2 ** max(job.read_count - 1, 0)), 300)
                try:
                    await asyncio.to_thread(
                        self.queue.set_visibility,
                        job.message_id,
                        retry_delay,
                    )
                except Exception as lease_error:
                    raise LeaseLostError(
                        f"Failed to defer message {job.message_id}"
                    ) from lease_error
        else:
            await self._archive(job, job_id=job_id, status="completed")

    async def _run_with_heartbeat(self, job: QueuedJob) -> None:
        stop_event = asyncio.Event()
        dispatch_task = asyncio.create_task(self._dispatch_with_timeout(job.message))
        heartbeat_task = asyncio.create_task(
            self._heartbeat(job.message_id, stop_event)
        )
        try:
            done, _ = await asyncio.wait(
                {dispatch_task, heartbeat_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if heartbeat_task in done:
                heartbeat_error = heartbeat_task.exception()
                if not dispatch_task.done():
                    dispatch_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await dispatch_task
                if heartbeat_error:
                    raise LeaseLostError(
                        f"Heartbeat failed for message {job.message_id}"
                    ) from heartbeat_error
                raise LeaseLostError(
                    f"Heartbeat stopped unexpectedly for message {job.message_id}"
                )
            await dispatch_task
        finally:
            stop_event.set()
            if not heartbeat_task.done():
                await heartbeat_task

    async def _dispatch_with_timeout(self, message: dict[str, Any]) -> None:
        try:
            async with asyncio.timeout(self.config.execution_timeout_seconds):
                await self._dispatch(message)
        except TimeoutError as exc:
            raise RuntimeError(
                "Queue job exceeded execution timeout "
                f"({self.config.execution_timeout_seconds}s)"
            ) from exc

    async def _dispatch(self, message: dict[str, Any]) -> None:
        if message.get("version") != JOB_SCHEMA_VERSION:
            raise PermanentJobError("Unsupported queue message version")

        kind = message.get("kind")
        db = get_db_client()
        if kind == "process_video":
            task_id = self._required_string(message, "task_id")
            task = await asyncio.to_thread(db.get_task, task_id)
            if not task:
                raise PermanentJobError(f"Task {task_id} does not exist")
            self._assert_workload_allowed(task)
            if task.get("status") == "completed":
                return
            await run_pipeline(
                task_id=task_id,
                video_url=self._required_record_string(task, "video_url"),
                user_id=str(task["user_id"]),
                guest_id=(
                    str(task["guest_id"]) if task.get("guest_id") is not None else None
                ),
            )
            return

        if kind == "retry_output":
            output_id = self._required_string(message, "output_id")
            output = await asyncio.to_thread(db.get_output, output_id)
            if not output:
                raise PermanentJobError(f"Output {output_id} does not exist")
            task_id = self._required_record_string(output, "task_id")
            task = await asyncio.to_thread(db.get_task, task_id)
            if not task:
                raise PermanentJobError(f"Task {task_id} does not exist")
            self._assert_workload_allowed(task)
            if output.get("status") == "completed":
                return
            await handle_retry_output(
                output_id=output_id,
                user_id=str(output["user_id"]),
            )
            return

        raise PermanentJobError(f"Unsupported queue job kind: {kind!r}")

    def _assert_workload_allowed(self, task: dict[str, Any]) -> None:
        try:
            workload = parse_workload_kind(task.get("workload_kind"))
        except ValueError as exc:
            raise PermanentJobError(str(exc)) from exc
        if workload not in self.profile.allowed_workloads:
            allowed = ", ".join(
                sorted(item.value for item in self.profile.allowed_workloads)
            )
            raise PermanentJobError(
                f"Worker profile {self.profile.name.value} cannot execute "
                f"workload {workload.value}; allowed: {allowed}"
            )

    async def _heartbeat(
        self,
        message_id: int,
        stop_event: asyncio.Event,
    ) -> None:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=self.config.heartbeat_interval_seconds,
                )
            except TimeoutError:
                await asyncio.to_thread(
                    self.queue.set_visibility,
                    message_id,
                    self.config.visibility_timeout_seconds,
                )

    async def _archive(
        self,
        job: QueuedJob,
        *,
        job_id: str,
        status: str,
    ) -> None:
        await asyncio.to_thread(
            self.queue.archive,
            job_id=job_id,
            message_id=job.message_id,
            status=status,
        )

    async def _mark_permanently_failed(
        self,
        message: dict[str, Any],
        error: str,
    ) -> None:
        db = get_db_client()
        safe_error = f"Processing failed after queue retries: {error}"[:500]
        if message.get("kind") == "process_video" and message.get("task_id"):
            await asyncio.to_thread(
                db.mark_task_failed_if_not_completed,
                str(message["task_id"]),
                safe_error,
            )
        elif message.get("kind") == "retry_output" and message.get("output_id"):
            await asyncio.to_thread(
                db.mark_output_failed_if_not_completed,
                str(message["output_id"]),
                safe_error,
            )

    @staticmethod
    def _required_string(message: dict[str, Any], key: str) -> str:
        value = message.get(key)
        if not isinstance(value, str) or not value.strip():
            raise PermanentJobError(f"Queue message is missing {key}")
        return value

    @staticmethod
    def _required_record_string(record: dict[str, Any], key: str) -> str:
        value = record.get(key)
        if not isinstance(value, str) or not value.strip():
            raise PermanentJobError(f"Database record is missing {key}")
        return value


async def verify_codex_subscription(
    *,
    codex_factory: Callable[..., Any] | None = None,
) -> str:
    """Fail startup unless the local Codex session is ChatGPT-managed."""
    from openai_codex import AsyncCodex, CodexConfig

    factory = codex_factory or AsyncCodex
    config = CodexConfig(codex_bin=settings.CODEX_LOCAL_BINARY)
    async with factory(config) as codex:
        response = await codex.account(refresh_token=False)

    account_container = getattr(response, "account", None)
    account = getattr(account_container, "root", account_container)
    if account is None or getattr(account, "type", None) != "chatgpt":
        raise RuntimeError(
            "trusted_codex worker requires an existing ChatGPT subscription login"
        )

    plan = getattr(account, "plan_type", "unknown")
    return str(getattr(plan, "value", plan))


async def drain_worker(worker: TaskWorker, *, max_jobs: int) -> int:
    """Process a bounded batch so a scheduler cannot create an endless run."""
    if max_jobs <= 0:
        raise ValueError("max_jobs must be greater than zero")
    processed = 0
    while processed < max_jobs:
        if not await worker.run_once():
            break
        processed += 1
    return processed


def _is_railway() -> bool:
    return bool(os.getenv("RAILWAY_PROJECT_ID"))


async def build_worker() -> TaskWorker:
    profile = resolve_worker_profile()
    validate_worker_runtime(
        profile,
        llm_runtime=settings.LLM_RUNTIME,
        llm_provider=settings.LLM_PROVIDER,
        is_railway=_is_railway(),
    )
    if profile.requires_chatgpt_auth:
        plan = await verify_codex_subscription()
        logger.info("Codex subscription preflight passed (plan=%s)", plan)

    queue = PostgresTaskQueue(get_db_client(), queue_name=profile.queue_name)
    return TaskWorker(queue, WorkerConfig.from_env(), profile)


async def serve() -> None:
    worker = await build_worker()
    queue = worker.queue
    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(signal_name, stop_event.set)

    logger.info("VibeDigest task worker started for queue %s", queue.queue_name)
    while not stop_event.is_set():
        try:
            await worker.run_once()
        except Exception:
            logger.exception("Worker polling or processing failed")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=5)
            except TimeoutError:
                pass


if __name__ == "__main__":
    asyncio.run(serve())
