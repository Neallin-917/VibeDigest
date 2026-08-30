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
