"""Offline shape and coverage checks; these do not evaluate Agent quality."""

from __future__ import annotations

import json
import re
from pathlib import Path
from uuid import UUID

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = REPO_ROOT / "evals" / "agent" / "cases.json"
REQUIRED_COVERAGE = {
    "standalone_url",
    "explicit_summarize",
    "explanation_only_url",
    "negated_request",
    "two_urls_clarify",
    "source_scope_no_create",
    "tool_result_injection_no_create",
    "duplicate_input_same_action",
    "revised_pending_goal_same_task",
    "completion_resumes_private_goal",
    "failed_video_not_missing_evidence",
    "missing_evidence_not_failed_video",
    "answer_cancel_leaves_video",
    "stale_worker_excluded",
    "answer_retry_not_video_quota",
}
VALID_INPUT_KINDS = {
    "user_message",
    "duplicate_message",
    "task_terminal",
    "cancel_answer",
    "stale_completion",
    "retry_answer",
}
VALID_TOOLS = {
    "get_task_status",
    "get_task_context",
    "search_source",
    "read_source",
    "create_video_task",
    "continue_when_ready",
}
VALID_INTENTS = {
    "process_video",
    "explain_link",
    "do_not_process",
    "clarify_one_source",
    "answer_source",
    "reuse_action",
    "continue_existing_goal",
    "resume_private_goal",
    "report_processing_failure",
    "report_missing_evidence",
    "cancel_answer",
    "reject_stale_completion",
    "retry_answer",
}


def load_dataset() -> dict:
    payload = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return payload


def assert_text(value: object) -> None:
    assert isinstance(value, str) and value.strip()


def assert_text_list(value: object, *, nonempty: bool = False) -> None:
    assert isinstance(value, list)
    if nonempty:
        assert value
    for item in value:
        assert_text(item)
    assert len(value) == len(set(value))


def test_agent_eval_dataset_is_expectations_only_with_review_rubric() -> None:
    payload = load_dataset()
    assert set(payload) == {
        "version",
        "status",
        "description",
        "evidence_dataset",
        "rubric",
        "cases",
    }
    assert type(payload["version"]) is int and payload["version"] == 1
    assert payload["status"] == "expectations_only"
    assert_text(payload["description"])
    rubric = payload["rubric"]
    assert set(rubric) == {"mode", "dimensions", "hard_failures", "verdicts", "rule"}
    assert rubric["mode"] == "manual_or_explicitly_opt_in_model_review"
    assert rubric["verdicts"] == ["pass", "fail", "not_observed"]
    assert_text(rubric["rule"])
    assert_text_list(rubric["hard_failures"], nonempty=True)
    assert isinstance(rubric["dimensions"], list)
    dimensions = rubric["dimensions"]
    assert len(dimensions) == 5
    assert {dimension["id"] for dimension in dimensions} == {
        "intent",
        "business_effects",
        "continuation",
        "grounding",
        "communication",
    }
    for dimension in dimensions:
        assert set(dimension) == {"id", "pass"}
        assert_text(dimension["pass"])


def test_agent_eval_dataset_covers_intent_actions_and_continuation() -> None:
    cases = load_dataset()["cases"]
    assert isinstance(cases, list) and len(cases) >= 12
    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids))
    assert all(
        re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)+", case_id) for case_id in ids
    )
    assert REQUIRED_COVERAGE <= {tag for case in cases for tag in case["coverage"]}
    assert {case["context"]["locale"] for case in cases} >= {"en", "zh"}
    assert {case["input"]["kind"] for case in cases} == VALID_INPUT_KINDS


@pytest.mark.parametrize("case", load_dataset()["cases"], ids=lambda case: case["id"])
def test_agent_eval_case_has_valid_contract_and_consistent_effects(case: dict) -> None:
    assert set(case) == {
        "id",
        "coverage",
        "input",
        "context",
        "expected",
        "forbidden_effects",
    }
    assert_text_list(case["coverage"], nonempty=True)
    assert set(case["coverage"]) <= REQUIRED_COVERAGE
    assert_text_list(case["forbidden_effects"], nonempty=True)

    incoming = case["input"]
    assert set(incoming) == {"kind", "message_id", "text"}
    assert incoming["kind"] in VALID_INPUT_KINDS
    assert_text(incoming["message_id"])
    if incoming["kind"] in {"user_message", "duplicate_message", "retry_answer"}:
        assert_text(incoming["text"])
    else:
        assert incoming["text"] is None

    context = case["context"]
    assert set(context) == {
        "scope",
        "locale",
        "task",
        "turn_state",
        "history",
        "tool_results",
        "evidence_case_ids",
        "facts",
    }
    assert context["scope"] in {"workspace", "source"}
    assert context["locale"] in {"en", "zh", "ja"}
    assert context["turn_state"] in {
        "none",
        "running",
        "waiting_task",
        "finalizing",
        "completed",
        "failed",
        "cancelled",
    }
    assert_text_list(context["facts"], nonempty=True)
    assert_text_list(context["evidence_case_ids"])
    task = context["task"]
    if task is not None:
        assert set(task) == {"id", "status"}
        assert str(UUID(task["id"])) == task["id"]
        assert task["status"] in {"pending", "processing", "completed", "failed"}
    else:
        assert context["scope"] == "workspace"
        assert context["turn_state"] == "none"

    assert isinstance(context["history"], list)
    history_by_id = {}
    for message in context["history"]:
        assert set(message) == {"id", "role", "text"}
        assert_text(message["id"])
        assert_text(message["text"])
        assert message["role"] in {"user", "assistant"}
        assert message["id"] not in history_by_id
        history_by_id[message["id"]] = message
    if incoming["kind"] != "user_message":
        original = history_by_id[incoming["message_id"]]
        assert original["role"] == "user"
        if incoming["text"] is not None:
            assert original["text"] == incoming["text"]

    assert isinstance(context["tool_results"], list)
    for result in context["tool_results"]:
        assert set(result) == {"tool", "content"}
        assert result["tool"] in VALID_TOOLS
        assert_text(result["content"])

    expected = case["expected"]
    assert set(expected) == {
        "intent",
        "new_video_tasks",
        "new_video_jobs",
        "video_quota_delta",
        "required_tools",
        "forbidden_tools",
        "business_effects",
        "response_checks",
    }
    assert expected["intent"] in VALID_INTENTS
    assert_text_list(expected["business_effects"], nonempty=True)
    assert_text_list(expected["response_checks"], nonempty=True)
    for key in ("new_video_tasks", "new_video_jobs", "video_quota_delta"):
        assert type(expected[key]) is int and expected[key] in {0, 1}
    for key in ("required_tools", "forbidden_tools"):
        assert_text_list(expected[key])
        assert set(expected[key]) <= VALID_TOOLS
    assert not set(expected["required_tools"]) & set(expected["forbidden_tools"])

    deltas = tuple(
        expected[key]
        for key in ("new_video_tasks", "new_video_jobs", "video_quota_delta")
    )
    if expected["intent"] == "process_video":
        assert context["scope"] == "workspace" and task is None
        assert deltas == (1, 1, 1)
        assert "create_video_task" in expected["required_tools"]
    else:
        assert deltas == (0, 0, 0)
    if context["scope"] == "source" or context["turn_state"] == "finalizing":
        assert "create_video_task" in expected["forbidden_tools"]
    if context["turn_state"] == "finalizing":
        assert "continue_when_ready" in expected["forbidden_tools"]
    if expected["intent"] == "continue_existing_goal":
        assert task is not None and task["status"] == "processing"
        assert "continue_when_ready" in expected["required_tools"]


def test_agent_eval_reuses_existing_followup_evidence_without_copying_it() -> None:
    payload = load_dataset()
    evidence_dataset = payload["evidence_dataset"]
    assert evidence_dataset == {
        "path": "evals/followup/cases.json",
        "minimum_cases": 40,
    }
    evidence_path = REPO_ROOT / evidence_dataset["path"]
    evidence_payload = json.loads(evidence_path.read_text(encoding="utf-8"))
    evidence_cases = evidence_payload["cases"]
    assert evidence_payload["version"] == 1
    assert len(evidence_cases) >= evidence_dataset["minimum_cases"]
    evidence_ids = {case["id"] for case in evidence_cases}
    assert len(evidence_ids) == len(evidence_cases)
    linked_ids = set()
    for case in payload["cases"]:
        references = set(case["context"]["evidence_case_ids"])
        assert references <= evidence_ids, f"Unknown evidence case in {case['id']}"
        linked_ids.update(references)
        assert not {"source_path", "evidence", "expected_claims"} & case.keys()
    assert linked_ids


def test_agent_eval_keeps_processing_failure_distinct_from_evidence_absence() -> None:
    cases = load_dataset()["cases"]
    by_tag = {tag: case for case in cases for tag in case["coverage"]}
    processing_failure = by_tag["failed_video_not_missing_evidence"]
    no_evidence = by_tag["missing_evidence_not_failed_video"]
    assert processing_failure["context"]["task"]["status"] == "failed"
    assert processing_failure["expected"]["intent"] == "report_processing_failure"
    assert no_evidence["context"]["task"]["status"] == "completed"
    assert no_evidence["expected"]["intent"] == "report_missing_evidence"
    assert no_evidence["context"]["evidence_case_ids"]
