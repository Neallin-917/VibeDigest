# Backend Codemap

> Last Verified: 2026-08-25
> Scope: backend implementation map, not setup instructions

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | FastAPI (Python 3.12) |
| **Orchestration** | LangGraph (StateGraph) |
| **Durable Jobs** | Supabase Queues / PGMQ + independent Python worker |
| **AI/LLM** | `create_chat_model` port; API providers in production and an optional trusted-local Codex app-server adapter |

Conversation Agent commands live in `api/routes/agent.py` and
`services/agent_turns.py`. They use a signed Next-to-API boundary and private
Postgres functions to accept input, submit/watch tasks, fence execution, and
commit safe messages. `worker.py::AgentAnswerWorker` only dispatches durable
continuations to the shared TypeScript Agent; it does not run a duplicate model
loop. See [architecture](architecture.md#conversation-agent) for state ownership
and [configuration](config.md) for callback/runtime isolation.
| **Package Manager** | uv |
| **Observability** | LangSmith, Sentry |

## LangGraph Workflow State Machine

```
                    ┌─────────────────┐
                    │   ENTRY POINT   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   check_cache   │
                    │  (Deduplication)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        cache_hit=true  cache_hit=true  cache_hit=false
        + has summary   - no summary
              │              │              │
              │              │              ▼
              │              │     ┌─────────────────┐
              │              │     │     ingest      │
              │              │     │ (Download+ASR)  │
              │              │     └────────┬────────┘
              │              │              │
              │              └──────┬───────┘
              │                     │
              │                     ▼
              │            ┌─────────────────┐
              │            │    cognition    │
              │            │ (Classify+Sum)  │
              │            └────────┬────────┘
              │                     │
              └─────────────┬───────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │     cleanup     │
                   │  (Delete temps) │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │       END       │
                   └─────────────────┘
```

### VideoProcessingState (TypedDict)

```python
class VideoProcessingState(TypedDict):
    # === Inputs ===
    task_id: str
    user_id: str
    guest_id: Optional[str]
    video_url: str

    # === Metadata ===
    video_title: str
    thumbnail_url: str
    author: str
    duration: float

    # === Intermediate Artifacts ===
    audio_path: Optional[str]
    direct_audio_url: Optional[str]
    transcript_text: Optional[str]      # Optimized/Clean
    transcript_raw: Optional[str]       # JSON with segments
    transcript_lang: str
    transcript_source: Optional[str]    # "supadata" | "vtt" | "whisper"

    # === AI Output ===
    final_summary_json: Optional[Dict]

    # === Control ===
    cache_hit: bool
    is_youtube: bool
    errors: Annotated[List[str], operator.add]
```

## Module Dependency Graph

```
main.py (FastAPI Command API)
    │
    ├──▶ task_queue.py ──▶ Supabase PGMQ
    │
worker.py (Durable Consumer)
    │
    ├──▶ execution_policy.py ──▶ workload/profile capability lock
    │
    ├──▶ job_handlers.py ──▶ workflow.py (LangGraph)
    │       ├──▶ video_processor.py ──▶ yt-dlp
    │       ├──▶ transcriber.py ──▶ configured audio provider
    │       ├──▶ summarizer.py ──▶ configured smart/fast model aliases
    │       ├──▶ supadata_client.py ──▶ Supadata API
    │       └──▶ db_client.py ──▶ Supabase
    │
    ├──▶ translator.py ──▶ configured fast model alias
    ├──▶ notifier.py ──▶ Email
    └──▶ config.py (Settings)
            └──▶ environment-owned deployment variables

podcast cron (Bounded Supply Job)
    └──▶ podcast_discovery.py ──▶ yt-dlp metadata
            ├──▶ podcast_sources / podcast_episodes
            └──▶ task_queue.py ──▶ podcast_supply

trusted catalog runner (Bounded Consumer)
    └──▶ worker.py ──▶ existing workflow + CodexLocalChatModel
```

## Core Modules

| File | Purpose | Key exports |
|------|---------|-------------|
| `main.py` | FastAPI routes and middleware | `app` |
| `worker.py` | PGMQ claim, heartbeat, capability guard, bounded drain | `TaskWorker`, `serve`, `drain_worker` |
| `services/execution_policy.py` | Workload/profile/queue mapping and provenance | `WorkloadKind`, `WorkerProfile` |
| `services/task_queue.py` | Versioned PGMQ messages | `PostgresTaskQueue` |
| `services/podcast_discovery.py` | Source catalog sync, recent discovery, resumable historical backfill, bounded enqueue | `PodcastDiscoveryService` |
| `services/job_handlers.py` | Pipeline attempt and output retry | `run_pipeline`, `handle_retry_output` |
| `workflow.py` | LangGraph state machine | `app` (compiled graph) |
| `services/summarizer/` | LLM summarization and validated V4/V5 output contracts | `Summarizer`, `SummaryResponseV5` |
| `services/transcriber.py` | Audio transcription | `Transcriber` |
| `services/video_processor.py` | yt-dlp download, caption extraction | `VideoProcessor` |
| `db_client.py` | Postgres operations | `DBClient` |
| `services/prompts.py` | LLM prompt templates | Prompt strings |
| `services/supadata_client.py` | Supadata API client | `SupadataClient` |
| `config.py` | Settings and environment validation | `settings` |
| `services/translator.py` | Multi-language translation | `Translator` |

## Ingest Strategy (Cascade Fallback)

```
┌──────────────────────────────────────────────────────────────┐
│                    INGEST NODE                               │
│                                                              │
│  Strategy 1: Supadata API (YouTube only)                     │
│      │ Success? ──▶ Return transcript                        │
│      │ Fail? ──▼                                             │
│                                                              │
│  Strategy 2: Direct VTT (YouTube only)                       │
│      │ Success? ──▶ Return transcript                        │
│      │ Fail? ──▼                                             │
│                                                              │
│  Strategy 3: Download + Whisper (Universal)                  │
│      │ Success? ──▶ Return transcript                        │
│      │ Fail? ──▶ Mark task as ERROR                          │
└──────────────────────────────────────────────────────────────┘
```

## Delivery and Concurrency

```python
FastAPI invokes a private Postgres submission function that atomically creates
state and enqueues a versioned, ID-only message. `hosted_api` consumes only
`user_submission`; `trusted_codex` consumes only `catalog_supply`. Both renew
PGMQ visibility, enforce an execution timeout, retry with bounded backoff, and
archive only after terminal persistence is confirmed.
```

Podcast discovery is a short-lived scheduled producer, not a second worker. It
only reads source metadata, records episode identities, advances per-source
historical cursors, and calls `PostgresTaskQueue.submit_catalog_video`.
Per-source and per-run caps bound work.
A separate bounded trusted runner drains `podcast_supply`; both worker profiles
reuse the same pipeline. A database publication trigger keeps unfinished or
tasks that fail the summary/transcript/metadata quality projection out of the
public library.

## Test Layout

```
backend/tests/
├── conftest.py              # Pytest fixtures
├── test_api.py              # API endpoint tests
├── test_workflow_mock.py    # Workflow unit tests
├── test_transcriber.py      # Transcription tests
├── test_summarizer.py       # Summarization tests
├── test_video_processor.py  # Download tests
├── test_comprehension.py    # Chat agent tests
├── test_integration.py      # E2E tests
├── test_task_queue.py       # Queue adapter contract tests
├── test_execution_policy.py # Workload/profile routing tests
├── test_worker.py           # Lease/retry/timeout tests
├── integration/
│   └── test_pgmq_queue.py   # Real PGMQ transaction lifecycle
└── test_transcript_guard.py # Validation tests
```

Operational scripts live under `backend/scripts/`; supported entrypoints are
documented by `Makefile` and `CONTRIBUTING.md`, not duplicated here.

## Summary output contract

The summarizer persists a V5-compatible JSON summary. The familiar conclusion,
keypoints, and dynamic sections remain required; `ui_blocks` is an optional
list of at most two validated knowledge blocks. Only three data-only shapes are
allowed: `comparison_table`, `bar_chart`, and `steps`. Every row, value, and
step retains source evidence. Invalid optional blocks are dropped without
discarding an otherwise valid text summary. The LLM never supplies executable
HTML, JSX, SVG, or renderer configuration.
