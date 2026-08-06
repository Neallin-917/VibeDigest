import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from db_client import DBClient

DEFAULT_QUEUE_NAME = "video_processing"
JOB_SCHEMA_VERSION = 1


class GuestQuotaExceededError(Exception):
    """The atomic task submission rejected a guest over the free limit."""


@dataclass(frozen=True)
class TaskSubmission:
    task_id: str
    resolution: str
    message_id: int | None


@dataclass(frozen=True)
class QueuedJob:
    message_id: int
    read_count: int
    message: dict[str, Any]

    @property
    def job_id(self) -> str:
        value = self.message.get("job_id")
        if not isinstance(value, str) or not value:
            raise ValueError("Queue message is missing job_id")
        try:
            return str(UUID(value))
        except ValueError as exc:
            raise ValueError("Queue message has an invalid job_id") from exc


class TaskQueue(Protocol):
    def submit_process_video(
        self,
        *,
        video_url: str,
        user_id: str,
        guest_id: str | None,
        output_intent: dict[str, Any] | None = None,
    ) -> TaskSubmission: ...

    def submit_retry_output(
        self,
        *,
        output_id: str,
        user_id: str,
        guest_id: str | None,
    ) -> int: ...


class PostgresTaskQueue:
    """Durable task submission and delivery backed by Supabase PGMQ."""

    def __init__(
        self,
        db: DBClient,
        queue_name: str | None = None,
        guest_quota_limit: int | None = None,
    ) -> None:
        self.db = db
        self.queue_name = (
            queue_name
            or os.getenv("TASK_QUEUE_NAME", "").strip()
            or DEFAULT_QUEUE_NAME
        )
        dev_bypass = (os.getenv("DEV_AUTH_BYPASS") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        self.guest_quota_limit = (
            guest_quota_limit
            if guest_quota_limit is not None
            else (2_147_483_647 if dev_bypass else 1)
        )
        if self.guest_quota_limit <= 0:
            raise ValueError("guest_quota_limit must be greater than zero")

    def submit_process_video(
        self,
        *,
        video_url: str,
        user_id: str,
        guest_id: str | None,
        output_intent: dict[str, Any] | None = None,
    ) -> TaskSubmission:
        rows = self.db._execute_query(
            """
            SELECT *
            FROM vibedigest_private.submit_video_task(
                CAST(:user_id AS uuid),
                :video_url,
                :guest_id,
                :guest_quota_limit,
                CAST(:output_intent AS jsonb),
                :queue_name
            )
            """,
            {
                "user_id": user_id,
                "video_url": video_url,
                "guest_id": guest_id,
                "guest_quota_limit": self.guest_quota_limit,
                "output_intent": json.dumps(output_intent or {}, ensure_ascii=False),
                "queue_name": self.queue_name,
            },
        )
        if not rows:
            raise RuntimeError("Task submission returned no result")
        row = rows[0]
        resolution = str(row["resolution"])
        if resolution == "guest_quota_exceeded":
            raise GuestQuotaExceededError("Guest quota exceeded")
        if row.get("task_id") is None:
            raise RuntimeError("Task submission returned no task id")
        return TaskSubmission(
            task_id=str(row["task_id"]),
            resolution=resolution,
            message_id=(
                int(row["message_id"]) if row.get("message_id") is not None else None
            ),
        )

    def submit_retry_output(
        self,
        *,
        output_id: str,
        user_id: str,
        guest_id: str | None,
    ) -> int:
        rows = self.db._execute_query(
            """
            SELECT *
            FROM vibedigest_private.submit_output_retry(
                CAST(:output_id AS uuid),
                CAST(:user_id AS uuid),
                :guest_id,
                :queue_name
            )
            """,
            {
                "output_id": output_id,
                "user_id": user_id,
                "guest_id": guest_id,
                "queue_name": self.queue_name,
            },
        )
        if not rows or rows[0].get("message_id") is None:
            raise RuntimeError("Output retry submission returned no message id")
        return int(rows[0]["message_id"])

    def read(
        self,
        *,
        visibility_timeout_seconds: int,
        quantity: int = 1,
        max_poll_seconds: int = 5,
        poll_interval_ms: int = 250,
    ) -> list[QueuedJob]:
        rows = self.db._execute_query(
            """
            SELECT *
            FROM pgmq.read_with_poll(
                :queue_name,
                :visibility_timeout_seconds,
                :quantity,
                :max_poll_seconds,
                :poll_interval_ms
            )
            """,
            {
                "queue_name": self.queue_name,
                "visibility_timeout_seconds": visibility_timeout_seconds,
                "quantity": quantity,
                "max_poll_seconds": max_poll_seconds,
                "poll_interval_ms": poll_interval_ms,
            },
        )

        jobs: list[QueuedJob] = []
        for row in rows:
            message = row.get("message")
            if isinstance(message, str):
                message = json.loads(message)
            if not isinstance(message, dict):
                message = {"kind": "invalid", "raw_message": message}
            jobs.append(
                QueuedJob(
                    message_id=int(row["msg_id"]),
                    read_count=int(row["read_ct"]),
                    message=message,
                )
            )
        return jobs

    def archive(self, *, job_id: str, message_id: int, status: str) -> None:
        rows = self.db._execute_query(
            """
            SELECT vibedigest_private.complete_queue_job(
                CAST(:job_id AS uuid),
                :queue_name,
                :message_id,
                :status
            ) AS archived
            """,
            {
                "job_id": job_id,
                "queue_name": self.queue_name,
                "message_id": message_id,
                "status": status,
            },
        )
        if not rows or not rows[0].get("archived"):
            raise RuntimeError(f"PGMQ failed to archive message {message_id}")

    def validate_delivery(self, job: QueuedJob) -> bool:
        """Require the queue delivery to match its persisted handoff exactly."""
        kind = job.message.get("kind")
        entity_key = {
            "process_video": "task_id",
            "retry_output": "output_id",
        }.get(kind)
        if entity_key is None:
            return False
        entity_id = job.message.get(entity_key)
        if not isinstance(entity_id, str) or not entity_id:
            return False

        rows = self.db._execute_query(
            """
            SELECT kind, entity_id::text AS entity_id
              FROM vibedigest_private.task_queue_handoffs
             WHERE job_id = CAST(:job_id AS uuid)
               AND queue_name = :queue_name
               AND message_id = :message_id
               AND status = 'queued'
            """,
            {
                "job_id": job.job_id,
                "queue_name": self.queue_name,
                "message_id": job.message_id,
            },
        )
        return bool(
            rows
            and rows[0].get("kind") == kind
            and str(rows[0].get("entity_id")) == entity_id
        )

    def archive_invalid(self, message_id: int) -> None:
        """Archive a poison message and fail any handoff tied to its delivery."""
        rows = self.db._execute_query(
            """
            SELECT vibedigest_private.fail_invalid_queue_message(
                :queue_name,
                :message_id
            ) AS archived
            """,
            {
                "queue_name": self.queue_name,
                "message_id": message_id,
            },
        )
        if not rows or not rows[0].get("archived"):
            raise RuntimeError(f"PGMQ failed to archive invalid message {message_id}")

    def set_visibility(self, message_id: int, seconds_from_now: int) -> None:
        rows = self.db._execute_query(
            """
            SELECT *
            FROM pgmq.set_vt(:queue_name, :message_id, :seconds_from_now)
            """,
            {
                "queue_name": self.queue_name,
                "message_id": message_id,
                "seconds_from_now": seconds_from_now,
            },
        )
        if not rows:
            raise RuntimeError(f"Queue lease was lost for message {message_id}")
