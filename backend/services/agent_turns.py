"""Application turn commands. All writes use the canonical Postgres transaction."""

from __future__ import annotations

import json
import re
from typing import Any

from db_client import DBClient
from services.output_intent import build_output_intent
from utils.url import is_supported_content_url, normalize_video_url


class AgentTurns:
    def __init__(self, db: DBClient):
        self.db = db

    def _call(
        self, function: str, arguments: dict[str, Any], casts: dict[str, str]
    ) -> Any:
        # Function names and casts are application constants, never model/user input.
        placeholders = ", ".join(
            f"CAST(:{key} AS {casts[key]})" if key in casts else f":{key}"
            for key in arguments
        )
        rows = self.db._execute_query(
            f"SELECT vibedigest_private.{function}({placeholders}) AS result",
            arguments,
        )
        if not rows:
            raise RuntimeError("Agent command returned no result")
        return rows[0]["result"]

    def accept(
        self,
        *,
        user_id: str,
        thread_id: str,
        message_id: str,
        parts: list[dict[str, Any]],
        title: str,
        task_id: str | None,
        runtime_config: dict[str, Any],
        continuation_queue: str,
    ) -> dict[str, Any]:
        # Only URLs supplied by the authenticated user can authorize creation.
        # Source excerpts and assistant/tool text never add URLs to this allowlist.
        rows = self.db._execute_query(
            """SELECT m.content FROM public.chat_messages m
               JOIN public.chat_threads t ON t.id = m.thread_id
               WHERE t.id = CAST(:thread_id AS uuid) AND t.user_id = CAST(:user_id AS uuid)
                 AND m.role = 'user' ORDER BY m.created_at DESC LIMIT 12""",
            {"thread_id": thread_id, "user_id": user_id},
        )
        user_parts = [parts, *(row["content"] for row in rows)]
        urls: set[str] = set()
        for message_parts in user_parts:
            if not isinstance(message_parts, list):
                continue
            for part in message_parts:
                if not isinstance(part, dict) or part.get("type") != "text":
                    continue
                for raw in re.findall(
                    r"https?://[^\s<>\"\u201c\u201d]+", str(part.get("text", ""))
                ):
                    raw = raw.rstrip(".,;!?，。；！？)]}")
                    if not is_supported_content_url(raw):
                        continue
                    normalized = normalize_video_url(raw)
                    if normalized:
                        urls.add(normalized)
        return self._call(
            "accept_agent_turn",
            {
                "user_id": user_id,
                "thread_id": thread_id,
                "message_id": message_id,
                "parts": json.dumps(parts, ensure_ascii=False),
                "title": title,
                "task_id": task_id,
                "runtime_config": json.dumps(runtime_config),
                "continuation_queue": continuation_queue,
                "allowed_video_urls": sorted(urls),
            },
            {
                "user_id": "uuid",
                "thread_id": "uuid",
                "task_id": "uuid",
                "parts": "jsonb",
                "runtime_config": "jsonb",
                "allowed_video_urls": "text[]",
            },
        )

    def submit_video(
        self,
        *,
        turn_id: str,
        user_id: str,
        token: str,
        video_url: str,
        locale: str,
        queue_name: str = "video_processing",
    ) -> dict[str, Any]:
        if not is_supported_content_url(video_url):
            raise ValueError("Invalid video URL")
        normalized = normalize_video_url(video_url)
        if not normalized:
            raise ValueError("Invalid video URL")
        # Personal goals belong to the private turn, not reusable public outputs.
        intent = build_output_intent(normalized, locale)
        return self._call(
            "submit_agent_video_task",
            {
                "turn_id": turn_id,
                "user_id": user_id,
                "token": token,
                "video_url": normalized,
                "intent": json.dumps(intent),
                "queue_name": queue_name,
            },
            {"turn_id": "uuid", "user_id": "uuid", "token": "uuid", "intent": "jsonb"},
        )

    def watch(
        self,
        *,
        turn_id: str,
        user_id: str,
        token: str,
        task_id: str,
        locale: str,
    ) -> dict[str, Any]:
        return self._call(
            "watch_agent_task",
            {
                "turn_id": turn_id,
                "user_id": user_id,
                "token": token,
                "task_id": task_id,
                "locale": locale,
            },
            {"turn_id": "uuid", "user_id": "uuid", "token": "uuid", "task_id": "uuid"},
        )

    def finish(
        self,
        *,
        turn_id: str,
        user_id: str,
        token: str,
        parts: list[dict[str, Any]],
        metadata: dict[str, Any],
        error_code: str | None = None,
    ) -> bool:
        return self._call(
            "finish_agent_turn",
            {
                "turn_id": turn_id,
                "user_id": user_id,
                "token": token,
                "parts": json.dumps(parts, ensure_ascii=False),
                "metadata": json.dumps(metadata, ensure_ascii=False),
                "error_code": error_code,
            },
            {
                "turn_id": "uuid",
                "user_id": "uuid",
                "token": "uuid",
                "parts": "jsonb",
                "metadata": "jsonb",
            },
        )

    def claim(
        self,
        *,
        turn_id: str,
        job_id: str,
        queue_name: str,
        message_id: int,
        read_count: int,
    ):
        return self._call(
            "claim_agent_continuation",
            {
                "turn_id": turn_id,
                "job_id": job_id,
                "queue_name": queue_name,
                "message_id": message_id,
                "read_count": read_count,
            },
            {"turn_id": "uuid", "job_id": "uuid"},
        )

    def cancel(self, *, turn_id: str, user_id: str) -> bool:
        rows = self.db._execute_query(
            """UPDATE vibedigest_private.agent_turns SET status = 'cancelled',
                 execution_token = gen_random_uuid(), updated_at = now()
               WHERE id = CAST(:turn_id AS uuid) AND user_id = CAST(:user_id AS uuid)
                 AND status IN ('running', 'waiting_task', 'finalizing', 'failed')
               RETURNING id""",
            {"turn_id": turn_id, "user_id": user_id},
        )
        return bool(rows)

    def get(self, turn_id: str) -> dict[str, Any] | None:
        rows = self.db._execute_query(
            "SELECT * FROM vibedigest_private.agent_turns WHERE id = CAST(:turn_id AS uuid)",
            {"turn_id": turn_id},
        )
        return rows[0] if rows else None

    def fail_continuation(self, turn_id: str, job_id: str) -> None:
        self._call(
            "fail_agent_continuation",
            {"turn_id": turn_id, "job_id": job_id},
            {"turn_id": "uuid", "job_id": "uuid"},
        )
