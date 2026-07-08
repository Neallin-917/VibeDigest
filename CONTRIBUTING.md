# Contributor Guide

This file owns the development workflow. It does not duplicate product setup, deployment, or architecture details.

## Development Baseline

- Frontend: Node.js 20+, npm, Next.js 16
- Backend: Python 3.10+, `uv`
- Dependency policy:
  - Runtime Python dependencies live in root `requirements.txt`
  - Backend-only dev/test additions live in `backend/requirements-dev.txt`
  - `backend/requirements.core.txt` exists only for Docker layer caching and is not an authoring target
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
| `make test-provider-smoke` | Real configured LLM provider smoke test |
| `make test-frontend` | Frontend unit tests in run mode |
| `cd frontend && npm run build` | Frontend production build |
| `make lint` | Frontend lint plus backend lint placeholder |
| `make clean` | Remove generated local artifacts |

## Test Policy

- Repo-wide enforced coverage gate:
  - Backend: `65%` minimum through `backend/pytest.ini`
- Engineering target:
  - New or materially changed code should reach `80%+` coverage in its touched area
- Default execution split:
  - Backend unit tests: mocked, safe for local and CI
  - Backend local smoke: DB-backed `/api/process-video`, no real LLM call
  - Provider smoke and broader integration tests: opt-in, may require provider/database setup
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
