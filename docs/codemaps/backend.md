# Backend Codemap

> Last Verified: 2026-07-30
> Scope: backend implementation map, not setup instructions

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | FastAPI (Python 3.12) |
| **Orchestration** | LangGraph (StateGraph) |
| **Durable Jobs** | Supabase Queues / PGMQ + independent Python worker |
| **AI/LLM** | `create_chat_model` port; API providers in production and an optional trusted-local Codex app-server adapter |
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
```

## Core Modules

| File | Purpose | Key exports |
|------|---------|-------------|
| `main.py` | FastAPI routes and middleware | `app` |
| `worker.py` | PGMQ claim, heartbeat, retry, dispatch | `TaskWorker`, `serve` |
| `services/task_queue.py` | Versioned PGMQ messages | `PostgresTaskQueue` |
| `services/job_handlers.py` | Pipeline attempt and output retry | `run_pipeline`, `handle_retry_output` |
| `workflow.py` | LangGraph state machine | `app` (compiled graph) |
| `services/summarizer/` | LLM summarization | `Summarizer` |
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
state and enqueues a versioned, ID-only message. One worker process handles one
job at a time; throughput scales with Railway replicas. The worker renews PGMQ
visibility, enforces an execution timeout, retries with bounded backoff, and
archives only after terminal persistence is confirmed.
```

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
├── test_worker.py           # Lease/retry/timeout tests
├── integration/
│   └── test_pgmq_queue.py   # Real PGMQ transaction lifecycle
└── test_transcript_guard.py # Validation tests
```

Operational scripts live under `backend/scripts/`; supported entrypoints are
documented by `Makefile` and `CONTRIBUTING.md`, not duplicated here.
