"""Caption-only rejection must never double-refund or spend another period."""

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import DBAPIError

from services.task_queue import PostgresTaskQueue
from tests.integration.test_pgmq_queue import pgmq_db as _pgmq_db

pgmq_db = _pgmq_db
pytestmark = [pytest.mark.integration, pytest.mark.pgmq]
ERROR = "captions_unavailable: No usable captions were found. Audio transcription is not supported."


def _submit(db, *, guest=False, extra=False):
    user = str(uuid4())
    db._execute_query("INSERT INTO auth.users(id) VALUES (CAST(:id AS uuid))", {"id": user})
    db._execute_query(
        """INSERT INTO profiles(id,usage_count,extra_credits) VALUES (CAST(:id AS uuid),:used,4)
        ON CONFLICT (id) DO UPDATE SET usage_count=:used,extra_credits=4""",
        {"id": user, "used": 3 if extra else 0},
    )
    submission = PostgresTaskQueue(db).submit_process_video(
        video_url=f"https://youtube.com/watch?v={uuid4().hex}", user_id=user,
        guest_id=f"caption_{uuid4().hex}" if guest else None,
    )
    return user, submission.task_id


def _balance(db, task):
    return db._execute_query(
        """SELECT p.usage_count,p.extra_credits,g.usage_count AS guest_usage
        FROM tasks t JOIN profiles p ON p.id=t.user_id
        LEFT JOIN guest_usage g ON g.guest_id=t.guest_id WHERE t.id=CAST(:id AS uuid)""",
        {"id": task},
    )[0]


@pytest.mark.parametrize("guest,extra", [(False, False), (False, True), (True, False)])
def test_caption_failure_refunds_exact_debit_once(pgmq_db, guest, extra):
    _, task = _submit(pgmq_db, guest=guest, extra=extra)
    charged = _balance(pgmq_db, task)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: pgmq_db.fail_caption_task(task, ERROR), range(2)))
    after = _balance(pgmq_db, task)
    if guest:
        assert charged["guest_usage"] == 1 and after["guest_usage"] == 0
        assert after["usage_count"] == charged["usage_count"]
    elif extra:
        assert charged["extra_credits"] == 3 and after["extra_credits"] == 4
        assert after["usage_count"] == charged["usage_count"] == 3
    else:
        assert charged["usage_count"] == 1 and after["usage_count"] == 0
        assert after["extra_credits"] == charged["extra_credits"]
    row = pgmq_db.get_task(task)
    assert row["status"] == "error" and row["error_message"] == ERROR
    outputs = pgmq_db.get_task_outputs(task)
    assert all(o["status"] == "error" and o["error_message"] == ERROR for o in outputs)
    # The worker archives the original delivery after the terminal write.
    handoff = pgmq_db._execute_query(
        "SELECT job_id,message_id FROM vibedigest_private.task_queue_handoffs WHERE entity_id=CAST(:id AS uuid)",
        {"id": task},
    )[0]
    PostgresTaskQueue(pgmq_db).archive(job_id=str(handoff["job_id"]), message_id=handoff["message_id"], status="failed")
    with pytest.raises(DBAPIError, match="no usable captions"):
        PostgresTaskQueue(pgmq_db).submit_retry_task(task_id=task, user_id=row["user_id"], guest_id=row.get("guest_id"))
    with pytest.raises(DBAPIError, match="no usable captions"):
        PostgresTaskQueue(pgmq_db).submit_retry_output(output_id=str(outputs[0]["id"]), user_id=row["user_id"], guest_id=row.get("guest_id"))


def test_caption_refund_does_not_decrement_new_month(pgmq_db):
    user, task = _submit(pgmq_db)
    pgmq_db._execute_query(
        "UPDATE profiles SET usage_count=2,usage_reset_at=usage_reset_at+interval '1 month' WHERE id=CAST(:id AS uuid)",
        {"id": user},
    )
    pgmq_db.fail_caption_task(task, ERROR)
    assert _balance(pgmq_db, task)["usage_count"] == 2
    assert _balance(pgmq_db, task)["extra_credits"] == 4


def test_completed_script_prevents_caption_refund(pgmq_db):
    _, task = _submit(pgmq_db)
    pgmq_db._execute_query(
        "UPDATE task_outputs SET status='completed',content='Existing captions' WHERE task_id=CAST(:id AS uuid) AND kind='script'",
        {"id": task},
    )
    with pytest.raises(RuntimeError, match="not persisted"):
        pgmq_db.fail_caption_task(task, ERROR)
    assert _balance(pgmq_db, task)["usage_count"] == 1
    assert pgmq_db.get_task(task)["status"] == "pending"


def test_unknown_failure_cannot_refund(pgmq_db):
    _, task = _submit(pgmq_db)
    with pytest.raises(DBAPIError, match="Invalid caption failure"):
        pgmq_db.fail_caption_task(task, "model failed")
    assert _balance(pgmq_db, task)["usage_count"] == 1


def test_new_submission_after_refund_is_charged(pgmq_db):
    user, task = _submit(pgmq_db)
    pgmq_db.fail_caption_task(task, ERROR)
    fresh = PostgresTaskQueue(pgmq_db).submit_process_video(
        video_url=pgmq_db.get_task(task)["video_url"], user_id=user, guest_id=None,
    )
    assert fresh.resolution == "created" and fresh.task_id != task
    assert _balance(pgmq_db, fresh.task_id)["usage_count"] == 1


@pytest.mark.asyncio
async def test_real_pipeline_caption_failure_refunds_without_audio_or_model(pgmq_db, monkeypatch):
    import workflow
    from services.job_handlers import NonRetryableJobError, run_pipeline

    user, task = _submit(pgmq_db)
    processor = MagicMock()
    processor.extract_info_only = AsyncMock(return_value={"title": "No captions", "duration": 60})
    processor.extract_captions = AsyncMock(return_value=None)
    processor.download_and_convert = AsyncMock(side_effect=AssertionError("Audio download is retired"))
    provider = MagicMock(last_error="No transcript segments")
    provider.get_transcript_async = AsyncMock(return_value=(None, None, None))
    summarizer = MagicMock(side_effect=AssertionError("No model call without captions"))
    monkeypatch.setattr(workflow, "_get_db_client", lambda: pgmq_db)
    monkeypatch.setattr(workflow, "_get_video_processor", lambda: processor)
    monkeypatch.setattr(workflow, "_get_supadata_client", lambda: provider)
    monkeypatch.setattr(workflow, "_get_summarizer", summarizer)

    with pytest.raises(NonRetryableJobError, match="captions_unavailable:"):
        await run_pipeline(task, pgmq_db.get_task(task)["video_url"], user)
    assert _balance(pgmq_db, task)["usage_count"] == 0
    assert pgmq_db.get_task(task)["status"] == "error"
    assert all(o["status"] == "error" for o in pgmq_db.get_task_outputs(task))
    processor.download_and_convert.assert_not_awaited()
    summarizer.assert_not_called()
