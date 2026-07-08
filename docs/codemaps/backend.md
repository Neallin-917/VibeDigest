# Backend Codemap

> Last Verified: 2026-04-01
> Scope: backend implementation map, not setup instructions

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | FastAPI (Python 3.10+) |
| **Orchestration** | LangGraph (StateGraph) |
| **AI/LLM** | OpenAI API (GPT-4o, Whisper) via LiteLLM |
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

    # === AI Outputs ===
    classification_result: Optional[Dict]
    final_summary_json: Optional[str]

    # === Control ===
    cache_hit: bool
    is_youtube: bool
    errors: Annotated[List[str], operator.add]
```

## Module Dependency Graph

```
main.py (FastAPI App)
    │
    ├──▶ workflow.py (LangGraph)
    │       ├──▶ video_processor.py ──▶ yt-dlp
    │       ├──▶ transcriber.py ──▶ OpenAI Whisper
    │       ├──▶ summarizer.py ──▶ OpenAI GPT-4o
    │       ├──▶ supadata_client.py ──▶ Supadata API
    │       └──▶ db_client.py ──▶ Supabase
    │
    ├──▶ translator.py ──▶ OpenAI GPT-4o-mini
    ├──▶ notifier.py ──▶ Email
    └──▶ config.py (Settings)
            └──▶ .env.production + .env.local
```

## Core Modules

| File | Size | Purpose | Key Exports |
|------|------|---------|-------------|
| `main.py` | 32KB | FastAPI app, routes, background tasks | `app`, `run_pipeline` |
| `workflow.py` | 20KB | LangGraph state machine | `app` (compiled graph) |
| `summarizer.py` | legacy facade | LLM summarization entrypoint | module exports |
| `transcriber.py` | 23KB | Whisper transcription | `Transcriber` |
| `video_processor.py` | 33KB | yt-dlp download, caption extraction | `VideoProcessor` |
| `db_client.py` | 24KB | Supabase CRUD operations | `DBClient` |
| `prompts.py` | 24KB | LLM prompt templates | Prompt strings |
| `supadata_client.py` | 15KB | Supadata API client | `SupadataClient` |
| `config.py` | 6KB | Settings, env loading | `settings` |
| `comprehension.py` | 6KB | Chat comprehension agent | `ComprehensionAgent` |
| `translator.py` | 6KB | Multi-language translation | `Translator` |

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

## Concurrency Control

```python
MAX_CONCURRENT_JOBS = 4
processing_limiter = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

async def run_pipeline(...):
    async with processing_limiter:
        # Only 4 pipelines run concurrently
        await workflow_app.ainvoke(initial_state)
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
└── test_transcript_guard.py # Validation tests
```

## Scripts

| Script | Purpose |
|--------|---------|
| `verify_llm_*.py` | LLM connection verification |
| `analyze_*.py` | Performance/task analysis |
| `rerun_*.py` | Task re-execution utilities |
| `manual_test_*.py` | Manual testing in Docker |
