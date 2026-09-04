"""Private, signed application commands. Browser clients use Next's auth boundary."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import DBAPIError

from db_client import DBClient
from dependencies import get_db_client
from services.agent_turns import AgentTurns

logger = logging.getLogger(__name__)


async def verify_service_request(request: Request) -> None:
    secret = os.getenv("AGENT_INTERNAL_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(503, "Agent service is not configured")
    sent_at = request.headers.get("x-agent-sent-at", "")
    try:
        valid_time = abs(time.time() - int(sent_at)) <= 60
    except ValueError:
        valid_time = False
    body = await request.body()
    if len(body) > 160_000:
        raise HTTPException(413, "Agent request is too large")
    material = f"{sent_at}\n{request.method}\n{request.url.path}\n".encode() + body
    expected = hmac.new(secret.encode(), material, hashlib.sha256).hexdigest()
    if not valid_time or not hmac.compare_digest(
        expected, request.headers.get("x-agent-signature", "")
    ):
        raise HTTPException(401, "Invalid service signature")


router = APIRouter(dependencies=[Depends(verify_service_request)])


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextPart(Command):
    type: Literal["text"]
    text: str = Field(min_length=1, max_length=60_000)


class RuntimeConfig(Command):
    runtime: Literal["api", "codex_local"]
    provider: Literal["openai", "openrouter", "custom", "codex_local"]
    model: str = Field(min_length=1, max_length=200)
    modelTier: Literal["smart"] = "smart"
    reasoningEffort: str = Field(default="high", max_length=20)
    locale: Literal["zh", "en", "ja"] = "en"
    scope: Literal["workspace", "source"] = "workspace"


class AcceptCommand(Command):
    userId: UUID
    threadId: UUID
    messageId: str = Field(min_length=1, max_length=200)
    parts: list[TextPart] = Field(min_length=1, max_length=4)
    title: str = Field(min_length=1, max_length=80)
    taskId: UUID | None = None
    runtimeConfig: RuntimeConfig


class TurnCommand(Command):
    userId: UUID
    token: UUID


class CancelCommand(Command):
    userId: UUID


class SubmitCommand(TurnCommand):
    videoUrl: str = Field(min_length=1, max_length=4000)
    locale: Literal["zh", "en", "ja"]


class TaskCommand(TurnCommand):
    taskId: UUID
    locale: Literal["zh", "en", "ja"] = "en"


class ReadCommand(TaskCommand):
    includeSource: bool = False


class FinishCommand(TurnCommand):
    parts: list[dict[str, Any]] = Field(default_factory=list, max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)
    errorCode: Literal[
        "model_unavailable", "quota_exceeded", "cancelled", "delivery_failed"
    ] | None = None


class ClaimCommand(Command):
    jobId: UUID
    queueName: str = Field(pattern=r"^agent_answers(_[a-z0-9_]+)?$")
    messageId: int = Field(gt=0)
    readCount: int = Field(gt=0)


def _execute(callback, *, request_id: str | None = None):
    try:
        return callback()
    except DBAPIError as exc:
        code = getattr(exc.orig, "pgcode", None) or getattr(exc.orig, "sqlstate", None)
        # pg8000 (the product driver) carries PostgreSQL fields in args[0].
        # Psycopg-style attributes alone would misclassify conflicts as outages.
        details = getattr(exc.orig, "args", ())
        if not code and details and isinstance(details[0], dict):
            code = details[0].get("C")
        if code == "42501":
            message = (
                details[0].get("M")
                if details and isinstance(details[0], dict)
                else None
            )
            reason = (
                "agent_forbidden"
                if message == "agent_forbidden"
                else "database_permission_denied"
            )
            logger.warning(
                "Agent command rejected request_id=%s database_code=%s reason=%s",
                request_id or "unknown",
                code,
                reason,
            )
            raise HTTPException(
                403, "Agent command is not authorized or has expired"
            ) from exc
        if code in {"22023", "55P03"}:
            raise HTTPException(
                409, "Agent turn conflicts with the current state"
            ) from exc
        raise HTTPException(503, "Agent state is temporarily unavailable") from exc
    except ValueError as exc:
        raise HTTPException(400, "Invalid agent command") from exc


DB = Annotated[DBClient, Depends(get_db_client)]


@router.post("/turns")
def accept_turn(command: AcceptCommand, request: Request, db: DB):
    if not os.getenv("AGENT_CONTINUATION_URL"):
        raise HTTPException(503, "Agent continuation is not configured")
    configured_runtime = os.getenv("AGENT_CONTINUATION_RUNTIME", "api")
    if command.runtimeConfig.runtime != configured_runtime:
        raise HTTPException(
            503, "Agent continuation runtime does not match the chat runtime"
        )
    if configured_runtime == "codex_local" and os.getenv("RAILWAY_PROJECT_ID"):
        raise HTTPException(503, "Local Agent continuations cannot run on Railway")
    queue = os.getenv("AGENT_CONTINUATION_QUEUE", "agent_answers")
    if configured_runtime == "codex_local" and not queue.startswith(
        "agent_answers_local_"
    ):
        raise HTTPException(
            503, "Local Agent requires a developer-scoped continuation queue"
        )
    return _execute(
        lambda: AgentTurns(db).accept(
            user_id=str(command.userId),
            thread_id=str(command.threadId),
            message_id=command.messageId,
            parts=[part.model_dump() for part in command.parts],
            title=command.title,
            task_id=str(command.taskId) if command.taskId else None,
            runtime_config=command.runtimeConfig.model_dump(),
            continuation_queue=queue,
        ),
        request_id=request.headers.get("x-agent-request-id"),
    )


@router.post("/turns/{turn_id}/submit")
def submit_video(turn_id: UUID, command: SubmitCommand, db: DB):
    return _execute(
        lambda: AgentTurns(db).submit_video(
            turn_id=str(turn_id),
            user_id=str(command.userId),
            token=str(command.token),
            video_url=command.videoUrl,
            locale=command.locale,
        )
    )


@router.post("/turns/{turn_id}/watch")
def watch_task(turn_id: UUID, command: TaskCommand, db: DB):
    return _execute(
        lambda: AgentTurns(db).watch(
            turn_id=str(turn_id),
            user_id=str(command.userId),
            token=str(command.token),
            task_id=str(command.taskId),
            locale=command.locale,
        )
    )


@router.post("/turns/{turn_id}/finish")
def finish_turn(turn_id: UUID, command: FinishCommand, db: DB):
    # Internal source results must never be persisted or relayed as UI tool parts.
    for part in command.parts:
        kind = part.get("type")
        allowed = {
            "text": {"type", "text", "state"},
            "source-url": {"type", "sourceId", "url", "title"},
            "data-task-status": {"type", "id", "data"},
        }.get(kind)
        if allowed is None or set(part) - allowed:
            raise HTTPException(
                400, "Only public answer, citation and task parts may be saved"
            )
        if kind == "data-task-status" and (
            not isinstance(part.get("data"), dict)
            or set(part["data"])
            - {
                "taskId",
                "status",
                "progress",
                "videoTitle",
                "thumbnailUrl",
                "videoUrl",
                "errorMessage",
            }
        ):
            raise HTTPException(400, "Invalid public task part")
    metadata = {
        key: value
        for key, value in command.metadata.items()
        if key
        in {
            "runtime",
            "provider",
            "model",
            "actualModel",
            "modelTier",
            "reasoningEffort",
            "inputTokens",
            "outputTokens",
            "totalTokens",
            "durationMs",
            "createdAt",
        }
    }
    saved = _execute(
        lambda: AgentTurns(db).finish(
            turn_id=str(turn_id),
            user_id=str(command.userId),
            token=str(command.token),
            parts=command.parts,
            metadata=metadata,
            error_code=command.errorCode,
        )
    )
    return {"saved": saved}


@router.post("/turns/{turn_id}/claim")
def claim_turn(turn_id: UUID, command: ClaimCommand, db: DB):
    return _execute(
        lambda: AgentTurns(db).claim(
            turn_id=str(turn_id),
            job_id=str(command.jobId),
            queue_name=command.queueName,
            message_id=command.messageId,
            read_count=command.readCount,
        )
    )


@router.post("/turns/{turn_id}/read")
def read_task(turn_id: UUID, command: ReadCommand, db: DB):
    turn = AgentTurns(db).get(str(turn_id))
    if (
        not turn
        or str(turn["user_id"]) != str(command.userId)
        or str(turn["execution_token"]) != str(command.token)
    ):
        raise HTTPException(403, "Invalid agent turn")
    if turn["status"] not in {"running", "waiting_task", "finalizing"}:
        raise HTTPException(409, "Agent turn is no longer active")
    task = db.get_task(str(command.taskId))
    if not task or (
        str(task["user_id"]) != str(command.userId) and not task.get("is_demo")
    ):
        raise HTTPException(404, "Task not found")
    outputs = db._execute_query(
        """SELECT id, kind, locale, status, content FROM public.task_outputs
           WHERE task_id = CAST(:task_id AS uuid) AND kind = ANY(:kinds)
           ORDER BY (locale IS NOT DISTINCT FROM :locale) DESC, created_at DESC""",
        {
            "task_id": str(command.taskId),
            "locale": command.locale,
            "kinds": ["summary", "script_raw", "script"]
            if command.includeSource
            else ["summary"],
        },
    )
    # This signed, turn-bound endpoint is exclusively server-to-server.
    # The shared TS tool layer projects references before producing UI streams.
    return {
        "task": {
            key: task.get(key)
            for key in (
                "id",
                "status",
                "progress",
                "video_title",
                "video_url",
                "thumbnail_url",
            )
        },
        "outputs": outputs,
    }


@router.post("/turns/{turn_id}/history")
def read_history(turn_id: UUID, command: TurnCommand, db: DB):
    turn = AgentTurns(db).get(str(turn_id))
    if (
        not turn
        or str(turn["user_id"]) != str(command.userId)
        or str(turn["execution_token"]) != str(command.token)
    ):
        raise HTTPException(403, "Invalid agent turn")
    rows = db._execute_query(
        """SELECT id, role, content, metadata, created_at FROM public.chat_messages
           WHERE thread_id = CAST(:thread_id AS uuid) ORDER BY created_at DESC LIMIT 24""",
        {"thread_id": str(turn["thread_id"])},
    )
    return {"messages": list(reversed(rows))}


@router.post("/turns/{turn_id}/cancel")
def cancel_turn(turn_id: UUID, command: CancelCommand, db: DB):
    return {
        "cancelled": AgentTurns(db).cancel(
            turn_id=str(turn_id), user_id=str(command.userId)
        )
    }
