# Data Models Codemap

> Last Verified: 2026-04-01
> Scope: database schema and data model mapping

## Database Schema (Supabase/PostgreSQL)

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│   auth.users    │       │  subscriptions  │
│   (Supabase)    │◀──────│                 │
└────────┬────────┘       └─────────────────┘
         │
         │ user_id
         │
    ┌────┴────┬────────────────┬────────────────┐
    │         │                │                │
    ▼         ▼                ▼                ▼
┌───────┐ ┌───────┐     ┌──────────┐    ┌──────────────┐
│ tasks │ │threads│     │ payment_ │    │   credits    │
│       │ │       │     │ orders   │    │              │
└───┬───┘ └───┬───┘     └──────────┘    └──────────────┘
    │         │
    │         │ thread_id
    │         ▼
    │     ┌───────┐
    │     │messages│
    │     └───────┘
    │
    │ task_id
    ▼
┌────────────┐
│task_outputs│
└────────────┘
```

### Core Tables

#### tasks
```sql
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    video_url       TEXT NOT NULL,
    video_title     TEXT,
    thumbnail_url   TEXT,
    author          TEXT,
    duration        FLOAT,
    status          TEXT DEFAULT 'pending',  -- pending|processing|completed|error
    progress        INTEGER DEFAULT 0,
    error           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_video_url ON tasks(video_url);
```

#### task_outputs
```sql
CREATE TABLE task_outputs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    kind            TEXT NOT NULL,  -- script|script_raw|summary|...
    content         TEXT,
    locale          TEXT,           -- zh|en|es|...
    status          TEXT DEFAULT 'pending',
    progress        INTEGER DEFAULT 0,
    error           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_task_outputs_task_id ON task_outputs(task_id);
CREATE INDEX idx_task_outputs_kind ON task_outputs(kind);
```

#### threads (Chat)
```sql
CREATE TABLE threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    title           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### messages (Chat)
```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,  -- user|assistant|system
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Enums & Constants

### Backend (constants.py)

```python
class TaskStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"

class OutputKind:
    SCRIPT = "script"           # Cleaned transcript
    SCRIPT_RAW = "script_raw"   # Raw JSON with segments
    SUMMARY = "summary"         # Source language summary
    CLASSIFICATION = "classification"  # Content classification
    AUDIO = "audio"             # Audio URL (podcasts)
    COMPREHENSION_BRIEF = "comprehension_brief"
```

### Frontend (types/index.ts)

```typescript
interface Task {
    id: string
    video_url: string
    video_title?: string
    thumbnail_url?: string
    author?: string
    duration?: number
    status: 'pending' | 'processing' | 'completed' | 'error'
    progress?: number
    error?: string
    created_at: string
    updated_at?: string
}

interface TaskOutput {
    id: string
    task_id: string
    kind: string
    content?: string
    locale?: string
    status: string
    progress?: number
}

interface Thread {
    id: string
    title: string
    updated_at: string
}

interface Message {
    id: string
    thread_id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
}
```

---

## LangGraph State (VideoProcessingState)

```python
class VideoProcessingState(TypedDict):
    # Inputs
    task_id: str
    user_id: str
    video_url: str

    # Metadata (persisted to DB)
    video_title: str
    thumbnail_url: str
    author: str
    duration: float

    # Intermediate (not persisted)
    audio_path: Optional[str]
    direct_audio_url: Optional[str]
    transcript_text: Optional[str]
    transcript_raw: Optional[str]
    transcript_lang: str
    transcript_source: Optional[str]  # supadata|vtt|whisper

    # AI Outputs
    classification_result: Optional[Dict]
    final_summary_json: Optional[str]
    comprehension_brief_json: Optional[str]

    # Control
    cache_hit: bool
    is_youtube: bool
    errors: Annotated[List[str], operator.add]
    ingest_error: Optional[str]
```

---

## API Request/Response Schemas

### POST /api/process-video

**Request:**
```json
{
    "video_url": "https://youtube.com/watch?v=..."
}
```

**Response:**
```json
{
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Task started"
}
```

### Task Detail (via Supabase)

```json
{
    "id": "550e8400-...",
    "video_url": "https://youtube.com/...",
    "video_title": "Video Title",
    "thumbnail_url": "https://i.ytimg.com/...",
    "author": "Channel Name",
    "duration": 3600.5,
    "status": "completed",
    "progress": 100,
    "created_at": "2025-01-23T12:00:00Z",
    "task_outputs": [
        {
            "id": "...",
            "kind": "script",
            "content": "Transcript text...",
            "status": "completed"
        },
        {
            "id": "...",
            "kind": "summary",
            "content": "{\"title\":\"...\",\"sections\":[...]}",
            "locale": "zh",
            "status": "completed"
        }
    ]
}
```

---

## Realtime Subscriptions

### Task Status Updates

```typescript
// Frontend subscribes to task changes
const channel = supabase
    .channel(`task-${taskId}`)
    .on(
        'postgres_changes',
        {
            event: 'UPDATE',
            schema: 'public',
            table: 'tasks',
            filter: `id=eq.${taskId}`
        },
        (payload) => {
            setTask(payload.new)
        }
    )
    .on(
        'postgres_changes',
        {
            event: '*',
            schema: 'public',
            table: 'task_outputs',
            filter: `task_id=eq.${taskId}`
        },
        (payload) => {
            updateOutput(payload.new)
        }
    )
    .subscribe()
```

---

## Type Synchronization

### Backend → Frontend Mapping

| Backend Field | Frontend Field | Notes |
|---------------|----------------|-------|
| `task_id` | `id` | Same |
| `video_url` | `video_url` | Same |
| `video_title` | `video_title` | Same |
| `thumbnail_url` | `thumbnail_url` | Same |
| `author` | `author` | ⚠️ Missing in old frontend types |
| `duration` | `duration` | ⚠️ Missing in old frontend types |
| `status` | `status` | Same |
| `progress` | `progress` | Same |

**Recommendation**: Generate types from Supabase schema using `supabase gen types typescript`
