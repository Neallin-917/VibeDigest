# Follow-up quality evaluation

This directory owns the source-grounded follow-up evaluation contract.

## Dataset

`cases.json` contains 40 seed cases covering direct facts, synthesis, unsupported questions, verbatim retrieval, translation, multi-turn references, and prompt injection. Most cases point to the existing real transcript fixtures under `backend/tests/fixtures/transcripts/`; adversarial cases use the synthetic source in this directory.

Each case records:

- the source fixture and conversation input;
- claims that a correct answer must preserve;
- claims that must not appear;
- exact evidence spans and timestamps when available;
- whether the assistant should refuse and whether transcript retrieval is expected;
- the expected response language.

## Safety and cost

The default test suite only validates the dataset schema and confirms that every evidence span exists in its declared source. It never calls an LLM or a paid provider.

Live model comparison must remain explicitly opt-in and must report runtime, provider, model, latency, token usage, and per-case results. Contract tests and model-quality evaluations are separate gates: a passing route test does not imply a grounded answer.

The local transport currently echoes the configured model rather than independently verifying the resolved model identity. New evaluation records keep `actual_model` null and record `reported_model` with `model_identity_verified: false`. Earlier raw records are preserved; their model field is not proof of independently verified identity. Reported usage is not a billing receipt.

## Public-answer applicability and sprint smoke

Current [public-transcript policy](../../AGENTS.md) takes precedence over the legacy `quote_verbatim` expectations. All six quote cases remain valid **internal retrieval** checks. For public answers, decline verbatim reproduction, paraphrase the supported idea, and link to the original source (with the fixture timestamp when available). Do not treat reproducing the evidence quote as a public-answer pass. This preserves the original retrieval ground truth rather than rewriting it.

[`../sprint-smoke.json`](../sprint-smoke.json) selects 12 follow-up and 8 Agent scenarios by ID, classifies all legacy quote cases, and defines an unobserved result template. It references this dataset instead of copying claims or evidence. The quote smoke scenario has separate internal-retrieval and public-answer expectations.

Record actual answers, tool traces and dimension verdicts separately from expectations. Model answers can support grounding and communication review; mocked business calls do not establish committed task, quota or queue effects. Without corresponding application/state evidence, business effects and continuation remain `not_observed`. Missing model observations remain `not_observed` too. Quality scores apply only to observed answers and cannot be inferred from dataset/schema tests.

Offline manifest validation:

```sh
EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini backend/tests/test_sprint_eval_manifest.py --no-cov -q
```
