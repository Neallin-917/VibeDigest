"""Explicit task scope for bounded catalog summary maintenance."""

import json
from pathlib import Path
from uuid import UUID

from services.task_queue import PostgresTaskQueue, QueuedJob


def validate_task_ids(task_ids: list[str]) -> list[str]:
    if not isinstance(task_ids, list) or not task_ids:
        raise ValueError("Task scope must be a nonempty JSON array of UUIDs")
    if any(not isinstance(value, str) for value in task_ids):
        raise ValueError("Task IDs must be UUID strings")
    return sorted({str(UUID(value)) for value in task_ids})


def read_task_ids(path: Path) -> list[str]:
    return validate_task_ids(json.loads(path.read_text()))


class ScopedCatalogSummaryQueue(PostgresTaskQueue):
    """Use PGMQ's native conditional read without leasing unrelated messages."""

    def __init__(self, db, *, task_ids: list[str]) -> None:
        super().__init__(db, queue_name="podcast_supply")
        self.task_ids = validate_task_ids(task_ids)

    def read(
        self,
        *,
        visibility_timeout_seconds: int,
        quantity: int = 1,
        max_poll_seconds: int = 5,
        poll_interval_ms: int = 250,
    ) -> list[QueuedJob]:
        if quantity != 1:
            raise ValueError("Scoped catalog reads require quantity=1")
        rows = self.db._execute_query(
            """
            SELECT delivery.* FROM (
                SELECT h.job_id
                  FROM pgmq.q_podcast_supply q
                  JOIN vibedigest_private.task_queue_handoffs h
                    ON h.message_id = q.msg_id AND h.queue_name = 'podcast_supply'
                   AND h.status = 'queued' AND h.kind = 'retry_output'
                   AND q.message->>'job_id' = h.job_id::text
                   AND q.message->>'kind' = h.kind
                   AND q.message->>'output_id' = h.entity_id::text
                  JOIN public.task_outputs o ON o.id = h.entity_id
                  JOIN public.tasks t ON t.id = o.task_id
                 WHERE o.task_id = ANY(CAST(:task_ids AS uuid[]))
                   AND o.kind = 'summary' AND o.locale IN ('en', 'zh')
                   AND t.workload_kind = 'catalog_supply' AND t.is_demo = true
                   AND q.vt <= clock_timestamp()
                 ORDER BY q.msg_id LIMIT 1
            ) candidate
            CROSS JOIN LATERAL pgmq.read(
                'podcast_supply', :visibility_timeout_seconds, 1,
                jsonb_build_object('job_id', candidate.job_id::text,
                                   'kind', 'retry_output')
            ) delivery
            """,
            {
                "task_ids": self.task_ids,
                "visibility_timeout_seconds": visibility_timeout_seconds,
            },
        )
        return [
            QueuedJob(
                message_id=int(row["msg_id"]),
                read_count=int(row["read_ct"]),
                message=json.loads(row["message"])
                if isinstance(row["message"], str)
                else row["message"],
            )
            for row in rows
        ]
