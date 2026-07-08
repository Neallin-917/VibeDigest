# VibeDigest

[vibedigest.io](https://vibedigest.io)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](backend)
[![Next.js](https://img.shields.io/badge/next.js-16-black.svg)](frontend)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](docker-compose.yml)

VibeDigest is a full-stack tool for downloading videos, transcribing audio, and generating AI-powered condensed knowledge. The product uses a control-plane/data-plane split: HTTP starts work, Supabase Realtime carries task state, and the frontend does not poll for progress.

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.10+
- `uv`
- Docker and Docker Compose
- `make`

### Setup

```bash
cp .env.example .env.local
cp frontend/.env frontend/.env.local
make install
```

Fill `.env.local` with either:

- `OPENROUTER_API_KEY`, or
- `OPENAI_BASE_URL` plus `OPENAI_API_KEY`

Also set your Supabase credentials before running the backend.

### Run

```bash
make dev
```

This starts the backend and Postgres in Docker, starts the frontend locally, and streams unified logs in one terminal. If the default ports are occupied, the dev runner scans upward and injects the resolved backend URL into the frontend.

For single-service debugging, keep using the lower-level commands:

```bash
make start-dev
make start-frontend
```

Frontend defaults to [http://localhost:3000](http://localhost:3000). Backend defaults to `http://localhost:16081`. Override with `BACKEND_HOST_PORT=17081 FRONTEND_PORT=3100 make dev`. Stop the Docker backend stack with `make dev-stop`.

## Architecture

```text
Frontend (Next.js App Router)
  -> POST /api/process-video
  -> Backend (FastAPI + LangGraph)
  -> Supabase task records
  -> Supabase Realtime updates back to the frontend
```

The implementation details live in the codemaps under `docs/codemaps/`.

## Core Commands

| Command | Purpose |
| --- | --- |
| `make install` | Install backend and frontend dependencies |
| `make dev` | Start Docker backend plus local frontend with unified logs |
| `make dev-stop` | Stop the Docker backend and Postgres stack |
| `make start-backend` | Run FastAPI locally |
| `make start-frontend` | Run Next.js locally |
| `make test-backend` | Backend unit tests plus local smoke when prerequisites exist |
| `make test-provider-smoke` | Verify the configured LLM provider with a real API call |
| `make test-frontend` | Frontend unit tests |
| `make create-demo-task` | Create and process the default public demo task |
| `cd frontend && npm run build` | Production build check |
| `make clean` | Remove generated local artifacts |

Demo task defaults to `https://www.youtube.com/watch?v=7rzYDM6vMtI`, sets `is_demo=true`, and uses `VIBEDIGEST_DEMO_USER_ID`, `DEMO_USER_ID`, or the first `profiles` row as the owner. Override with `DEMO_URL='https://...' DEMO_USER_ID=... make create-demo-task`; use `DEMO_NO_RUN=1` to create only the task row and output placeholders.

## Documentation Map

The repo uses explicit document ownership so facts are maintained in one place.

| Fact or workflow | Source of truth |
| --- | --- |
| AI/project rules, document ownership, validation rules | [AGENTS.md](./AGENTS.md) |
| Local setup and primary commands | [README.md](./README.md) |
| Development workflow and PR expectations | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Deployment, monitoring, rollback | [docs/RUNBOOK.md](./docs/RUNBOOK.md) |
| Architecture and directory mappings | [docs/codemaps/architecture.md](./docs/codemaps/architecture.md) |
| Testing strategy, prerequisites, coverage policy | [docs/testing/README.md](./docs/testing/README.md) |

## Additional Docs

- [Chinese README](./README.zh-CN.md)
- [Contributor Guide](./CONTRIBUTING.md)
- [Runbook](./docs/RUNBOOK.md)
- [Security Policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

## License

Licensed under the terms in [LICENSE](./LICENSE).
