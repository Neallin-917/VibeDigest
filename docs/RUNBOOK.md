# VibeDigest Cloud Runbook

This file owns deployment, monitoring, rollback, and incident handling. It does
not own local setup or dependency versions.

## Production topology

| Surface | Platform | Repository config |
| --- | --- | --- |
| Frontend | Vercel | `frontend/` |
| Command API | Railway | `.railway/railway.ts` |
| Task worker | Railway, separate service | `.railway/railway.ts` |
| Podcast discovery | Railway cron, separate service | `.railway/railway.ts` |
| Catalog supply worker | Trusted private runner | `make process-podcast-supply` |
| Auth/data/realtime/queue | Supabase | `supabase/migrations/` |

Railway Infrastructure as Code is the single owner for all three services.
Preview changes with `npx railway config plan` and apply the reviewed plan with
`npx railway config apply --yes`. All three services use the same backend image
but different start commands. The trusted catalog runner is not deployed to
Railway and never stores ChatGPT-managed Codex authentication there.

The repository contains no local “production” deployment path. Docker Compose
is development-only. Its worker uses `--agent-only` and can consume only a
developer-scoped continuation queue, never the hosted video or catalog queues.

## Release order

1. Confirm the Supabase target explicitly. Prefer an isolated development branch;
   an explicitly authorized main-project rollout is allowed after checking a
   readable backup, the existing schema and a targeted application rollback.
   A main project is not a disposable test database: never reset it or run
   destructive integration fixtures against it.
   Compare the actual schema as well as migration names: historical remote
   versions do not all match the local filenames. Do not blindly push/replay
   the whole directory or mark unapplied files as applied. In particular,
   `20260401_reset_chat_history_for_data_parts_cutover.sql` deletes historical
   chats; it is not a prerequisite to rerun for the Agent upgrade. Review and
   apply only the genuinely pending changes against the confirmed target.
2. Apply the reviewed pending migrations in `supabase/migrations/`, including
   `20260825160000_add_workload_execution_routing.sql` before enabling either
   worker profile and `20260828052805_agent_task_turns.sql` before deploying
   the unified conversation Agent. Do not infer a development database from a
   localhost frontend; confirm the Supabase project/branch explicitly.
3. Deploy/update the Railway `hosted_api` Worker and verify it polls only
   `video_processing` plus `agent_answers` with API runtime. Before enabling the
   Agent callback, provision the shared `AGENT_INTERNAL_SECRET` in Next/API/worker
   and the fixed HTTPS `AGENT_CONTINUATION_URL`; see the configuration codemap.
4. Deploy the Railway API. Its `/health/ready` endpoint must return `200`;
   it rejects traffic when either canonical submission function, workload
   classification, retry routing, `podcast_supply`, publication state, podcast
   tables, output intent, monthly quota, Agent turn contract or INSERT/UPDATE
   publication of `public.chat_messages` in `supabase_realtime` is absent.
5. Run `make sync-podcast-sources`, then verify the expected discovery and
   backfill-enabled source rows.
6. Deploy the podcast cron with `DATABASE_URL`, `PODCAST_TASK_QUEUE_NAME`, and
   `VIBEDIGEST_DEMO_USER_ID`. It does not need an LLM API key. Run it once
   manually before enabling the schedule.
7. On the trusted runner, confirm `codex login status` reports ChatGPT login,
   then run `PODCAST_MAX_JOBS=1 make process-podcast-supply`. Startup must fail
   for API-key Codex authentication or a queue/profile mismatch.
8. Deploy the Vercel frontend.
9. Submit one controlled user video and one controlled catalog video and confirm:
   task/output transaction, PGMQ claim, heartbeat, progress writes, Realtime
   delivery, terminal state, archive, and completed handoff.
10. For an Agent-created video, close the page before completion and reopen the
    thread. Verify a single persisted continuation addresses the original private
    goal, duplicate delivery does not add a second answer, cancellation does not
    cancel the video, and answer retry does not consume video quota again.

Do not reverse steps 2 and 4: an API that calls missing private queue functions
will return `503`.

An unavailable callback must leave its delivery retryable, not archived as
completed. Inspect `vibedigest_private.agent_turns` and `task_queue_handoffs`
server-side; never expose execution tokens or raw source outputs in diagnostics.
After bounded retries, the existing chat receipt projects `agentState=failed`
and the user may retry the same input. A local continuation queue must not be
consumed by a hosted worker. During rollback, stop new Agent acceptance and drain
or deliberately cancel pending turns before removing callback configuration;
retain private state and prefer a roll-forward migration over dropping it.

## Required pre-release checks

Before running the commands below, confirm `DEV_AUTH_BYPASS=false` and
`MOCK_MODE=false`. Railway production startup fails closed if either developer
bypass is enabled.

```bash
uv sync --locked --group dev
make lint
make test-backend
cd frontend && npm run build
```

CI additionally runs the real PGMQ lifecycle test against
`ghcr.io/pgmq/pg16-pgmq:v1.5.1`. Local Docker validation is optional, but a
release must not proceed unless that CI job passes.

## Podcast discovery schedule

The cron runs every six hours in UTC. Each pass looks back seven days and
enqueues at most four recent episodes, then advances one resumable historical
window and enqueues at most one older episode. `config/podcast-sources.json` is
the reviewed source of truth; recent discovery requires
`discovery_enabled=true`, while historical import requires
`backfill_enabled=true`.
The job must exit after one pass. Railway skips a scheduled invocation while a
previous invocation is still running, so repeated long executions are an
incident rather than a reason to add an overlapping scheduler.

Monitor `podcast_sources.last_checked_at`, `last_success_at`, `last_error`,
`backfill_cursor`, `backfill_last_checked_at`, and `backfill_completed_at`, plus
`podcast_episodes.discovery_status`. A queue submission failure remains
retryable: the episode ledger is retained and the canonical task submission is
idempotent. Do not delete episode rows to force retries.

The cron never runs ASR or LLM work. Schedule
`PODCAST_MAX_JOBS=4 make process-podcast-supply` separately on the trusted
machine. Each invocation verifies the existing ChatGPT-managed Codex session,
drains at most the configured number of `podcast_supply` jobs, then exits. Do
not copy `auth.json` into Railway. If the trusted machine is offline, leave the
durable queue intact; do not redirect catalog work to `video_processing`.

## Health and queue checks

- API `/health` returns `200`.
- Worker logs show polling without repeated lease or SQL errors.
- `video_processing` and `podcast_supply` depth and oldest message age are bounded.
- `vibedigest_private.task_queue_handoffs` has no growing set of stale
  `queued` records.
- Failed tasks have a terminal sanitized error after the configured maximum
  attempts.
- A controlled failed task can be retried once without a second guest-usage
  debit, then returns to `pending` with exactly one new `process:` handoff.
- Realtime task/output/chat-message changes reach the browser without HTTP
  polling. `chat_messages` must be in the `supabase_realtime` publication, with
  its existing owner-scoped RLS intact; private Agent tables must not be published.
- Podcast source checks advance on schedule without exceeding the per-run cap.
- Catalog summary provenance reports `catalog_supply`, `trusted_codex`,
  `codex_local`, and `chatgpt_subscription`.
- Public queries return only `publication_status='published'` tasks whose
  database projection reports a valid V4+ summary, takeaway, three sourced key
  points, transcript, title, and thumbnail.

Never log queue message payloads, signed media URLs, access tokens, or service
credentials.

## Incident: queue submission returns 503

1. Stop promoting new API versions.
2. Verify the migration exists on the target Supabase project.
3. Verify API `DATABASE_URL` can execute only the required private submission
   functions.
4. Confirm PGMQ extension/queue existence.
5. Retry a controlled request. Atomic rollback means a failed submission must
   not leave a new task, quota debit, or placeholder rows.

Do not fall back to FastAPI `BackgroundTasks` or in-process execution.

## Incident: growing queue / stuck jobs

1. Identify the queue. For `video_processing`, check the Railway Worker; for
   `podcast_supply`, check the trusted runner and Codex login.
2. Inspect visibility timeout, heartbeat failures, and execution timeouts.
3. Check provider rate limits and database connectivity.
4. Scale worker replicas only after confirming jobs are idempotent at the
   current stage.
5. Do not manually archive a message until terminal task/output state is
   confirmed.

## Rollback

### Frontend

Promote the last known-good Vercel deployment.

### API

Redeploy the last known-good Railway API image/revision. If its queue contract
differs, stop request traffic until API and migration compatibility is clear.

### Worker

Scale the Worker service to zero before changing an incompatible message or
database contract, then deploy the last compatible revision and resume one
replica first.

### Podcast cron and catalog worker

Disable Railway discovery before changing its rules, and stop the trusted
catalog schedule before changing its capability profile. Existing jobs remain
in `podcast_supply`; roll back code/config without moving or deleting task,
episode-ledger, handoff, or PGMQ rows.

### Database

Prefer roll-forward migrations. PGMQ extension/table/function rollback can
destroy delivery state and requires an explicit backup plus human approval.
Never delete the queue as an automatic rollback step.

## Secrets

Deployment and CI secrets are managed outside Git. Verify migrations and
deployments by names, counts, permissions, and redacted mappings only. Never
print or paste secret values into reports or logs.
