# Frontend Data Plane Integration Guide

VibeDigest separates commands from observed state.

## Control Plane

- Every user message enters `POST /api/chat`. The shared Agent decides whether
  to answer, ask for clarification, read source-grounded evidence, or call the
  `create_video_task` business tool.
- Agent commands are signed server-to-server calls to FastAPI. FastAPI validates
  identity and input, then the canonical Postgres transaction creates or reuses
  the task, binds it to the conversation, records the action receipt, and
  enqueues an ID-only PGMQ job.
- A creation receipt contains a task id. It is not the final result. Terminal
  task/output writes enqueue one durable continuation for the same conversation.
- HTTP request handlers never execute video, transcription, or LLM pipelines.

## Data Plane

- Supabase Postgres is the source of truth for `tasks` and `task_outputs`.
- The Python worker writes progress, completion, and failure states.
- Supabase Realtime pushes committed database changes to the frontend.
- The frontend never polls task status on an interval.

```text
Next.js Agent ──signed command──► FastAPI ──transaction──► Postgres + PGMQ
      ▲                                                │          │
      │                                                ▼          ▼
      └── Supabase Realtime + durable continuation ── task state ◄─ worker
```

## Subscription Pattern

```typescript
const channel = supabase
  .channel(`shared_task_${taskId}`)
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "tasks",
      filter: `id=eq.${taskId}`,
    },
    (payload) => updateTaskSnapshot(payload.new),
  )
  .subscribe()
```

The initial snapshot and the Realtime subscription are both scoped by task id.
Database RLS remains the authorization boundary; a task id is not a credential.

## UI Rules

1. An optimistic task placeholder is allowed after a successful command.
2. Database state always replaces optimistic state.
3. Control-plane failures show immediately.
4. Worker failures are rendered from the task/output error state.
5. On Realtime reconnect or window focus, fetch one fresh snapshot to close any
   event gap. This is revalidation, not polling.

## Scaling Note

Postgres Changes remains the current mechanism. Move to Supabase Broadcast only
after measured subscription fan-out or security requirements justify it; do not
maintain two realtime paths in parallel.
