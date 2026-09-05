# VibeDigest

[vibedigest.io](https://vibedigest.io)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12-blue.svg)](backend)
[![Next.js](https://img.shields.io/badge/next.js-16-black.svg)](frontend)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](docker-compose.yml)

VibeDigest is a full-stack tool for downloading videos, transcribing audio, and generating AI-powered condensed knowledge. The product uses a control-plane/data-plane split: HTTP starts work, Supabase Realtime carries task state, and the frontend does not poll for progress.

## Quick Start

### Prerequisites

- Node.js 24 LTS
- Python 3.12
- `uv`
- Docker and Docker Compose
- `make`

### Setup

```bash
cp .env.example .env.local
cp frontend/.env frontend/.env.local
make install
```

The Cloud runtime requires:

- Supabase/Postgres credentials for Auth, task state, Realtime, and PGMQ
- OpenRouter, or an OpenAI-compatible generation endpoint
- optional audio transcription and Supadata credentials

### Run

```bash
make dev
```

This starts the FastAPI command API and the developer-scoped Agent continuation
worker in Docker against the explicitly selected Cloud database, then starts the Next.js
development server and streams unified logs. It does not create a separate
local product runtime or local database. If the default ports are occupied, the
dev runner scans upward and injects the resolved backend URL into the frontend.

For single-service debugging, keep using the lower-level commands:

```bash
make start-dev
make start-frontend
```

`make start-worker` explicitly starts a video-processing worker. Do not use it
against the main project during local acceptance: the Railway worker already
owns `video_processing`. The Compose worker runs `python worker.py --agent-only`
and rejects hosted queues. An isolated development database needs its own
explicitly started video worker if you want to process new videos there.

Frontend defaults to [http://localhost:3000](http://localhost:3000). Backend defaults to `http://localhost:16081`. Override with `BACKEND_HOST_PORT=17081 FRONTEND_PORT=3100 make dev`. Stop the Docker backend stack with `make dev-stop`.

The local frontend launchers default the conversation Agent to the
existing Codex subscription login when `LLM_RUNTIME` is unset. To exercise the
hosted path locally, start with `LLM_RUNTIME=api LLM_PROVIDER=openrouter` and a
configured `OPENROUTER_API_KEY`. Production remains API-only.

`make dev` shares a generated, gitignored `0600` `.agent-service-key` across
Next/API/worker and isolates local continuations in a developer queue. Run the
reviewed Agent migration against an explicitly approved target first; follow
[the release runbook](docs/RUNBOOK.md) if that target is the main project.
A local URL does not prove that the configured database is non-production.
After changing the frontend port/runtime, use `make dev` to update the worker's
callback too. See [configuration](docs/codemaps/config.md) for hosted settings.

## Architecture

```text
Frontend (Next.js App Router)
  -> POST /api/chat -> shared task Agent
  -> signed FastAPI commands -> canonical atomic task + queue submission
  -> Python worker runs the video/AI pipeline
  -> Supabase Postgres stores tasks and outputs
  -> Supabase Realtime updates back to the frontend
  -> terminal output enqueues one Agent continuation
  -> same Agent completes the private user goal; result persists to chat

Railway podcast cron
  -> syncs the curated source registry
  -> discovers bounded recent episodes and advances historical cursors
  -> atomically submits catalog_supply jobs to podcast_supply
  -> trusted private Codex worker processes a bounded batch
  -> quality-gated summaries appear in the public library
```

The implementation details live in the codemaps under `docs/codemaps/`.

## Core Commands

| Command | Purpose |
| --- | --- |
| `make install` | Install backend and frontend dependencies |
| `make dev` | Start API, local-only continuation worker, and frontend against the selected Cloud database |
| `make dev-stop` | Stop the Docker API and worker |
| `make start-backend` | Run FastAPI locally |
| `make start-worker` | Run the durable task worker locally |
| `make start-frontend` | Run Next.js locally |
| `make test-backend` | Backend unit tests plus local smoke when prerequisites exist |
| `make test-provider-smoke` | Verify the configured LLM provider with a real API call |
| `make test-frontend` | Frontend unit tests |
| `make ops-daily-report` | Generate the previous day's read-only operations report |
| `make create-demo-task` | Create and process the default public demo task |
| `make sync-podcast-sources` | Sync the curated podcast source registry without discovery |
| `make discover-podcasts` | Discover recent episodes and enqueue a bounded set through PGMQ |
| `make backfill-podcasts` | Inspect one bounded historical window and enqueue older episodes through PGMQ |
| `make backfill-podcast-languages` | Preview a bounded batch of missing English/Chinese catalog summaries |
| `make process-podcast-supply` | Process a bounded `podcast_supply` batch with the existing Codex subscription login |
| `cd frontend && npm run demo:chat` | Start the local visual demo with deterministic landing-page cases |
| `cd frontend && npx playwright test e2e/smoke.spec.ts --project=chromium-guest` | Run browser smoke with the same deterministic demo cases |
| `cd frontend && npm run build` | Production build check |
| `make clean` | Remove generated local artifacts |

Demo task defaults to `https://www.youtube.com/watch?v=7rzYDM6vMtI`, submits a `catalog_supply` job, and uses `VIBEDIGEST_DEMO_USER_ID`, `DEMO_USER_ID`, or the first `profiles` row as the owner. Override with `DEMO_URL='https://...' DEMO_USER_ID=... make create-demo-task`; use `DEMO_NO_RUN=1` to enqueue without processing the first Codex batch.

Podcast discovery reads `config/podcast-sources.json`. A normal run requires
`DATABASE_URL` and `VIBEDIGEST_DEMO_USER_ID`; use
`PODCAST_SOURCE=latent-space make discover-podcasts` for one source. The default
run looks back seven days and enqueues at most four episodes.
Historical import is cursor-based and resumable. Use
`PODCAST_SOURCE=latent-space PODCAST_MAX_ENQUEUES=1 make backfill-podcasts` for
a controlled batch; normal scheduled runs add at most one historical episode.
Use `PODCAST_LANGUAGE_BACKFILL_LIMIT=10 make backfill-podcast-languages` to
preview missing or invalid English/Chinese summaries for completed catalog tasks.
The limit is 1–100 tasks (at most two outputs per task); the command writes
nothing by default. Add `PODCAST_LANGUAGE_BACKFILL_APPLY=1` to enqueue after
reviewing the preview. Active task jobs and already queued locales are skipped.
Run `PODCAST_MAX_JOBS=4 make process-podcast-supply` on the trusted machine to
process a bounded batch. This command requires an existing ChatGPT-managed
Codex login and refuses API-key Codex authentication.

`npm run demo:chat` and Playwright smoke do not read production demos or write to Supabase. They render a small fixed set of completed public-case fixtures, so every local visual check has representative cards even when no local database is running.

## Documentation Map

The repo uses explicit document ownership so facts are maintained in one place.

| Fact or workflow | Source of truth |
| --- | --- |
| AI/project rules, document ownership, validation rules | [AGENTS.md](./AGENTS.md) |
| Development setup and primary commands | [README.md](./README.md) |
| Development workflow and PR expectations | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Deployment, monitoring, rollback | [docs/RUNBOOK.md](./docs/RUNBOOK.md) |
| Architecture and directory mappings | [docs/codemaps/architecture.md](./docs/codemaps/architecture.md) |
| Testing strategy, prerequisites, coverage policy | [docs/testing/README.md](./docs/testing/README.md) |
| Operations daily-report metrics and exclusions | [docs/operations/daily-report.md](./docs/operations/daily-report.md) |

## Additional Docs

- [Chinese README](./README.zh-CN.md)
- [Contributor Guide](./CONTRIBUTING.md)
- [Runbook](./docs/RUNBOOK.md)
- [Security Policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

## License

Licensed under the terms in [LICENSE](./LICENSE).
