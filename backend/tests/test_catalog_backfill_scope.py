"""Offline contracts for maintenance that must not lease unrelated work."""

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scripts.podcasts.backfill_summary_locales import enqueue_missing_summaries
from services.catalog_backfill_scope import (
    ScopedCatalogSummaryQueue,
    read_task_ids,
    validate_task_ids,
)
from services.task_queue import PostgresTaskQueue, QueuedJob


TASK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
TASK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.mark.parametrize("scope", [[], None, {}, TASK_A, ["not-a-uuid"], [None], [42]])
def test_invalid_scope_is_rejected(scope):
    with pytest.raises(ValueError):
        validate_task_ids(scope)


def test_scope_normalizes_and_deduplicates_uuids(tmp_path):
    path = tmp_path / "task-ids.json"
    path.write_text(json.dumps([TASK_B, TASK_A.upper(), TASK_A]))
    assert read_task_ids(path) == [TASK_A, TASK_B]


def test_invalid_json_file_is_rejected(tmp_path):
    path = tmp_path / "task-ids.json"
    path.write_text("not json")
    with pytest.raises(ValueError):
        read_task_ids(path)


@pytest.mark.parametrize("scope", [[], ["invalid"]])
def test_queue_rejects_invalid_scope_before_database_access(scope):
    db = MagicMock()
    with pytest.raises(ValueError):
        ScopedCatalogSummaryQueue(db, task_ids=scope)
    db._execute_query.assert_not_called()


@pytest.mark.parametrize("quantity", [0, 2, 100])
def test_scoped_queue_rejects_multi_delivery_reads(quantity):
    db = MagicMock()
    queue = ScopedCatalogSummaryQueue(db, task_ids=[TASK_A])
    with pytest.raises(ValueError, match="quantity=1"):
        queue.read(visibility_timeout_seconds=300, quantity=quantity)
    db._execute_query.assert_not_called()


@pytest.mark.parametrize("encode_message", [False, True])
@pytest.mark.parametrize("queue_name", ["podcast_supply", "podcast_supply_dev_123"])
def test_read_scopes_native_claim_and_preserves_delivery_metadata(encode_message, queue_name):
    db = MagicMock()
    message = {"job_id": TASK_B, "kind": "retry_output", "output_id": TASK_A}
    db._execute_query.return_value = [{
        "msg_id": "17", "read_ct": "2",
        "message": json.dumps(message) if encode_message else message,
    }]
    queue = ScopedCatalogSummaryQueue(
        db, task_ids=[TASK_A.upper(), TASK_A], queue_name=queue_name,
    )

    assert queue.read(visibility_timeout_seconds=123) == [QueuedJob(17, 2, message)]
    db._execute_query.assert_called_once()
    query, params = db._execute_query.call_args.args
    sql = " ".join(query.split())
    assert queue.queue_name == queue_name
    assert params == {
        "queue_name": queue_name, "task_ids": [TASK_A], "visibility_timeout_seconds": 123,
    }
    assert f'FROM pgmq."q_{queue_name}" q' in sql
    # Selection must precede the PGMQ claim; no claim-and-return of other jobs.
    assert "o.task_id = ANY(CAST(:task_ids AS uuid[]))" in sql
    assert "o.kind = 'summary' AND o.locale IN ('en', 'zh')" in sql
    assert "t.workload_kind = 'catalog_supply' AND t.is_demo = true" in sql
    assert "q.vt <= clock_timestamp()" in sql
    assert "h.message_id = q.msg_id AND h.queue_name = :queue_name" in sql
    assert "h.status = 'queued' AND h.kind = 'retry_output'" in sql
    for predicate in (
        "q.message->>'job_id' = h.job_id::text",
        "q.message->>'kind' = h.kind",
        "q.message->>'output_id' = h.entity_id::text",
    ):
        assert predicate in sql
    assert "CROSS JOIN LATERAL pgmq.read(" in sql
    assert "jsonb_build_object('job_id', candidate.job_id::text," in sql
    assert "'kind', 'retry_output')" in sql
    assert "read_with_poll" not in sql
    assert "ORDER BY q.msg_id LIMIT 1 FOR UPDATE OF q SKIP LOCKED" in sql
    assert "pgmq.read( :queue_name," in sql


def test_no_eligible_delivery_does_not_fall_back_to_unscoped_read():
    db = MagicMock()
    db._execute_query.return_value = []
    queue = ScopedCatalogSummaryQueue(db, task_ids=[TASK_A])
    assert queue.read(visibility_timeout_seconds=300) == []
    db._execute_query.assert_called_once()


@pytest.mark.parametrize("scope", [[], ["invalid"]])
def test_enqueue_rejects_invalid_scope_before_selection(scope):
    db = MagicMock()
    with pytest.raises(ValueError):
        enqueue_missing_summaries(db, limit=10, apply=True, task_ids=scope)
    db._execute_query.assert_not_called()


def test_scoped_enqueue_preserves_valid_outputs_and_existing_handoffs():
    db = MagicMock()
    db._execute_query.side_effect = [
        [{"id": TASK_A}],
        [{"resolution": "already_completed", "message_id": None}],
        [{"resolution": "queued", "message_id": 9}],
    ]
    result = enqueue_missing_summaries(
        db, limit=4, apply=True, task_ids=[TASK_A.upper(), TASK_A],
    )
    assert result == {"tasks_selected": 1, "outputs_queued": 1,
                      "resolutions": {"already_completed": 1, "queued": 1}}
    query, params = db._execute_query.call_args_list[0].args
    assert params == {"locales": ["en", "zh"], "limit": 4, "task_ids": [TASK_A]}
    assert "t.id = ANY(CAST(:task_ids AS uuid[]))" in query
    assert "is_valid_catalog_summary(summary.content, wanted.locale)" in query
    assert "h.job_key = 'retry:' || pending.id::text AND h.status = 'queued'" in query
    calls = db._execute_query.call_args_list[1:]
    assert [call.args[1] for call in calls] == [
        {"task_id": TASK_A, "locale": "en"}, {"task_id": TASK_A, "locale": "zh"},
    ]
    assert all("enqueue_catalog_summary_locale(" in call.args[0] for call in calls)


def test_scoped_preview_only_selects_and_never_enqueues():
    db = MagicMock()
    db._execute_query.return_value = [{"id": TASK_A}]
    assert enqueue_missing_summaries(db, limit=1, task_ids=[TASK_A]) == {
        "dry_run": True, "tasks_selected": 1, "task_ids": [TASK_A], "outputs_queued": 0,
    }
    db._execute_query.assert_called_once()


@pytest.mark.parametrize("queue_name", ["bad-name", "q; DROP TABLE tasks", "q.name", ""])
def test_queue_rejects_unsafe_queue_name_before_database_access(queue_name):
    db = MagicMock()
    with pytest.raises(ValueError):
        ScopedCatalogSummaryQueue(db, task_ids=[TASK_A], queue_name=queue_name)
    db._execute_query.assert_not_called()


@pytest.mark.asyncio
async def test_runner_preserves_configured_queue_when_applying_scope(monkeypatch, capsys):
    # Importing the command sets its runtime defaults; contain those environment writes.
    with patch.dict(os.environ):
        from scripts.tasks import process_catalog_supply

    db = MagicMock()
    worker = MagicMock()
    worker.queue = PostgresTaskQueue(db, queue_name="podcast_supply_dev_123")
    worker.profile.name.value = "trusted_codex"
    build = AsyncMock(return_value=worker)
    drain = AsyncMock(return_value=1)
    monkeypatch.setattr(process_catalog_supply, "build_worker", build)
    monkeypatch.setattr(process_catalog_supply, "drain_worker", drain)

    assert await process_catalog_supply.run(4, [TASK_A]) == 0

    assert isinstance(worker.queue, ScopedCatalogSummaryQueue)
    assert worker.queue.db is db
    assert worker.queue.queue_name == "podcast_supply_dev_123"
    assert worker.queue.task_ids == [TASK_A]
    drain.assert_awaited_once_with(worker, max_jobs=4)
    assert json.loads(capsys.readouterr().out)["queue"] == "podcast_supply_dev_123"
    db._execute_query.assert_not_called()
