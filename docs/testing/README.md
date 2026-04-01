# Testing Guide

> Last Verified: 2026-04-01

This file owns testing strategy, prerequisites, and coverage policy.

## Test Layers

| Layer | Tool | Default status |
| --- | --- | --- |
| Backend unit | Pytest | Default local + CI |
| Backend integration | Pytest | Opt-in |
| Frontend unit | Vitest | Default local + CI |
| Frontend E2E | Playwright | Separate from default unit flow |

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
```

Notes:
- `make test-unit` is mocked and safe by default
- `make test-backend` includes a local smoke path and skips cleanly when DB/provider prerequisites are missing
- `make test-integration` is opt-in and uses real provider/database prerequisites

### Frontend

```bash
make test-frontend
cd frontend && npm run test:cov
cd frontend && npx playwright test
```

## Prerequisites

### Backend integration prerequisites

- reachable test database
- provider credentials matching the active routing mode
- environment loaded from `.env.local` or shell

Routing rules:
- `OPENAI_BASE_URL` present -> custom provider mode
- `OPENAI_BASE_URL` absent -> OpenRouter mode

### Frontend E2E prerequisites

- installed Playwright browsers
- frontend test env configured
- mock or test auth state depending on the scenario

## Default Review Expectations

- Backend-only changes:
  - `make test-backend`
- Frontend-only changes:
  - `make test-frontend`
  - `cd frontend && npm run build`
- Cross-boundary changes:
  - `make test-backend`
  - `cd frontend && npm run build`

## Related Files

- `backend/pytest.ini`
- `frontend/vitest.config.ts`
- `frontend/playwright.config.ts`
- `frontend/e2e/README.md`
