"""Real Postgres/PGMQ regressions. No model or paid provider is invoked."""

from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.exc import DBAPIError

from api.routes.system import TASK_SUBMISSION_READINESS_SQL
from services.agent_turns import AgentTurns
from services.task_queue import PostgresTaskQueue
from tests.integration.test_pgmq_queue import pgmq_db as _pgmq_db

pgmq_db = _pgmq_db

pytestmark = [pytest.mark.integration, pytest.mark.pgmq]
URL = "https://www.youtube.com/watch?v=agent-fixture"


def _user(db):
    user_id = str(uuid4())
    db._execute_query(
        "INSERT INTO auth.users(id) VALUES (CAST(:id AS uuid)) RETURNING id",
        {"id": user_id},
    )
    return user_id


def _accept(db, *, user=None, thread=None, message=None, text=None):
    return AgentTurns(db).accept(
        user_id=user or _user(db),
        thread_id=thread or str(uuid4()),
        message_id=message or str(uuid4()),
        parts=[
            {"type": "text", "text": text or f"Summarize {URL} for my private research"}
        ],
        title="Agent fixture",
        task_id=None,
        runtime_config={
            "runtime": "api",
            "provider": "openrouter",
            "model": "test-model",
            "locale": "en",
        },
        continuation_queue="agent_answers",
    )


def _identity(turn):
    return {
        "turn_id": str(turn["id"]),
        "user_id": str(turn["user_id"]),
        "token": str(turn["execution_token"]),
    }


def _submit(db, turn, **kwargs):
    return AgentTurns(db).submit_video(
        **_identity(turn), video_url=kwargs.pop("url", URL), locale="en", **kwargs
    )


def _finish(db, turn, **kwargs):
    return AgentTurns(db).finish(
        **_identity(turn),
        parts=[{"type": "text", "text": "A grounded answer."}],
        metadata={"runtime": "api"},
        **kwargs,
    )


def _ready(db, task_id):
    db._execute_query(
        """UPDATE public.task_outputs SET status = 'completed', content = 'fixture summary'
      WHERE task_id = CAST(:task AS uuid) AND kind = 'summary' RETURNING id""",
        {"task": task_id},
    )


def _delivery(db, turn):
    # Isolate tests by reading the delivery recorded for this exact turn.
    rows = db._execute_query(
        """SELECT message_id FROM vibedigest_private.task_queue_handoffs
      WHERE entity_id = CAST(:id AS uuid) AND kind = 'agent_continue' AND status = 'queued'""",
        {"id": turn["id"]},
    )
    assert len(rows) == 1
    message_id = rows[0]["message_id"]
    db._execute_query(
        """UPDATE pgmq.q_agent_answers SET read_ct = read_ct + 1,
      vt = now() + interval '5 minutes' WHERE msg_id = :id RETURNING msg_id""",
        {"id": message_id},
    )
    return db._execute_query(
        """SELECT h.job_id, q.msg_id, q.read_ct FROM pgmq.q_agent_answers q
      JOIN vibedigest_private.task_queue_handoffs h ON h.message_id = q.msg_id
      AND h.queue_name = 'agent_answers' WHERE q.msg_id = :id""",
        {"id": message_id},
    )[0]


def _claim(db, turn, delivery):
    return AgentTurns(db).claim(
        turn_id=turn["id"],
        job_id=str(delivery["job_id"]),
        queue_name="agent_answers",
        message_id=delivery["msg_id"],
        read_count=delivery["read_ct"],
    )


def test_accept_is_durable_and_duplicate_input_is_not_reinterpreted(pgmq_db):
    turn = _accept(pgmq_db)
    stored = pgmq_db._execute_query(
        "SELECT content FROM public.chat_messages WHERE id = :id",
        {"id": turn["input_message_id"]},
    )
    assert "private research" in stored[0]["content"][0]["text"]
    with pytest.raises(DBAPIError, match="agent_turn_busy"):
        _accept(
            pgmq_db,
            user=turn["user_id"],
            thread=turn["thread_id"],
            message=turn["input_message_id"],
        )
    with pytest.raises(DBAPIError, match="agent_input_conflict"):
        _accept(
            pgmq_db,
            user=turn["user_id"],
            thread=turn["thread_id"],
            message=turn["input_message_id"],
            text="Changed goal",
        )
    with pytest.raises(DBAPIError, match="agent_forbidden"):
        _accept(pgmq_db, thread=turn["thread_id"])


def test_first_token_failure_has_durable_retry_state_after_reload(pgmq_db):
    turn = _accept(pgmq_db)
    assert _finish(pgmq_db, turn, error_code="model_unavailable")
    rows = pgmq_db._execute_query(
        "SELECT content, metadata FROM public.chat_messages WHERE id=:id",
        {"id": f"agent:{turn['id']}:reply"},
    )
    assert rows[0]["metadata"]["agentState"] == "failed"
    assert rows[0]["content"][0]["type"] == "text"
    retry = _accept(
        pgmq_db,
        user=turn["user_id"],
        thread=turn["thread_id"],
        message=turn["input_message_id"],
    )
    assert retry["status"] == "running"
    assert retry["execution_token"] != turn["execution_token"]
    assert _finish(pgmq_db, retry)


def test_quota_failure_has_durable_pricing_state_after_reload(pgmq_db):
    turn = _accept(pgmq_db)
    assert _finish(pgmq_db, turn, error_code="quota_exceeded")
    rows = pgmq_db._execute_query(
        "SELECT content, metadata FROM public.chat_messages WHERE id=:id",
        {"id": f"agent:{turn['id']}:reply"},
    )
    assert rows[0]["metadata"] == {
        "runtime": "api",
        "agentTurnId": str(turn["id"]),
        "agentState": "failed",
        "errorCode": "quota_exceeded",
    }
    assert rows[0]["content"] == [
        {
            "type": "text",
            "text": "You have reached your plan limit or have insufficient credits. "
            "Please upgrade your plan or top up credits to continue.",
        }
    ]


def test_create_receipt_is_atomic_idempotent_and_goal_stays_private(pgmq_db):
    turn = _accept(pgmq_db)
    first = _submit(pgmq_db, turn)
    second = _submit(pgmq_db, turn)
    assert first == second
    assert first["waiting"] is True
    rows = pgmq_db._execute_query(
        "SELECT task_id FROM public.chat_threads WHERE id = CAST(:id AS uuid)",
        {"id": turn["thread_id"]},
    )
    assert str(rows[0]["task_id"]) == first["taskId"]
    tasks = pgmq_db._execute_query(
        "SELECT id FROM public.tasks WHERE user_id = CAST(:id AS uuid)",
        {"id": turn["user_id"]},
    )
    assert len(tasks) == 1
    outputs = pgmq_db.get_task_outputs(first["taskId"])
    assert "private research" not in str(outputs)
    with pytest.raises(DBAPIError, match="agent_action_conflict"):
        _submit(pgmq_db, turn, url="https://www.youtube.com/watch?v=different")


def test_unknown_source_url_and_queue_failure_have_no_task_side_effect(pgmq_db):
    turn = _accept(pgmq_db)
    with pytest.raises(DBAPIError, match="agent_url_not_in_user_message"):
        _submit(pgmq_db, turn, url="https://www.youtube.com/watch?v=source-injection")
    with pytest.raises(DBAPIError):
        _submit(pgmq_db, turn, queue_name="missing_agent_fixture_queue")
    assert not pgmq_db._execute_query(
        "SELECT id FROM public.tasks WHERE user_id = CAST(:id AS uuid)",
        {"id": turn["user_id"]},
    )
    assert not pgmq_db._execute_query(
        "SELECT * FROM vibedigest_private.agent_actions WHERE turn_id = CAST(:id AS uuid)",
        {"id": turn["id"]},
    )
    assert AgentTurns(pgmq_db).get(turn["id"])["status"] == "running"


def test_terminal_output_enqueues_once_and_final_answer_is_durable(pgmq_db):
    turn = _accept(pgmq_db)
    receipt = _submit(pgmq_db, turn)
    _ready(pgmq_db, receipt["taskId"])
    _ready(pgmq_db, receipt["taskId"])
    delivery = _delivery(pgmq_db, turn)
    claimed = _claim(pgmq_db, turn, delivery)
    assert claimed["status"] == "finalizing"
    assert not _finish(pgmq_db, turn)  # Foreground execution was fenced.
    assert _finish(pgmq_db, claimed)
    assert _claim(pgmq_db, turn, delivery) == {"skip": True}
    assert not _finish(pgmq_db, claimed)
    rows = pgmq_db._execute_query(
        "SELECT content FROM public.chat_messages WHERE id = :id",
        {"id": f"agent:{turn['id']}:completion"},
    )
    assert len(rows) == 1
    assert rows[0]["content"][0]["text"] == "A grounded answer."
    PostgresTaskQueue(pgmq_db, queue_name="agent_answers").archive(
        job_id=str(delivery["job_id"]),
        message_id=delivery["msg_id"],
        status="completed",
    )


def test_completion_before_watch_still_enqueues_and_retries_fence_old_attempt(pgmq_db):
    turn = _accept(pgmq_db)
    receipt = _submit(pgmq_db, turn)
    _ready(pgmq_db, receipt["taskId"])
    changed_goal = _accept(
        pgmq_db,
        user=turn["user_id"],
        thread=turn["thread_id"],
        text="Explain the business model instead",
    )
    AgentTurns(pgmq_db).watch(
        **_identity(changed_goal), task_id=receipt["taskId"], locale="en"
    )
    delivery = _delivery(pgmq_db, changed_goal)
    claimed = _claim(pgmq_db, changed_goal, delivery)
    assert _finish(pgmq_db, claimed, error_code="model_unavailable")
    redelivery = _delivery(pgmq_db, changed_goal)
    with pytest.raises(DBAPIError, match="agent_lease_lost"):
        _claim(pgmq_db, changed_goal, delivery)
    second = _claim(pgmq_db, changed_goal, redelivery)
    assert not _finish(pgmq_db, claimed)
    assert _finish(pgmq_db, second)
    assert AgentTurns(pgmq_db).get(turn["id"])["status"] == "cancelled"


def test_cancel_does_not_cancel_video_and_stream_error_keeps_handoff(pgmq_db):
    turn = _accept(pgmq_db)
    receipt = _submit(pgmq_db, turn)
    assert _finish(pgmq_db, turn, error_code="model_unavailable")
    assert AgentTurns(pgmq_db).get(turn["id"])["status"] == "waiting_task"
    assert AgentTurns(pgmq_db).cancel(turn_id=turn["id"], user_id=turn["user_id"])
    _ready(pgmq_db, receipt["taskId"])
    assert pgmq_db.get_task(receipt["taskId"])["status"] == "pending"
    assert not _finish(pgmq_db, turn)


def test_foreign_source_watch_is_rejected(pgmq_db):
    owner = _accept(pgmq_db)
    receipt = _submit(pgmq_db, owner)
    other = _accept(pgmq_db)
    with pytest.raises(DBAPIError, match="agent_forbidden"):
        AgentTurns(pgmq_db).watch(
            **_identity(other), task_id=receipt["taskId"], locale="en"
        )


def test_expired_generation_cannot_commit(pgmq_db):
    turn = _accept(pgmq_db)
    pgmq_db._execute_query(
        "UPDATE vibedigest_private.agent_turns SET lease_until = now() - interval '1 minute' WHERE id = CAST(:id AS uuid) RETURNING id",
        {"id": turn["id"]},
    )
    assert not _finish(pgmq_db, turn)
    with pytest.raises(DBAPIError, match="agent_stale_turn"):
        _submit(pgmq_db, turn)


def test_turn_state_and_execution_tokens_are_not_accessible_to_browser_roles(pgmq_db):
    rows = pgmq_db._execute_query("""SELECT has_table_privilege('authenticated',
      'vibedigest_private.agent_turns', 'SELECT') AS can_read,
      has_function_privilege('authenticated', 'vibedigest_private.agent_turn_ready(uuid)', 'EXECUTE') AS can_execute""")
    assert rows == [{"can_read": False, "can_execute": False}]


def test_chat_realtime_publishes_answers_but_not_private_agent_state(pgmq_db):
    rows = pgmq_db._execute_query("""SELECT schemaname, tablename
      FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
        AND (tablename = 'chat_messages' OR schemaname = 'vibedigest_private')""")
    assert rows == [{"schemaname": "public", "tablename": "chat_messages"}]
    assert pgmq_db._execute_query("""SELECT relrowsecurity AS rls_enabled
      FROM pg_class WHERE oid = 'public.chat_messages'::regclass""") == [
        {"rls_enabled": True}
    ]


def test_readiness_detects_removed_chat_realtime_publication(pgmq_db):
    # Only this isolated test transaction loses publication membership. Roll it
    # back so the fixture remains ready for subsequent queue tests.
    with pgmq_db.engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.exec_driver_sql(
                "ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages"
            )
            row = (
                connection.exec_driver_sql(TASK_SUBMISSION_READINESS_SQL)
                .mappings()
                .one()
            )
            assert row["agent_turns_ready"] is True
            assert row["chat_realtime_ready"] is False
        finally:
            transaction.rollback()


def test_active_execution_defers_without_spending_model_attempt(pgmq_db):
    turn = _accept(pgmq_db)
    receipt = _submit(pgmq_db, turn)
    _ready(pgmq_db, receipt["taskId"])
    delivery = _delivery(pgmq_db, turn)
    claimed = _claim(pgmq_db, turn, delivery)
    assert claimed["continuation_attempts"] == 1
    deferred = _claim(pgmq_db, turn, delivery)
    assert 0 < deferred["deferSeconds"] <= 181
    assert AgentTurns(pgmq_db).get(turn["id"])["continuation_attempts"] == 1
    with pytest.raises(DBAPIError, match="not terminal"):
        PostgresTaskQueue(pgmq_db, queue_name="agent_answers").archive(
            job_id=str(delivery["job_id"]),
            message_id=delivery["msg_id"],
            status="completed",
        )


def test_user_retry_retires_old_delivery_and_cannot_be_overwritten(pgmq_db):
    turn = _accept(pgmq_db)
    receipt = _submit(pgmq_db, turn)
    _ready(pgmq_db, receipt["taskId"])
    old_delivery = _delivery(pgmq_db, turn)
    claimed = _claim(pgmq_db, turn, old_delivery)
    _finish(pgmq_db, claimed, error_code="model_unavailable")
    replay = _accept(
        pgmq_db,
        user=turn["user_id"],
        thread=turn["thread_id"],
        message=turn["input_message_id"],
    )
    assert replay["replayed"] is True
    assert replay["status"] == "waiting_task"
    new_delivery = _delivery(pgmq_db, turn)
    assert new_delivery["job_id"] != old_delivery["job_id"]
    AgentTurns(pgmq_db).fail_continuation(turn["id"], str(old_delivery["job_id"]))
    assert AgentTurns(pgmq_db).get(turn["id"])["status"] == "waiting_task"
    assert not _finish(pgmq_db, claimed)
    assert _finish(pgmq_db, _claim(pgmq_db, turn, new_delivery))
    assert (
        len(
            pgmq_db._execute_query(
                "SELECT id FROM public.tasks WHERE user_id=CAST(:id AS uuid)",
                {"id": turn["user_id"]},
            )
        )
        == 1
    )


def test_concurrent_create_calls_share_one_atomic_receipt(pgmq_db):
    turn = _accept(pgmq_db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _submit(pgmq_db, turn), range(2)))
    assert results[0] == results[1]
    assert (
        len(
            pgmq_db._execute_query(
                "SELECT id FROM public.tasks WHERE user_id=CAST(:id AS uuid)",
                {"id": turn["user_id"]},
            )
        )
        == 1
    )


def test_failed_delivery_projects_state_to_existing_receipt(pgmq_db):
    turn = _accept(pgmq_db)
    receipt = _submit(pgmq_db, turn)
    _ready(pgmq_db, receipt["taskId"])
    delivery = _delivery(pgmq_db, turn)
    AgentTurns(pgmq_db).fail_continuation(turn["id"], str(delivery["job_id"]))
    rows = pgmq_db._execute_query(
        "SELECT metadata FROM public.chat_messages WHERE id=:id",
        {"id": f"agent:{turn['id']}:reply"},
    )
    assert rows[0]["metadata"]["agentState"] == "failed"


def test_accept_restores_owned_archive_but_never_deleted_thread(pgmq_db):
    turn = _accept(pgmq_db)
    assert _finish(pgmq_db, turn)
    pgmq_db._execute_query(
        "UPDATE public.chat_threads SET status='archived', title='My title' WHERE id=CAST(:id AS uuid) RETURNING id",
        {"id": turn["thread_id"]},
    )
    resumed = _accept(pgmq_db, user=turn["user_id"], thread=turn["thread_id"])
    rows = pgmq_db._execute_query(
        "SELECT status, title FROM public.chat_threads WHERE id=CAST(:id AS uuid)",
        {"id": turn["thread_id"]},
    )
    assert rows == [{"status": "active", "title": "My title"}]
    assert _finish(pgmq_db, resumed)
    pgmq_db._execute_query(
        "UPDATE public.chat_threads SET status='deleted' WHERE id=CAST(:id AS uuid) RETURNING id",
        {"id": turn["thread_id"]},
    )
    with pytest.raises(DBAPIError, match="agent_forbidden"):
        _accept(pgmq_db, user=turn["user_id"], thread=turn["thread_id"])
