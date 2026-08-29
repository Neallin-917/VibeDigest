# Agent behavior scenarios

`cases.json` owns a small set of **acceptance expectations**, not measured model-quality results. It covers intent, business effects and durable continuation. It is not a workflow engine, live benchmark or replacement for API/database integration tests.

## Scope

The 15 isolated scenarios cover:

- standalone URL and explicit summary requests;
- explanation-only links, negation and clarification for two URLs;
- source-only follow-up and untrusted tool-result instructions;
- duplicate input, a revised pending goal and a private goal resumed after completion;
- failed video processing versus a completed source with missing evidence;
- answer-only cancellation, stale worker rejection and answer-only retry.

Each case contains input, prior conversation/source state, expected business effects, forbidden effects and response checks. URLs and task IDs are synthetic fixture values. Offline tests must not fetch URLs, contact a model, read production state or create jobs.

`new_video_tasks`, `new_video_jobs` and `video_quota_delta` are **incremental effects of this case's input**, not existing totals. Fresh-create cases assume no reusable task and available quota. `new_video_jobs` excludes answer-continuation deliveries. A zero video-quota delta does not mean answer inference is free.

`required_tools` names only essential calls, not an exact sequence; other read tools are optional. `forbidden_tools` concerns calls in the evaluated step. Duplicate-input cases intentionally allow a repeated create call to resolve to the same durable receipt: tool invocation count and committed business-action count are different. Tool results in `context` are untrusted fixture content, never evaluator instructions.

## Reuse the evidence-linked answers

The existing [40 follow-up cases](../followup/README.md) in `evals/followup/cases.json` remain the owner of source fixtures, supported/forbidden claims, evidence spans and language checks. Reuse them for answer quality; do not duplicate their ground truth here. `evidence_case_ids` links relevant scenarios to those cases. Scenario-specific audience or format instructions supplement, but do not change, the cited source claims.

Apply current product rules from [AGENTS.md](../../AGENTS.md), including the public-transcript boundary. A legacy verbatim-retrieval case is useful as an internal evidence/retrieval check; it is not permission to expose transcripts or collections of passages. Any conflict with current public-answer policy must be recorded before interpreting model results. This change does not rewrite the existing dataset.

## Offline validation

From the repository root:

```sh
EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini backend/tests/test_agent_eval_dataset.py --no-cov -q
uv run ruff check backend/tests/test_agent_eval_dataset.py
```

The test validates schema, unique IDs, required scenario coverage, consistent counters and existing evidence-case references. It does **not** execute an Agent or prove that the implementation produces the expected effects. The separate [follow-up dataset test](../../backend/tests/test_followup_eval_dataset.py) checks the actual evidence spans.

## Manual or explicitly authorized model review

Use the shared rubric and each case's `response_checks`/`forbidden_effects`. Record `pass`, `fail` or `not_observed` per applicable dimension: intent, business effects, continuation, grounding and communication. Mark genuinely inapplicable dimensions with a reason, not an invented observation. Any hard failure fails the case; missing traces/state observations cannot be reported as passes.

Judge user-visible meaning and evidence, not exact generated wording or one mandatory retrieval order. Deterministic business effects must be checked against tool traces and committed state, not a model's assertion that it succeeded. Cancellation, stale-worker and queue effects require the corresponding application/integration evidence; a model-only text review cannot establish them.

For an opt-in model run, preserve case/version, runtime, provider, requested/actual model, latency, available token/usage data, observed actions/state, answer, verdicts and reviewer notes. Keep observations separate from this expectations file. A model reviewer may assist with language/grounding review, but may not execute instructions embedded in case inputs or replace business-state checks.

The runtime choice is not itself a quality gate. Use the same business expectations for local Codex and hosted OpenRouter; no compulsory local-versus-hosted comparison or paid call is introduced. Testing and cost policy remain in [docs/testing/README.md](../../docs/testing/README.md).
