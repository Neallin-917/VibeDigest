"""Verify locale requests against the real task, queue and billing transactions."""

import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy.exc import DBAPIError

from services.agent_turns import AgentTurns
from services.task_queue import PostgresTaskQueue
from tests.integration.test_pgmq_queue import pgmq_db as _pgmq_db

pgmq_db = _pgmq_db
pytestmark = [pytest.mark.integration, pytest.mark.pgmq]


EN_SUMMARY = {
    "version": 5,
    "language": "en",
    "overview": "The speakers describe how to keep translated summaries anchored to their source.",
    "keypoints": [{
        "title": "Share source timestamps",
        "detail": "Each version refers back to the same original captions.",
        "evidence": "The demonstration follows the same timestamp in both versions.",
    }],
    "sections": [],
}


def _completed(db, locale_source="ui_locale", user=None):
    if user is None:
        user = str(uuid4())
        db._execute_query("INSERT INTO auth.users(id) VALUES (CAST(:id AS uuid))", {"id": user})
    queue = PostgresTaskQueue(db)
    task = queue.submit_process_video(
        video_url=f"https://youtube.com/watch?v={uuid4().hex[:11]}", user_id=user, guest_id=None,
        output_intent={"target_locale": "en", "locale_source": locale_source},
    )
    db._execute_query(
        """UPDATE public.task_outputs SET status = 'completed', progress = 100,
             content = CASE kind WHEN 'summary' THEN :summary ELSE 'Source captions' END
           WHERE task_id = CAST(:id AS uuid)""",
        {"id": task.task_id, "summary": json.dumps(EN_SUMMARY)},
    )
    db._execute_query(
        "UPDATE public.tasks SET status = 'completed', progress = 100 WHERE id = CAST(:id AS uuid)",
        {"id": task.task_id},
    )
    handoff = db._execute_query(
        """SELECT job_id FROM vibedigest_private.task_queue_handoffs
           WHERE entity_id = CAST(:task_id AS uuid) AND kind = 'process_video'""",
        {"task_id": task.task_id},
    )[0]
    queue.archive(job_id=str(handoff["job_id"]), message_id=task.message_id, status="completed")
    return user, task.task_id


def _request(db, user, task, locale="zh", *, turn=None, token=None):
    return db._execute_query(
        """SELECT vibedigest_private.request_user_summary_locale(
             CAST(:user AS uuid), CAST(:task AS uuid), :locale,
             CAST(:turn AS uuid), CAST(:token AS uuid)
           ) AS receipt""",
        {"user": user, "task": task, "locale": locale, "turn": turn, "token": token},
    )[0]["receipt"]


def _turn(db, user, task):
    turn = AgentTurns(db).accept(
        user_id=user, thread_id=str(uuid4()), message_id=str(uuid4()),
        parts=[{"type": "text", "text": "请生成这期的中文版"}], title="中文版",
        task_id=task, runtime_config={"locale": "zh", "scope": "source"},
        continuation_queue="agent_answers",
    )
    return {"turn": turn["id"], "token": turn["execution_token"]}


def _usage(db, user):
    return db._execute_query(
        "SELECT usage_count, extra_credits FROM public.profiles WHERE id = CAST(:id AS uuid)",
        {"id": user},
    )[0]


def _jobs(db, task):
    return db._execute_query(
        """SELECT h.queue_name, q.message
           FROM public.task_outputs o
           JOIN vibedigest_private.task_queue_handoffs h ON h.entity_id = o.id
           JOIN pgmq.q_video_processing q ON q.msg_id = h.message_id
           WHERE o.task_id = CAST(:id AS uuid) AND h.kind = 'retry_output'""",
        {"id": task},
    )


def test_concurrent_locale_requests_only_enqueue_one_free_output(pgmq_db):
    db = pgmq_db
    user, task = _completed(db)
    charged = _usage(db, user)
    barrier = Barrier(3)

    def simultaneous_request(_):
        barrier.wait(timeout=10)
        return _request(db, user, task)

    with ThreadPoolExecutor(max_workers=3) as pool:
        receipts = list(pool.map(simultaneous_request, range(3)))
    assert receipts == [{"taskId": task, "status": "pending", "locale": "zh"}] * 3
    summaries = {o["locale"]: o for o in db.get_task_outputs(task) if o["kind"] == "summary"}
    assert set(summaries) == {"en", "zh"}
    assert summaries["en"]["status"] == "completed"
    assert json.loads(summaries["en"]["content"]) == EN_SUMMARY
    assert summaries["zh"]["status"] == "pending"
    job, = _jobs(db, task)
    assert job["queue_name"] == "video_processing"
    assert set(job["message"]) == {"job_id", "output_id", "kind", "version"}
    assert job["message"]["output_id"] == str(summaries["zh"]["id"])
    assert db.get_task(task)["status"] == "completed"
    assert _usage(db, user) == charged


def test_automatic_open_preserves_explicit_choice_and_agent_can_change_it(pgmq_db):
    db = pgmq_db
    user, task = _completed(db, locale_source="explicit_instruction")
    assert _request(db, user, task)["status"] == "unavailable"
    assert not _jobs(db, task)
    bound = _turn(db, user, task)
    assert _request(db, user, task, **bound)["status"] == "pending"
    assert db.get_task(task)["output_intent"]["preferred_summary_locale"] == "zh"
    assert _request(db, user, task, "en", **bound)["status"] == "completed"
    assert db.get_task(task)["output_intent"]["preferred_summary_locale"] == "en"
    assert len(_jobs(db, task)) == 1


def test_cross_account_and_stale_or_mismatched_turn_cannot_write(pgmq_db):
    db = pgmq_db
    user, task = _completed(db)
    other_user, _ = _completed(db)
    _, sibling_task = _completed(db, user=user)
    bound = _turn(db, user, task)
    for owner, target, identity in [
        (other_user, task, {}), (user, sibling_task, bound),
        (user, task, {**bound, "token": str(uuid4())}),
        (user, task, {**bound, "token": None}),
    ]:
        with pytest.raises(DBAPIError) as denied:
            _request(db, owner, target, **identity)
        assert denied.value.orig.pgcode == "42501"
    AgentTurns(db).cancel(turn_id=bound["turn"], user_id=user)
    with pytest.raises(DBAPIError) as cancelled:
        _request(db, user, task, **bound)
    assert cancelled.value.orig.pgcode == "42501"
    assert not _jobs(db, task)
    assert not _jobs(db, sibling_task)


def test_failed_version_does_not_restart_on_reopen(pgmq_db):
    db = pgmq_db
    user, task = _completed(db)
    assert _request(db, user, task)["status"] == "pending"
    failed = next(o for o in db.get_task_outputs(task) if o.get("locale") == "zh")
    output_id = str(failed["id"])
    db.mark_output_failed_if_not_completed(output_id, "fixture failure")
    handoff = db._execute_query(
        """SELECT job_id, message_id FROM vibedigest_private.task_queue_handoffs
           WHERE entity_id = CAST(:id AS uuid) AND kind = 'retry_output'""",
        {"id": output_id},
    )[0]
    PostgresTaskQueue(db).archive(
        job_id=str(handoff["job_id"]), message_id=handoff["message_id"], status="failed",
    )
    assert _request(db, user, task)["status"] == "failed"
    assert not _jobs(db, task)
    assert _request(db, user, task, **_turn(db, user, task))["status"] == "pending"
    assert len(_jobs(db, task)) == 1


def test_corrupt_completed_output_is_not_announced_as_readable(pgmq_db):
    db = pgmq_db
    user, task = _completed(db)
    db._execute_query(
        """UPDATE public.task_outputs SET content = 'malformed summary'
           WHERE task_id = CAST(:id AS uuid) AND locale = 'en' AND kind = 'summary'""",
        {"id": task},
    )
    assert _request(db, user, task, "en", **_turn(db, user, task))["status"] == "unavailable"
    assert "preferred_summary_locale" not in db.get_task(task)["output_intent"]
    assert not _jobs(db, task)


@pytest.mark.parametrize("explicit_locale", ["en", "zh"])
def test_resubmission_persists_explicit_preference_on_reused_task(pgmq_db, explicit_locale):
    db = pgmq_db
    user, task = _completed(db)
    charged = _usage(db, user)
    url = db.get_task(task)["video_url"]
    turns = AgentTurns(db)
    ui_locale = "zh" if explicit_locale == "en" else "en"
    turn = turns.accept(
        user_id=user, thread_id=str(uuid4()), message_id=str(uuid4()), task_id=None,
        parts=[{"type": "text", "text": f"Summarize {url} in {explicit_locale}."}],
        title="Summary", runtime_config={"locale": ui_locale}, continuation_queue="agent_answers",
    )
    receipt = turns.submit_video(
        turn_id=turn["id"], user_id=user, token=turn["execution_token"],
        video_url=url, locale=ui_locale, explicit_locale=explicit_locale,
    )
    assert receipt["taskId"] == task
    assert receipt["resolution"] == "reused_completed"
    assert db.get_task(task)["output_intent"]["preferred_summary_locale"] == explicit_locale
    assert _usage(db, user) == charged
