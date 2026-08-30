# Contributor Guide

This file owns the development workflow. It does not duplicate product setup, deployment, or architecture details.

## Development Baseline

- Frontend: Node.js 24 LTS, npm, Next.js 16
- Backend: Python 3.12, `uv`
- Dependency policy:
  - `pyproject.toml` is the only Python dependency manifest
  - `uv.lock` is the only resolved Python lock
  - Use the `dev` dependency group for tests and authoring tools
  - Install with `uv sync --locked`; do not use raw `pip`
- Primary local orchestration happens through `Makefile`

## Standard Workflow

1. Create a branch from `main`
2. Make a focused change
3. Run the relevant checks
4. Review your diff
5. Open a PR with a clear summary and test plan

## Branches and Commits

- Branch naming examples:
  - `feat/chat-thread-retry`
  - `fix/frontend-locale-redirect`
  - `docs/repo-standards`
- Commit format:

```text
<type>: <description>
```

Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

## Commands

| Command | Purpose |
| --- | --- |
| `make install` | Install backend and frontend dependencies |
| `make test-unit` | Backend unit test suite |
| `make test-backend` | Backend unit tests plus local smoke if prerequisites exist |
| `make test-integration` | Offline backend integration and LLM replay contracts |
| `make test-llm-replay` | Deterministic LLM replay without database or provider credentials |
| `make test-llm-live` | Explicit real-provider contract test |
| `make test-provider-smoke` | Real configured LLM provider smoke test |
| `make test-frontend` | Frontend unit tests in run mode |
| `cd frontend && npm run build` | Frontend production build |
| `cd frontend && npm run catalog:sync` | Regenerate the frontend mirror after editing the customer plan catalog |
| `make lint` | Enforced production-backend Ruff plus frontend ESLint |
| `make clean` | Remove generated local artifacts |

## Test Policy

- Repo-wide enforced coverage gate:
  - Backend: `65%` minimum through `backend/pytest.ini`
- Engineering target:
  - New or materially changed code should reach `80%+` coverage in its touched area
- Default execution split:
  - Backend unit tests: mocked, safe for local and CI
  - Backend local smoke: DB-backed `/api/process-video`, no real LLM call
  - Offline integration: replay-backed and safe for CI
  - Provider smoke and model evals: explicit opt-in, may require provider setup
  - Frontend unit tests: Vitest
  - Frontend E2E tests: Playwright, separate from default unit flow

### Required checks before merge

- Backend-only change:
  - `make test-backend`
- Frontend-only change:
  - `make test-frontend`
  - `cd frontend && npm run build`
- Cross-boundary change:
  - `cd frontend && npm run build`
  - `make test-backend`

## PR Checklist

- Scope is focused and diff is reviewable
- Commands run are listed in the PR
- Any changed facts are updated in their owning document
- Generated files, caches, logs, and build artifacts are not committed
- If public behavior changed, docs were updated in the correct owning file

## CI Automation

- The normal `CI` workflow never receives real text-model credentials.
- `LLM Live Validation` is manually dispatched and reads
  `OPENROUTER_API_KEY` from the environment-scoped `llm-live` secret.
- `Codex CI Failure Triage` runs only after failed trusted-repository CI runs
  or an explicit manual dispatch, and only when the repository variable
  `CODEX_CI_ENABLED` is `true`. It uses `openai/codex-action`, read-only
  permissions, and a secret named `OPENAI_API_KEY`.
- Codex produces diagnosis text only. It does not commit, open a pull request,
  merge, or deploy.
