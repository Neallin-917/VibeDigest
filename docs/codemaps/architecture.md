# VibeDigest Architecture Codemap

> Last Verified: 2026-04-01
> Scope: implementation structure and system shape only


## System Overview

**VibeDigest** is a video transcription and AI summarization platform using a Control Plane vs Data Plane architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Next.js 16 (App Router)                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │   │
│  │  │ Pages    │  │ API      │  │ Supabase Realtime      │ │   │
│  │  │ /[lang]/ │  │ Routes   │  │ (WebSocket Subscriber) │ │   │
│  │  └────┬─────┘  └────┬─────┘  └───────────┬────────────┘ │   │
│  └───────┼─────────────┼────────────────────┼──────────────┘   │
└──────────┼─────────────┼────────────────────┼──────────────────┘
           │ SSR         │ HTTP POST          │ Realtime
           ▼             ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              FastAPI Backend (Python 3.10+)              │   │
│  │                                                          │   │
│  │  ┌──────────────┐     ┌──────────────────────────────┐  │   │
│  │  │  REST API    │────▶│  LangGraph State Machine     │  │   │
│  │  │  (main.py)   │     │  (workflow.py)               │  │   │
│  │  └──────────────┘     └──────────────────────────────┘  │   │
│  │         │                        │                       │   │
│  │         ▼                        ▼                       │   │
│  │  ┌──────────────┐     ┌──────────────────────────────┐  │   │
│  │  │ Auth/Billing │     │  AI Processing Pipeline      │  │   │
│  │  │ Creem/USDC   │     │  Transcriber → Summarizer    │  │   │
│  │  └──────────────┘     └──────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                          │
           ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                 │
│  ┌────────────────────────┐  ┌────────────────────────────────┐│
│  │  Supabase (PostgreSQL) │  │  External Services             ││
│  │  ├─ tasks              │  │  ├─ OpenAI Whisper (ASR)       ││
│  │  ├─ task_outputs       │  │  ├─ OpenAI GPT-4o (LLM)        ││
│  │  ├─ threads/messages   │  │  ├─ yt-dlp (Video Download)    ││
│  │  ├─ subscriptions      │  │  ├─ Supadata (YT Transcripts)  ││
│  │  └─ payment_orders     │  │  └─ LangSmith (Observability)  ││
│  └────────────────────────┘  └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Key Architectural Patterns

| Pattern | Implementation | Benefit |
|---------|----------------|---------|
| **Control/Data Plane** | HTTP for commands; Supabase Realtime for status | Decoupled, resilient |
| **State Machine** | LangGraph orchestrates 4-node workflow | Resumable, debuggable |
| **Cascade Fallback** | Supadata → VTT → Whisper transcript strategy | Reliability + cost optimization |
| **Semaphore Limiting** | `MAX_CONCURRENT_JOBS = 4` | Prevents OOM/CPU saturation |
| **Cache Deduplication** | URL normalization + task cloning | Instant results for repeat URLs |

## Request Flow (Happy Path)

```
User                Frontend              Backend                 Supabase
  │                    │                     │                       │
  │─── Submit URL ────▶│                     │                       │
  │                    │── POST /process ───▶│                       │
  │                    │                     │── INSERT task ───────▶│
  │                    │◀── {task_id} ───────│                       │
  │                    │                     │                       │
  │                    │◀───────────────── Realtime: status=pending ─│
  │                    │                     │                       │
  │                    │                     │── LangGraph workflow ─│
  │                    │                     │   check_cache         │
  │                    │                     │   ingest              │
  │                    │                     │   cognition           │
  │                    │                     │   cleanup             │
  │                    │                     │                       │
  │                    │◀──────────────── Realtime: status=completed │
  │◀── Show Results ───│                     │                       │
```

## Directory Structure

```
/
├── backend/              # FastAPI + LangGraph (Python)
│   ├── main.py           # API entrypoint
│   ├── workflow.py       # LangGraph state machine
│   ├── tests/            # Pytest test suite
│   └── scripts/          # Utility scripts
├── frontend/             # Next.js 16 (TypeScript)
│   └── src/
│       ├── app/          # App Router pages + API routes
│       ├── components/   # React component library
│       └── lib/          # Utilities, clients, i18n
├── docs/                 # Documentation
│   └── codemaps/         # Architecture maps (this folder)
├── supabase/             # Database migrations
└── docker-compose.yml    # Container orchestration
```

## Deployment Topology

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vercel Edge   │────▶│   Railway/Fly   │────▶│    Supabase     │
│   (Frontend)    │     │   (Backend)     │     │   (Database)    │
│   Next.js SSR   │     │   FastAPI       │     │   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │                       │
         └──────────────────────┴───────────────────────┘
                        Supabase Realtime (WebSocket)
```

## Cross-Cutting Concerns

| Concern | Solution |
|---------|----------|
| **Auth** | Supabase Auth (Email + Google OAuth) |
| **Observability** | LangSmith (LLM tracing) + Sentry (Errors) |
| **Payments** | Creem (Card) + Coinbase Commerce (Crypto) |
| **i18n** | 3 UI locales (`en`, `zh`, `ja`) |
| **Rate Limiting** | Semaphore (4 concurrent) + Quota system |
