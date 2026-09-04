from unittest.mock import MagicMock

import pytest

from scripts.podcasts.backfill_summary_locales import enqueue_missing_summaries


def test_enqueue_missing_summaries_is_bounded_and_checks_both_locales():
    db = MagicMock()
    db._execute_query.side_effect = [
        [{"id": "00000000-0000-0000-0000-000000000001"}],
        [
            {
                "output_id": "out-en",
                "resolution": "already_completed",
                "message_id": None,
            }
        ],
        [{"output_id": "out-zh", "resolution": "queued", "message_id": 42}],
    ]

    result = enqueue_missing_summaries(db, limit=3, apply=True)

    assert result == {
        "tasks_selected": 1,
        "outputs_queued": 1,
        "resolutions": {"already_completed": 1, "queued": 1},
    }
    assert db._execute_query.call_args_list[0].args[1]["limit"] == 3
    locale_calls = [
        call.args[1]["locale"] for call in db._execute_query.call_args_list[1:]
    ]
    assert locale_calls == ["en", "zh"]


@pytest.mark.parametrize("limit", [-1, 0, 101])
def test_enqueue_missing_summaries_rejects_unbounded_limit(limit):
    db = MagicMock()
    with pytest.raises(ValueError, match="between 1 and 100"):
        enqueue_missing_summaries(db, limit=limit)
    db._execute_query.assert_not_called()


def test_default_preview_does_not_enqueue():
    db = MagicMock()
    db._execute_query.return_value = [{"id": "task-1"}]
    assert enqueue_missing_summaries(db, limit=10) == {
        "dry_run": True,
        "task_ids": ["task-1"],
        "tasks_selected": 1,
        "outputs_queued": 0,
    }
    db._execute_query.assert_called_once()


def test_empty_backfill_response_fails():
    db = MagicMock()
    db._execute_query.side_effect = [[{"id": "task-1"}], []]
    with pytest.raises(RuntimeError, match="no result"):
        enqueue_missing_summaries(db, limit=1, apply=True)
