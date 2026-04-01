# Dependencies Codemap

> Last Verified: 2026-04-01
> Scope: backend and frontend dependency relationships

## Backend Module Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTRYPOINT                                     │
│                                                                             │
│                            ┌──────────┐                                     │
│                            │ main.py  │                                     │
│                            └────┬─────┘                                     │
│                                 │                                           │
│      ┌──────────────────────────┼──────────────────────────────┐            │
│      │                          │                              │            │
│      ▼                          ▼                              ▼            │
│ ┌─────────┐              ┌────────────┐               ┌────────────┐        │
│ │ config  │              │ workflow   │               │ db_client  │        │
│ │ .py     │              │ .py        │               │ .py        │        │
│ └────┬────┘              └─────┬──────┘               └─────┬──────┘        │
│      │                         │                            │               │
│      │         ┌───────────────┼───────────────┐            │               │
│      │         │               │               │            │               │
│      │         ▼               ▼               ▼            │               │
│      │   ┌──────────┐   ┌────────────┐  ┌────────────┐      │               │
│      │   │video_    │   │transcriber │  │summarizer  │      │               │
│      │   │processor │   │.py         │  │.py         │      │               │
│      │   └────┬─────┘   └─────┬──────┘  └─────┬──────┘      │               │
│      │        │               │               │             │               │
│      │        │               │               │             │               │
│      │        ▼               ▼               ▼             │               │
│      │   ┌─────────────────────────────────────────┐        │               │
│      │   │              EXTERNAL APIS              │        │               │
│      │   │  ┌─────────┐ ┌─────────┐ ┌───────────┐ │        │               │
│      │   │  │ yt-dlp  │ │ OpenAI  │ │ Supadata  │ │        │               │
│      │   │  │         │ │ Whisper │ │ API       │ │        │               │
│      │   │  │         │ │ GPT-4o  │ │           │ │        │               │
│      │   │  └─────────┘ └─────────┘ └───────────┘ │        │               │
│      │   └─────────────────────────────────────────┘        │               │
│      │                                                      │               │
│      └──────────────────────────────────────────────────────┘               │
│                                    │                                        │
│                                    ▼                                        │
│                            ┌──────────────┐                                 │
│                            │   Supabase   │                                 │
│                            │  PostgreSQL  │                                 │
│                            └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Import Graph (Detailed)

### main.py imports
```python
from config import settings
from db_client import DBClient
from notifier import Notifier
from supadata_client import SupadataClient
from summarizer import Summarizer
from transcriber import Transcriber, format_markdown_from_raw_segments
from translator import Translator
from video_processor import VideoProcessor
from utils.url import normalize_video_url
from workflow import app as workflow_app
```

### workflow.py imports
```python
from config import settings
from db_client import DBClient
from constants import OutputKind, TaskStatus
from supadata_client import SupadataClient
from summarizer import Summarizer
from comprehension import ComprehensionAgent
from transcriber import Transcriber
from video_processor import VideoProcessor
from utils.url import normalize_video_url
```

### summarizer.py imports
```python
from config import settings
from prompts import *
from utils.openai_client import get_openai_client
from utils.text_utils import *
```

## Singleton Instances

| Instance | Class | Location | Scope |
|----------|-------|----------|-------|
| `video_processor` | `VideoProcessor` | main.py, workflow.py | Request lifecycle |
| `transcriber` | `Transcriber` | main.py, workflow.py | Request lifecycle |
| `summarizer` | `Summarizer` | main.py, workflow.py | Request lifecycle |
| `translator` | `Translator` | main.py | Request lifecycle |
| `db_client` | `DBClient` | main.py, workflow.py | Application lifecycle |
| `notifier` | `Notifier` | main.py | Application lifecycle |
| `supadata_client` | `SupadataClient` | main.py, workflow.py | Request lifecycle |
| `settings` | `Settings` | config.py | Application lifecycle |

## Frontend Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         APP ROUTER                                   │   │
│  │                                                                      │   │
│  │  pages/               api/routes/           components/              │   │
│  │  ┌─────────┐         ┌─────────────┐       ┌─────────────┐          │   │
│  │  │ [lang]/ │────────▶│ process-    │       │ landing/    │          │   │
│  │  │ page    │         │ video       │       │ tasks/      │          │   │
│  │  │ layout  │         │ chat        │       │ chat/       │          │   │
│  │  └────┬────┘         │ threads     │       │ ui/         │          │   │
│  │       │              └──────┬──────┘       └──────┬──────┘          │   │
│  │       │                     │                     │                  │   │
│  │       └─────────────────────┴─────────────────────┘                  │   │
│  │                             │                                        │   │
│  │                             ▼                                        │   │
│  │                      ┌─────────────┐                                 │   │
│  │                      │    lib/     │                                 │   │
│  │                      │             │                                 │   │
│  │                      │ api.ts      │──────▶ Backend API              │   │
│  │                      │ supabase.ts │──────▶ Supabase Client          │   │
│  │                      │ i18n.ts     │──────▶ Translations             │   │
│  │                      │ utils.ts    │                                 │   │
│  │                      └─────────────┘                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## External Dependencies (Python)

| Package | Purpose | Version |
|---------|---------|---------|
| `fastapi` | Web framework | Latest |
| `langgraph` | Workflow orchestration | Latest |
| `langchain` | LLM abstraction | Latest |
| `openai` | OpenAI API client | Latest |
| `yt-dlp` | Video download | Latest |
| `pydub` | Audio manipulation | Latest |
| `supabase` | Database client | Latest |
| `httpx` | Async HTTP client | Latest |
| `pydantic` | Data validation | v2 |
| `sentry-sdk` | Error tracking | Latest |
| `coinbase-commerce` | Crypto payments | Latest |

## External Dependencies (TypeScript)

| Package | Purpose |
|---------|---------|
| `next` | React framework (v14) |
| `@supabase/supabase-js` | Supabase client |
| `@supabase/ssr` | Supabase SSR helpers |
| `tailwindcss` | CSS framework |
| `framer-motion` | Animations |
| `lucide-react` | Icons |
| `shadcn/ui` | Component library |
| `playwright` | E2E testing |
| `vitest` | Unit testing |

## Circular Dependency Check

**Status**: ✅ No circular dependencies detected

The codebase follows a clean layered architecture:
1. `main.py` → orchestrates all modules
2. `workflow.py` → imports processing modules
3. Processing modules (`summarizer`, `transcriber`, etc.) → import only `config`, `utils`
4. `utils/` → no internal dependencies
