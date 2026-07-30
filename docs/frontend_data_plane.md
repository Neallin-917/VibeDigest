# Frontend Data Plane Integration Guide

VibeDigest separates commands from observed state.

## Control Plane

- The frontend calls `POST /api/process-video`.
- FastAPI validates identity and input, creates or reuses a task, and enqueues a
  durable PGMQ job.
- The response contains a task id. It is not the final result.
- HTTP request handlers never execute video, transcription, or LLM pipelines.

## Data Plane

- Supabase Postgres is the source of truth for `tasks` and `task_outputs`.
- The Python worker writes progress, completion, and failure states.
- Supabase Realtime pushes committed database changes to the frontend.
- The frontend never polls task status on an interval.

```text
Next.js ──HTTP command──► FastAPI ──enqueue──► PGMQ
   ▲                         │                   │
   │                         ▼                   ▼
   └──── Supabase Realtime ─ Postgres ◄──── Python Worker
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
