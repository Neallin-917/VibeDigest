"""Validate smoke selection and policy applicability, without model execution."""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_manifest() -> dict:
    return json.loads((REPO_ROOT / "evals/sprint-smoke.json").read_text())


def test_smoke_references_cover_followup_categories_and_agent_boundaries() -> None:
    manifest = load_manifest()
    assert manifest["status"] == "expectations_only"
    datasets = {
        name: json.loads((REPO_ROOT / path).read_text())["cases"]
        for name, path in manifest["datasets"].items()
    }
    for name, count in (("followup", 12), ("agent", 8)):
        ids = manifest["selection"][name]
        assert len(ids) == len(set(ids)) == count
        assert set(ids) <= {case["id"] for case in datasets[name]}

    followup = [c for c in datasets["followup"] if c["id"] in manifest["selection"]["followup"]]
    assert {c["category"] for c in followup} == {c["category"] for c in datasets["followup"]}
    assert {c["expected_language"] for c in followup} == {"en", "zh"}
    agent = [c for c in datasets["agent"] if c["id"] in manifest["selection"]["agent"]]
    coverage = {tag for c in agent for tag in c["coverage"]}
    assert {"standalone_url", "two_urls_clarify", "source_scope_no_create",
            "tool_result_injection_no_create", "duplicate_input_same_action",
            "completion_resumes_private_goal", "failed_video_not_missing_evidence",
            "stale_worker_excluded"} <= coverage


def test_all_legacy_quotes_have_distinct_public_policy() -> None:
    manifest = load_manifest()
    cases = json.loads((REPO_ROOT / manifest["datasets"]["followup"]).read_text())["cases"]
    quotes = {c["id"] for c in cases if c["category"] == "quote_verbatim"}
    policy = manifest["legacy_quote_policy"]
    assert set(policy["case_ids"]) == quotes
    assert len(policy["case_ids"]) == len(quotes)
    assert policy["owner"] == "AGENTS.md"
    assert policy["internal_retrieval"] != policy["public_answer"]
    assert policy["classification"] == "internal_retrieval_only"
    assert policy["public_verbatim_allowed"] is False
    assert policy["public_response"] == "decline_verbatim_then_paraphrase_with_source_link"
    assert quotes & set(manifest["selection"]["followup"])


def test_result_template_cannot_imply_observed_model_or_business_success() -> None:
    recording = load_manifest()["recording"]
    template = recording["result_template"]
    dimensions = set(recording["model_dimensions"] + recording["application_dimensions"]
                     + recording["internal_dimensions"])
    assert set(template["verdicts"]) == dimensions
    assert set(recording["application_dimensions"]) == {"business_effects", "continuation"}
    for result in template["verdicts"].values():
        assert result["verdict"] == "not_observed"
        assert result["evidence"] == []
        assert result["reason"]
    assert template["answer"] is None and template["quality_score"] is None
    assert template["tool_trace"] == template["committed_state_evidence"] == []
    assert {"runtime", "provider", "requested_model", "actual_model", "latency_ms", "usage"} <= template.keys()
