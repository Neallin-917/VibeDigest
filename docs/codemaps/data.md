# Data Codemap

> Last verified: 2026-08-31
> Authoritative schema changes live in `supabase/migrations/`.

## Core state

```text
auth.users ──< tasks ──< task_outputs
                  │
                  ├──< chat_threads ──< chat_messages
                  ├── podcast_episodes >── podcast_sources
                  └── task_queue_handoffs ── PGMQ video_processing / podcast_supply

guest_usage is keyed by X-Guest-Id.
```

- `tasks`: owner, optional `guest_id`, normalized video URL, persisted
  `workload_kind`, metadata, status, progress, terminal error, publication, and
  lightweight public-library quality/search projection.
- `task_outputs`: script/raw transcript/summary/classification/audio/
  comprehension artifacts. Catalog tasks persist separate `summary` rows for
  `en` and `zh` under the existing `(task_id, kind, locale)` identity.
- `chat_threads` / `chat_messages`: Cloud chat persistence; message content
  follows the current AI SDK parts schema defined by its migrations.
- `guest_usage`: guest trial quota.
- `vibedigest_private.task_queue_handoffs`: server-only idempotency and terminal
  acknowledgement record.
- `vibedigest_private.ops_excluded_users`: explicit internal/development/test
  identity exclusions for read-only operations reporting; the report never
  infers exclusions from email or usage patterns.
- `podcast_sources`: curated supply registry, bounded discovery settings, and
  resumable historical backfill cursor.
- `podcast_episodes`: stable `(source_id, external_id)` discovery ledger and its
  optional canonical `task_id`.
- `pgmq.q_video_processing`, `pgmq.q_podcast_supply`, and archive tables:
  extension-owned delivery state;
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

1. `submit_user_video_task` and `submit_catalog_video_task` own workload-specific
   dedupe/create, quota policy, placeholders, active handoff, and `pgmq.send` in
   one transaction.
2. `submit_output_retry` and `retry_video_task` own output/task reset and retry send in one transaction; task retries never consume a second guest allowance.
3. The worker uses PGMQ visibility + heartbeat and treats delivery as
   at-least-once.
4. Terminal persistence must succeed before
   `complete_queue_job` archives the message and closes the handoff.
5. Completed task/output state is the coarse idempotency checkpoint on
   redelivery.
6. `user_submission` always routes to `video_processing`; `catalog_supply`
   always routes to `podcast_supply`, including task and output retries.
7. Worker profiles reload `workload_kind` and reject tasks outside their
   capability before calling the pipeline.
8. New `catalog_supply` submissions create English and Chinese summary
   placeholders in the task submission transaction. Existing tasks use the
   bounded `enqueue_catalog_summary_locale` backfill function so placeholder
   state and the ID-only retry message stay atomic. It reuses
   `submit_output_retry`, rejects non-catalog tasks, and cannot override the
   `podcast_supply` queue. Active task jobs and queued output retries are skipped.

## Public library publication

`tasks.publication_status` is one of `private`, `processing`, `pending_review`,
`published`, or `hidden`. Browser roles can read demo tasks and outputs only
when the task is `published`. Task/output triggers permit that state only after
the quality projection confirms a valid V4+ summary, takeaway, at least three
sourced key points, transcript, title, and thumbnail. The same projection owns
card takeaway, key-point count, quality score, source slug, source date, and
search text. Bilingual catalog projections include both localized takeaways in
search, so the library does not download full summary JSON for every card.
New catalog tasks require both `en` and `zh` outputs to pass the content and
language gates before publication; legacy rows are not assigned that requirement
retroactively. `public_quality_flags.available_languages` and `takeaways` own
per-language availability for Explore, public detail metadata/body, and sitemap.
Existing Japanese summaries remain supported; new catalog generation targets
English and Chinese. Missing route-language output never falls back to another
language's summary.
Discovery can request automatic publication, but cannot bypass this gate.

The private schema is revoked from `PUBLIC`; browser roles never receive direct
queue access.
