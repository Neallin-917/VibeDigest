"""Offline contract checks for the source-grounded follow-up eval dataset."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = REPO_ROOT / "evals" / "followup" / "cases.json"
REQUIRED_CATEGORIES = {
    "direct_fact",
    "synthesis",
    "unsupported_refusal",
    "quote_verbatim",
    "translation",
    "multi_turn",
    "prompt_injection",
}
VALID_ROLES = {"user", "assistant"}
VALID_LANGUAGES = {"en", "zh"}


def load_cases() -> list[dict[str, object]]:
    payload = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    assert payload["version"] == 1
    cases = payload["cases"]
    assert isinstance(cases, list)
    return cases


def test_followup_eval_dataset_has_minimum_coverage() -> None:
    cases = load_cases()
    ids = [case["id"] for case in cases]
    category_counts = Counter(case["category"] for case in cases)

    assert len(cases) >= 40
    assert len(ids) == len(set(ids))
    assert REQUIRED_CATEGORIES <= category_counts.keys()
    assert all(category_counts[category] >= 3 for category in REQUIRED_CATEGORIES)


def test_followup_eval_cases_have_valid_contracts_and_real_evidence() -> None:
    for case in load_cases():
        assert isinstance(case["id"], str) and case["id"]
        assert case["locale"] in VALID_LANGUAGES
        assert case["expected_language"] in VALID_LANGUAGES
        assert isinstance(case["question"], str) and case["question"].strip()
        assert isinstance(case["requires_script"], bool)
        assert isinstance(case["should_refuse"], bool)

        history = case["history"]
        assert isinstance(history, list)
        for message in history:
            assert message["role"] in VALID_ROLES
            assert isinstance(message["content"], str) and message["content"].strip()

        expected_claims = case["expected_claims"]
        forbidden_claims = case["forbidden_claims"]
        evidence = case["evidence"]
        assert isinstance(expected_claims, list)
        assert isinstance(forbidden_claims, list)
        assert isinstance(evidence, list)

        if case["should_refuse"]:
            assert not expected_claims
            assert forbidden_claims
            assert not evidence
        else:
            assert expected_claims
            assert evidence

        source_path = REPO_ROOT / str(case["source_path"])
        assert source_path.is_file(), f"Missing source fixture for {case['id']}: {source_path}"
        source_text = source_path.read_text(encoding="utf-8")
        for span in evidence:
            quote = span["quote"]
            assert isinstance(quote, str) and quote.strip()
            assert quote in source_text, f"Evidence for {case['id']} is absent from {source_path}"
            timestamp = span["timestamp"]
            assert timestamp is None or (
                isinstance(timestamp, str) and f"**[{timestamp}]**" in source_text
            )
