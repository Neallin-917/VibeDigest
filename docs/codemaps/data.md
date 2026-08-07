# Data Codemap

> Last verified: 2026-07-30
> Authoritative schema changes live in `supabase/migrations/`.

## Core state

```text
auth.users ──< tasks ──< task_outputs
                  │
                  ├──< chat_threads ──< chat_messages
                  └── task_queue_handoffs ── PGMQ video_processing

guest_usage is keyed by X-Guest-Id.
```

- `tasks`: owner, optional `guest_id`, normalized video URL, metadata, status,
  progress, and terminal error.
- `task_outputs`: script/raw transcript/summary/classification/audio/
  comprehension artifacts.
- `chat_threads` / `chat_messages`: Cloud chat persistence; message content
  follows the current AI SDK parts schema defined by its migrations.
- `guest_usage`: guest trial quota.
- `vibedigest_private.task_queue_handoffs`: server-only idempotency and terminal
  acknowledgement record.
- `pgmq.q_video_processing` and archive tables: extension-owned delivery state;
  application code must use PGMQ functions, not edit these tables directly.

## Queue message v1

Process message:

```json
{"version":1,"kind":"process_video","job_id":"uuid","task_id":"uuid"}
```

Retry message:

```json
{"version":1,"kind":"retry_output","job_id":"uuid","output_id":"uuid"}
```

Messages deliberately omit user IDs and video URLs. The worker reloads and
validates current database state by entity ID.

## Transaction and delivery rules

1. `vibedigest_private.submit_video_task` owns task dedupe/create, guest quota,
   placeholder creation, active handoff, and `pgmq.send` in one transaction.
2. `submit_output_retry` and `retry_video_task` own output/task reset and retry send in one transaction; task retries never consume a second guest allowance.
3. The worker uses PGMQ visibility + heartbeat and treats delivery as
   at-least-once.
4. Terminal persistence must succeed before
   `complete_queue_job` archives the message and closes the handoff.
5. Completed task/output state is the coarse idempotency checkpoint on
   redelivery.

The private schema is revoked from `PUBLIC`; browser roles never receive direct
queue access.
