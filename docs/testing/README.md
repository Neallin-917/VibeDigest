# Testing Guide

> Last Verified: 2026-08-07

This file owns testing strategy, prerequisites, and coverage policy.

## Test Layers

| Layer | Tool | Default status |
| --- | --- | --- |
| Backend unit | Pytest | Default local + CI |
| Backend offline integration | Pytest + replay fixtures | Default CI integration job |
| Live provider contract | Pytest | Manual opt-in only |
| Model quality eval | Pytest/eval dataset | Scheduled or release opt-in only |
| Frontend unit | Vitest | Default local + CI |
| Frontend E2E | Playwright + API mocks | Default CI, no real LLM |

## Coverage Policy

- Hard gate enforced by repo configuration:
  - Backend global coverage must stay at or above `65%`
- Engineering target:
  - New or materially changed code should reach `80%+` coverage in the touched area

This distinction is intentional: the repo gate protects baseline health, while the engineering target drives new work toward a stronger standard.

## Commands

### Backend

```bash
make test-unit
make test-backend
make test-integration
make test-llm-replay
make test-llm-live
make test-provider-smoke
```

Notes:
- `make test-unit` is mocked and safe by default
- `make test-backend` includes a local DB-backed `/api/process-video` smoke path and skips cleanly when the DB prerequisite is missing
- `make test-integration` runs offline component integration, including the OpenAI-compatible replay contract
- `make test-llm-replay` runs only deterministic replay and needs no database or provider credential
- `make test-llm-live` is an explicit real-OpenRouter contract and may incur cost
- `make test-provider-smoke` is opt-in and uses the configured provider for one real LLM API call

### Frontend

```bash
make test-frontend
cd frontend && npm run test:cov
cd frontend && npx playwright test
```

The default Playwright suite uses deterministic API mocks. Visual comparison is
an explicit local review because its PNG baselines are platform-specific and
intentionally ignored by Git:

```bash
cd frontend && RUN_VISUAL_REGRESSION=1 npx playwright test e2e/visual-regression.spec.ts --project=chromium-guest
```

Use `--update-snapshots` only after a human has reviewed the intended visual
change.

### Local visual demo

```bash
cd frontend && npm run demo:chat
```

This starts an isolated development server on port `3002` with deterministic
task metadata and progressive summary fixtures. It is intended for manually
checking the chat interaction — source card, playable iframe, conclusion, key
insights, comparison table, and lightweight bar chart — without Supabase,
FastAPI, a worker, or any model/provider
credential. The mode is disabled in production builds and does not change the
production Supabase + FastAPI data path.

## Prerequisites

### Backend offline integration prerequisites

- reachable test database
- environment loaded from `.env.local` or shell

The LLM replay contract starts a loopback-only HTTP endpoint and loads sanitized
cassettes from `backend/tests/fixtures/llm/`. Replay is fail-closed: an
unrecorded request fails instead of falling back to a real provider.

### Live provider prerequisites

- provider credentials matching the active routing mode
- environment loaded from `.env.local` or shell
- an explicit `llm_live` test selection or the manually dispatched
  `LLM Live Validation` workflow

Routing rules:
- `LLM_RUNTIME=api` uses an explicit `LLM_PROVIDER` when configured. The
  backwards-compatible fallback is `custom` when `OPENAI_BASE_URL` is present,
  otherwise OpenRouter.
- `LLM_RUNTIME=codex_local` is a manual, trusted-machine path only; it must
  never be selected by CI or hosted environments.

### LLM test markers

- `integration`: multiple local components, no paid API
- `llm_live`: real provider call, always opt-in
- `eval`: nondeterministic quality evaluation, always opt-in
- `network`: other external network access

Default CI must select `not llm_live and not eval and not network`. New provider-facing tests
must be fail-closed and must not silently use credentials inherited from the
developer shell or CI job.

### Codex CI boundary

- `openai/codex-action` diagnoses failed CI runs; it is not an application LLM
  provider and is never used to satisfy product test prompts.
- It is disabled unless the repository variable `CODEX_CI_ENABLED=true` is
  configured, so repositories without OpenAI API billing do not create noisy
  follow-up failures.
- The action receives `OPENAI_API_KEY` through its protected API proxy and runs
  with read-only repository permissions.
- ChatGPT/Codex subscription login is not substituted for OpenRouter or an
  OpenAI-compatible inference endpoint. Product tests use mocks/replay by
  default and explicit provider credentials only in environment-scoped live
  validation.

### Local Codex development boundary

The backend can use `LLM_RUNTIME=codex_local` during a manual local debugging
session. It runs the local Codex app-server through the Python SDK with an
ephemeral, read-only, no-approval thread. This is intentionally not an E2E or
CI transport: Codex usage limits and agent semantics are different from the
production API. The Next.js chat route retains its standard API transport so
its application-owned tool protocol is identical in local and hosted runs.

### Quality evaluation policy

- Keep a small, representative, sanitized dataset of transcript fixtures.
- Assert deterministic contracts exactly: schema, required fields, routing,
  error handling, and tool arguments.
- Score subjective output such as summary quality against explicit rubrics and
  aggregate thresholds; do not exact-match full generated prose.
- Run paid quality evals manually, on an environment-scoped release workflow,
  or on a bounded schedule. They are not PR gates.
- Record token/request counts with each eval result and cap the dataset before
  increasing model or sample count.

### Frontend E2E prerequisites

- installed Playwright browsers
- frontend test env configured
- mock or test auth state depending on the scenario

`NEXT_PUBLIC_E2E_MOCK=1` is mandatory in CI. Frontend E2E must not receive
OpenRouter or OpenAI provider secrets.

The local visual demo uses the same E2E-safe fixture boundary. It is suitable
for day-to-day UI review; use the local Supabase stack only when validating
Auth, RLS, or Realtime semantics.

## Default Review Expectations

- Backend-only changes:
  - `make test-backend`
- Frontend-only changes:
  - `make test-frontend`
  - `cd frontend && npm run build`
- Cross-boundary changes:
  - `make test-backend`
  - `cd frontend && npm run build`

Deployment or production-routing changes must also verify the deployed
server-side backend hop:

```bash
curl -fsSL https://www.vibedigest.io/api/health/backend-origin >/dev/null
```

This probe runs inside the Vercel route and fetches the backend origin health
endpoint. It is not equivalent to `https://api.vibedigest.io/health`, which only
tests the public API edge.

## Related Files

- `backend/pytest.ini`
- `frontend/vitest.config.ts`
- `frontend/playwright.config.ts`
- `frontend/e2e/README.md`
