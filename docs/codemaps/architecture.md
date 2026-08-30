# VibeDigest Architecture Codemap

> Last verified: 2026-08-25
> Scope: implementation structure and Cloud production shape

## Product Boundary

VibeDigest is a Cloud-first video transcription and AI knowledge product.

- Production frontend: Next.js on Vercel
- Command API: FastAPI on Railway
- Identity and state: Supabase Auth + Postgres
- Durable task delivery: Supabase Queues (`pgmq`)
- User execution: Railway `hosted_api` Python worker
- Curated podcast supply: bounded Railway producer + trusted private `trusted_codex` worker
- State updates: Supabase Realtime

This is the only supported product topology. Development may expose components
on localhost, but must preserve the same Postgres, queue, Auth, and Realtime
contracts used in production. The ADR-approved private runner changes only
execution location; Supabase remains the sole task, queue, and result plane.

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│ Next.js Cloud UI                                             │
│ /[lang] · Auth · Tasks · Chat · Billing                      │
└───────────────────────────┬──────────────────────────────────┘
                            │ authenticated HTTP command
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ FastAPI Command API                                          │
│ validate · authorize · call atomic submission boundary       │
└──────────────────────┬───────────────────┬───────────────────┘
                       │                   │
                       ▼                   ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│ Supabase Postgres            │  │ Supabase Queues / PGMQ     │
│ tasks · outputs · billing    │  │ video_processing           │
│ threads · messages           │  │ video_processing · podcast_supply│
└──────────────┬───────────────┘  └─────────────┬──────────────┘
               │ Realtime                       │ claim
               │                                ▼
               │                  ┌─────────────────────────────┐
               │                  │ Capability-locked Workers   │
               │                  │ hosted_api · trusted_codex  │
               │                  └─────────────┬───────────────┘
               │                                │
               │                                ▼
               │                  ┌─────────────────────────────┐
               │                  │ Video / Transcript / LLM    │
               │                  │ Supadata · yt-dlp · ASR     │
               │                  │ API provider / Codex login  │
               │                  └─────────────────────────────┘
               └──────── committed task/output changes ────────► UI
```

## Request Flow

1. All inputs enter Next's `POST /api/chat`. The API authenticates the session,
   then a signed internal FastAPI command durably accepts the user turn before inference.
   The shared task Agent chooses clarification, source tools or video creation.
2. The `create_video_task` business tool uses a fixed action slot per turn.
   FastAPI validates the user-supplied URL and identity. A private Postgres function then
   persists `user_submission`, deduplicates, consumes quota, creates task/output
   state, and calls `pgmq.send('video_processing', ...)` in one transaction.
3. The same transaction records a task receipt, binds the conversation and registers
   a continuation. The UI receives a safe task part; the request never executes the pipeline.
4. A Python worker claims the ID-only message with a visibility timeout,
   extends the lease with a heartbeat, and enforces an attempt timeout.
5. The worker runs cache, intake, cognition, and cleanup stages and writes
   progress/results to Postgres.
6. The frontend observes committed changes through Supabase Realtime.
7. The worker stops the heartbeat before retry/archive. Archive and handoff
   completion share a transaction; failed attempts use bounded backoff, and the
   final attempt persists a terminal error before archival.
8. Separately, a short-lived cron discovers configured recent episodes, advances
   a durable historical cursor, and atomically persists `catalog_supply` into
   `podcast_supply`. A bounded trusted Codex worker runs the same pipeline; the
   cron never runs it. A database projection owns public quality and ranking.

## Conversation Agent

`frontend/src/lib/agent/task-agent.ts` is the shared conversation runner. Hosted
execution is AI SDK 7 `ToolLoopAgent`; trusted-local execution uses the official
Python Codex SDK/App Server and a capability-scoped loopback MCP bridge.
`tools.ts` owns the shared business tools. `source-index.ts` provides versioned,
timestamped lexical search/read; retrieval is agent-selected, not a fixed RAG step.
Each turn is bounded to 16 tool calls and 32,000 evidence/summary characters;
hosted execution additionally caps model steps at eight. UI streams expose only
text, source links and task receipts, never raw tool results.

`vibedigest_private.agent_turns` records execution/continuation state;
`agent_actions` records one idempotent create receipt. Existing task/output
terminal writes enqueue one ID-only continuation in the same transaction.
`AgentAnswerWorker` reuses PGMQ leases/retries and calls
`POST /api/internal/agent/continue` with an expiring service signature. That
callback claims a fenced execution, invokes the same Agent with read-only tools,
and saves the answer before acknowledging delivery. A newer user turn supersedes
the old pending goal. Cancelling an answer does not cancel video processing.

Private goals stay in chat, not in reusable/public summary intents. This is one
task-level handoff, not a general DAG/checkpoint runtime. Revisit an official
durable workflow runtime if multiple arbitrary waits become a product requirement.

## Ownership Boundaries

| Component | Owns | Does not own |
| --- | --- | --- |
| Next.js | Cloud UI, task Agent, safe message projection, session-aware routes | Video pipeline, task/queue transactions |
| FastAPI | Validation, authorization, task creation, enqueue | Video/ASR/LLM execution |
| Podcast cron | Source sync, metadata discovery, bounded enqueue | Pipeline execution, public-read authorization |
| PGMQ | Durable delivery, visibility timeout, retry eligibility | Business workflow |
| Hosted worker | `user_submission` pipeline plus bounded Agent callback delivery | Catalog supply, browser sessions, a second Agent loop |
| Trusted Codex worker | `catalog_supply`, subscription preflight, bounded drain | ToC tasks, source discovery |
| `workflow.py` | Pipeline stage orchestration | Message delivery or process durability |
| `VideoIntakeGateway` | Agent-plugin metadata/caption/ASR boundary | Cloud task persistence, MCP protocol |
| Supabase Postgres | Tasks, outputs, users, chat, billing facts | Transient React state |
| Supabase Realtime | Committed state notification | Source-of-truth storage |
| MCP adapter | Protocol and structured result mapping | Cloud task queue orchestration |

## Key Files

```text
/
├── pyproject.toml                         # Python dependency SSOT
├── uv.lock                                # Exact Python resolution
├── backend/
│   ├── main.py                            # FastAPI entrypoint
│   ├── worker.py                          # Durable queue consumer
│   ├── workflow.py                        # Processing stages
│   ├── services/
│   │   ├── task_queue.py                  # PGMQ adapter
│   │   ├── execution_policy.py             # Workload/profile capability mapping
│   │   ├── podcast_discovery.py            # Curated source discovery producer
│   │   ├── job_handlers.py                # Pipeline/retry handlers
│   │   └── video_intake/                  # Shared intake boundary
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/                           # App Router pages and BFF routes
│       ├── components/
│       └── lib/                           # Supabase, API, i18n
├── supabase/migrations/
│   ├── 202607290001_create_video_processing_queue.sql
│   └── 20260825160000_add_workload_execution_routing.sql
├── .railway/
│   └── railway.ts                         # API, hosted worker, and discovery cron IaC
└── docker-compose.yml                     # API/worker Cloud-contract development
```

## Cross-Cutting Rules

| Concern | Rule |
| --- | --- |
| Auth | Supabase Auth; backend validates bearer tokens; data access respects ownership |
| Async work | Only the worker executes video/ASR/LLM jobs |
| Delivery | PGMQ messages are archived only after terminal handling |
| Routing | Persisted workload selects queue; worker profile is fail-closed |
| Idempotency | Advisory transaction lock + active handoff key + terminal-state short circuit |
| Realtime | UI subscribes to committed Postgres changes; no HTTP polling |
| Secrets | Server-side environment only; never expose service credentials to the browser |
| Observability | Sentry for failures; LangSmith only when explicitly configured |
| Dependencies | `pyproject.toml` + `uv.lock`; Node package lock for frontend |

## Deployment Topology

```text
Vercel / Next.js
        │
        ▼
Railway FastAPI + podcast cron ─► Supabase Postgres + PGMQ
                                      ▲       │           │
                                      │       ▼           ▼
                               Realtime  Railway hosted  Trusted Codex
                                      │       worker      worker
                                      └────────┴───────────┘
```

The API and worker use separate Railway services built from the same backend
image. The trusted catalog runner uses the same worker/pipeline code outside
Railway. `.railway/railway.ts` owns the three Railway service contracts; local
deployment commands must not introduce a second Config-as-Code path. See ADR
0001.
