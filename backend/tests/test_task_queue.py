import json
from unittest.mock import MagicMock

import pytest
from services.task_queue import (
    GuestQuotaExceededError,
    PostgresTaskQueue,
    QueuedJob,
    QuotaExceededError,
)


def test_submit_process_video_uses_atomic_database_boundary():
    db = MagicMock()
    db._execute_query.return_value = [
        {
            "task_id": "task-1",
            "resolution": "created",
            "message_id": 42,
        }
    ]
    queue = PostgresTaskQueue(
        db,
        queue_name="video_processing",
        guest_quota_limit=1,
    )

    submission = queue.submit_process_video(
        video_url="https://example.com/video",
        user_id="00000000-0000-0000-0000-000000000001",
        guest_id=None,
        output_intent={"target_locale": "zh", "locale_source": "ui_locale"},
    )

    assert submission.task_id == "task-1"
    assert submission.resolution == "created"
    assert submission.message_id == 42
    query, params = db._execute_query.call_args.args
    assert "vibedigest_private.submit_user_video_task" in query
    assert params["queue_name"] == "video_processing"
    assert params["guest_quota_limit"] == 1
    assert ":is_demo" not in query
    assert ":publish_on_complete" not in query
    assert json.loads(params["output_intent"])["target_locale"] == "zh"


def test_submit_catalog_video_uses_the_dedicated_catalog_queue():
    db = MagicMock()
    db._execute_query.return_value = [
        {"task_id": "task-2", "resolution": "created", "message_id": 43}
    ]
    queue = PostgresTaskQueue(
        db,
        queue_name="video_processing",
        catalog_queue_name="podcast_supply",
    )

    queue.submit_catalog_video(
        video_url="https://www.youtube.com/watch?v=episode",
        user_id="00000000-0000-0000-0000-000000000001",
        publish_on_complete=True,
    )

    query, params = db._execute_query.call_args.args
    assert "vibedigest_private.submit_catalog_video_task" in query
    assert ":is_demo" not in query
    assert ":publish_on_complete" in query
    assert params["publish_on_complete"] is True
    assert params["queue_name"] == "podcast_supply"


def test_submit_process_video_surfaces_atomic_guest_quota_rejection():
    db = MagicMock()
    db._execute_query.return_value = [
        {
            "task_id": None,
            "resolution": "guest_quota_exceeded",
            "message_id": None,
        }
    ]
    queue = PostgresTaskQueue(db)

    with pytest.raises(GuestQuotaExceededError, match="Guest quota exceeded"):
        queue.submit_process_video(
            video_url="https://example.com/second-video",
            user_id="00000000-0000-0000-0000-000000000001",
            guest_id="guest-1",
            output_intent={"target_locale": "en", "locale_source": "ui_locale"},
        )


def test_submit_process_video_surfaces_atomic_account_quota_rejection():
    db = MagicMock()
    db._execute_query.return_value = [
        {
            "task_id": None,
            "resolution": "quota_exceeded",
            "message_id": None,
        }
    ]
    queue = PostgresTaskQueue(db)

    with pytest.raises(QuotaExceededError, match="Quota exceeded"):
        queue.submit_process_video(
            video_url="https://example.com/second-video",
            user_id="00000000-0000-0000-0000-000000000001",
            guest_id=None,
        )


def test_submit_retry_output_uses_atomic_database_boundary():
    db = MagicMock()
    db._execute_query.return_value = [{"message_id": 43}]
    queue = PostgresTaskQueue(db)

    assert (
        queue.submit_retry_output(
            output_id="00000000-0000-0000-0000-000000000002",
            user_id="00000000-0000-0000-0000-000000000001",
            guest_id=None,
        )
        == 43
    )
    query, params = db._execute_query.call_args.args
    assert "vibedigest_private.submit_output_retry" in query
    assert params["user_queue_name"] == "video_processing"
    assert params["catalog_queue_name"] == "podcast_supply"


def test_submit_retry_task_uses_atomic_database_boundary():
    db = MagicMock()
    db._execute_query.return_value = [{"message_id": 44}]
    queue = PostgresTaskQueue(db)

    assert (
        queue.submit_retry_task(
            task_id="00000000-0000-0000-0000-000000000003",
            user_id="00000000-0000-0000-0000-000000000001",
            guest_id="guest-1",
        )
        == 44
    )
    query, params = db._execute_query.call_args.args
    assert "vibedigest_private.retry_video_task" in query
    assert params["guest_id"] == "guest-1"
    assert params["user_queue_name"] == "video_processing"
    assert params["catalog_queue_name"] == "podcast_supply"


def test_read_normalizes_pgmq_records():
    db = MagicMock()
    db._execute_query.return_value = [
        {
            "msg_id": 7,
            "read_ct": 2,
            "message": json.dumps(
                {
                    "version": 1,
                    "kind": "retry_output",
                    "job_id": "00000000-0000-0000-0000-000000000001",
                    "output_id": "output-1",
                }
            ),
        }
    ]
    queue = PostgresTaskQueue(db)

    jobs = queue.read(visibility_timeout_seconds=300)

    assert len(jobs) == 1
    assert jobs[0].message_id == 7
    assert jobs[0].read_count == 2
    assert jobs[0].job_id == "00000000-0000-0000-0000-000000000001"


def test_archive_requires_database_confirmation():
    db = MagicMock()
    db._execute_query.return_value = [{"archived": True}]
    queue = PostgresTaskQueue(db)

    queue.archive(job_id="job-1", message_id=9, status="completed")

    query, params = db._execute_query.call_args.args
    assert "vibedigest_private.complete_queue_job" in query
    assert params["message_id"] == 9


def test_archive_raises_when_message_was_not_archived():
    db = MagicMock()
    db._execute_query.return_value = [{"archived": False}]
    queue = PostgresTaskQueue(db)

    with pytest.raises(RuntimeError, match="failed to archive"):
        queue.archive(job_id="job-1", message_id=9, status="completed")


def test_archive_invalid_requires_pgmq_confirmation():
    db = MagicMock()
    db._execute_query.return_value = [{"archived": True}]
    queue = PostgresTaskQueue(db)

    queue.archive_invalid(10)

    query, params = db._execute_query.call_args.args
    assert "vibedigest_private.fail_invalid_queue_message" in query
    assert params["message_id"] == 10


def test_validate_delivery_requires_exact_handoff_match():
    db = MagicMock()
    db._execute_query.return_value = [
        {"kind": "retry_output", "entity_id": "output-1"}
    ]
    queue = PostgresTaskQueue(db)

    delivery = QueuedJob(
        message_id=7,
        read_count=1,
        message={
            "version": 1,
            "kind": "retry_output",
            "job_id": "00000000-0000-0000-0000-000000000001",
            "output_id": "output-1",
        },
    )

    assert queue.validate_delivery(delivery) is True
    query, params = db._execute_query.call_args.args
    assert "task_queue_handoffs" in query
    assert params["message_id"] == 7


def test_set_visibility_raises_when_lease_is_missing():
    db = MagicMock()
    db._execute_query.return_value = []
    queue = PostgresTaskQueue(db)

    with pytest.raises(RuntimeError, match="lease was lost"):
        queue.set_visibility(9, 30)
