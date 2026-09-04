"""Signed application boundary tests, with no database or provider traffic."""

import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pg8000.dbapi import DatabaseError
from sqlalchemy.exc import DBAPIError

from api.routes import agent
from dependencies import get_db_client
from services.agent_turns import AgentTurns

SECRET = "agent-boundary-test-secret-not-a-real-credential"


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("AGENT_INTERNAL_SECRET", SECRET)
    monkeypatch.setenv("AGENT_CONTINUATION_RUNTIME", "api")
    monkeypatch.setenv(
        "AGENT_CONTINUATION_URL", "https://frontend.test/api/internal/agent/continue"
    )
    monkeypatch.delenv("AGENT_CONTINUATION_QUEUE", raising=False)
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    db = MagicMock()
    service = MagicMock()
    monkeypatch.setattr(agent, "AgentTurns", lambda _: service)
    app = FastAPI()
    app.include_router(agent.router, prefix="/api/internal/agent")
    app.dependency_overrides[get_db_client] = lambda: db
    return TestClient(app), db, service


def _post(client, path, body, *, age=0, signed_path=None, key=SECRET):
    data = json.dumps(body)
    sent_at = str(int(time.time()) - age)
    signature = hmac.new(
        key.encode(),
        f"{sent_at}\nPOST\n{signed_path or path}\n{data}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return client.post(
        path,
        content=data,
        headers={
            "content-type": "application/json",
            "x-agent-sent-at": sent_at,
            "x-agent-signature": signature,
        },
    )


def _accept():
    return {
        "userId": str(uuid4()),
        "threadId": str(uuid4()),
        "messageId": "user-test",
        "parts": [{"type": "text", "text": "Explain this source"}],
        "title": "Explain source",
        "runtimeConfig": {
            "runtime": "api",
            "provider": "openrouter",
            "model": "test-model",
        },
    }


@pytest.mark.parametrize(
    "kwargs", [{"age": 120}, {"key": "incorrect"}, {"signed_path": "/different"}]
)
def test_service_signature_binds_path_time_and_body(setup, kwargs):
    client, _, service = setup
    assert (
        _post(client, "/api/internal/agent/turns", _accept(), **kwargs).status_code
        == 401
    )
    service.accept.assert_not_called()


def test_browser_cannot_call_internal_agent_without_signature(setup):
    client, _, service = setup
    assert client.post("/api/internal/agent/turns", json=_accept()).status_code == 401
    service.accept.assert_not_called()


@pytest.mark.parametrize(
    "video_url",
    [
        "https://youtube.com",
        "https://podcasts.apple.com",
        "https://notyoutube.com/watch?v=spoofed",
    ],
)
def test_agent_submit_rejects_urls_without_supported_content(video_url):
    db = MagicMock()

    with pytest.raises(ValueError, match="Invalid video URL"):
        AgentTurns(db).submit_video(
            turn_id=str(uuid4()),
            user_id=str(uuid4()),
            token=str(uuid4()),
            video_url=video_url,
            locale="en",
        )

    db._execute_query.assert_not_called()


def test_agent_accept_allowlists_only_supported_content_urls():
    db = MagicMock()
    db._execute_query.side_effect = [
        [],
        [{"result": {"id": str(uuid4()), "status": "running"}}],
    ]

    AgentTurns(db).accept(
        user_id=str(uuid4()),
        thread_id=str(uuid4()),
        message_id="message-1",
        parts=[
            {
                "type": "text",
                "text": (
                    "Compare https://youtube.com, https://example.com/video, "
                    "and process https://youtu.be/content-id."
                ),
            }
        ],
        title="Compare sources",
        task_id=None,
        runtime_config={"runtime": "api", "locale": "en"},
        continuation_queue="agent_answers",
    )

    command_arguments = db._execute_query.call_args_list[1].args[1]
    assert command_arguments["allowed_video_urls"] == [
        "https://youtube.com/watch?v=content-id"
    ]


def test_agent_submit_normalizes_supported_content_before_database_command():
    db = MagicMock()
    db._execute_query.return_value = [{"result": {"taskId": str(uuid4())}}]

    AgentTurns(db).submit_video(
        turn_id=str(uuid4()),
        user_id=str(uuid4()),
        token=str(uuid4()),
        video_url="https://youtu.be/content-id?t=42",
        locale="en",
    )

    command_arguments = db._execute_query.call_args.args[1]
    assert command_arguments["video_url"] == "https://youtube.com/watch?v=content-id"


def test_missing_secret_fails_closed(setup, monkeypatch):
    client, _, _ = setup
    monkeypatch.delenv("AGENT_INTERNAL_SECRET")
    assert _post(client, "/api/internal/agent/turns", _accept()).status_code == 503


def test_missing_callback_cannot_accept_orphaned_work(setup, monkeypatch):
    client, _, service = setup
    monkeypatch.delenv("AGENT_CONTINUATION_URL")
    assert _post(client, "/api/internal/agent/turns", _accept()).status_code == 503
    service.accept.assert_not_called()


def test_accept_binds_server_identity_and_validated_input(setup):
    client, _, service = setup
    service.accept.return_value = {"id": str(uuid4()), "status": "running"}
    payload = _accept()
    assert _post(client, "/api/internal/agent/turns", payload).status_code == 200
    assert service.accept.call_args.kwargs["user_id"] == payload["userId"]
    assert service.accept.call_args.kwargs["parts"] == payload["parts"]
    assert service.accept.call_args.kwargs["runtime_config"]["locale"] == "en"
    assert service.accept.call_args.kwargs["continuation_queue"] == "agent_answers"


def test_task_command_defaults_to_the_english_product_locale(setup):
    client, _, service = setup
    service.watch.return_value = {"status": "running"}
    path = f"/api/internal/agent/turns/{uuid4()}/watch"

    response = _post(
        client,
        path,
        {
            "userId": str(uuid4()),
            "token": str(uuid4()),
            "taskId": str(uuid4()),
        },
    )

    assert response.status_code == 200
    assert service.watch.call_args.kwargs["locale"] == "en"


def test_local_runtime_requires_developer_queue_and_never_railway(setup, monkeypatch):
    client, _, service = setup
    payload = _accept()
    payload["runtimeConfig"].update(runtime="codex_local", provider="codex_local")
    assert _post(client, "/api/internal/agent/turns", payload).status_code == 503
    monkeypatch.setenv("AGENT_CONTINUATION_RUNTIME", "codex_local")
    assert _post(client, "/api/internal/agent/turns", payload).status_code == 503
    monkeypatch.setenv("AGENT_CONTINUATION_QUEUE", "agent_answers_local_fixture")
    monkeypatch.setenv("RAILWAY_PROJECT_ID", "test-project")
    assert _post(client, "/api/internal/agent/turns", payload).status_code == 503
    service.accept.assert_not_called()


@pytest.mark.parametrize(
    "parts",
    [
        [{"type": "tool-read_source", "output": {"transcript": "PRIVATE"}}],
        [
            {
                "type": "data-task-status",
                "data": {"taskId": "x", "transcript": "PRIVATE"},
            }
        ],
        [{"type": "text", "text": "answer", "raw": "PRIVATE"}],
    ],
)
def test_finish_rejects_raw_tool_parts_and_unexpected_fields(setup, parts):
    client, _, service = setup
    path = f"/api/internal/agent/turns/{uuid4()}/finish"
    response = _post(
        client, path, {"userId": str(uuid4()), "token": str(uuid4()), "parts": parts}
    )
    assert response.status_code == 400
    service.finish.assert_not_called()


def test_finish_metadata_allowlist_discards_internal_credentials(setup):
    client, _, service = setup
    service.finish.return_value = True
    response = _post(
        client,
        f"/api/internal/agent/turns/{uuid4()}/finish",
        {
            "userId": str(uuid4()),
            "token": str(uuid4()),
            "parts": [{"type": "text", "text": "Answer"}],
            "metadata": {"model": "test-model", "secret": "PRIVATE"},
        },
    )
    assert response.json() == {"saved": True}
    assert service.finish.call_args.kwargs["metadata"] == {"model": "test-model"}


def test_finish_accepts_quota_exceeded_as_a_safe_terminal_reason(setup):
    client, _, service = setup
    service.finish.return_value = True
    response = _post(
        client,
        f"/api/internal/agent/turns/{uuid4()}/finish",
        {
            "userId": str(uuid4()),
            "token": str(uuid4()),
            "errorCode": "quota_exceeded",
        },
    )
    assert response.json() == {"saved": True}
    assert service.finish.call_args.kwargs["error_code"] == "quota_exceeded"


def test_internal_source_read_checks_turn_and_task_ownership(setup):
    client, db, service = setup
    user, token, task = str(uuid4()), str(uuid4()), str(uuid4())
    service.get.return_value = {
        "user_id": user,
        "execution_token": token,
        "status": "running",
    }
    db.get_task.return_value = {"user_id": str(uuid4()), "is_demo": False}
    path = f"/api/internal/agent/turns/{uuid4()}/read"
    assert (
        _post(
            client, path, {"userId": user, "token": token, "taskId": task}
        ).status_code
        == 404
    )
    assert (
        _post(
            client, path, {"userId": str(uuid4()), "token": token, "taskId": task}
        ).status_code
        == 403
    )
    db._execute_query.assert_not_called()


@pytest.mark.parametrize(
    "code,status", [("42501", 403), ("22023", 409), ("55P03", 409), ("XX000", 503)]
)
@pytest.mark.parametrize("driver", ["pg8000", "psycopg2", "psycopg"])
def test_database_failures_never_leak_sql_or_secrets(setup, code, status, driver):
    client, _, service = setup
    error = (
        DatabaseError({"C": code, "M": "PRIVATE database detail"})
        if driver == "pg8000"
        else SimpleNamespace(**{"pgcode" if driver == "psycopg2" else "sqlstate": code})
    )
    service.accept.side_effect = DBAPIError("PRIVATE SQL", {}, error)
    response = _post(client, "/api/internal/agent/turns", _accept())
    assert response.status_code == status
    assert "PRIVATE" not in response.text


@pytest.mark.parametrize(
    "error",
    [DatabaseError(), DatabaseError("PRIVATE"), DatabaseError({"M": "PRIVATE"})],
)
def test_unrecognized_database_errors_stay_generic(setup, error):
    client, _, service = setup
    service.accept.side_effect = DBAPIError("PRIVATE SQL", {}, error)
    response = _post(client, "/api/internal/agent/turns", _accept())
    assert response.status_code == 503
    assert "PRIVATE" not in response.text
