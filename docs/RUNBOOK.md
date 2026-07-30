# VibeDigest Cloud Runbook

This file owns deployment, monitoring, rollback, and incident handling. It does
not own local setup or dependency versions.

## Production topology

| Surface | Platform | Repository config |
| --- | --- | --- |
| Frontend | Vercel | `frontend/` |
| Command API | Railway | `railway.toml` |
| Task worker | Railway, separate service | `railway.worker.toml` |
| Auth/data/realtime/queue | Supabase | `supabase/migrations/` |

`railway.worker.toml` is not auto-discovered. Configure the Worker service
custom config path as `/railway.worker.toml`. The API and worker use the same
image but different start commands.

The repository contains no local “production” deployment path. Docker Compose
is development-only and connects to the configured Cloud development database.

## Release order

1. Reconcile local and remote Supabase migrations on a development branch.
2. Apply `202607290001_create_video_processing_queue.sql`.
3. Deploy/update the Railway Worker and verify it can poll an empty queue.
4. Deploy the Railway API.
5. Deploy the Vercel frontend.
6. Submit one controlled video and confirm:
   task/output transaction, PGMQ claim, heartbeat, progress writes, Realtime
   delivery, terminal state, archive, and completed handoff.

Do not reverse steps 2 and 4: an API that calls missing private queue functions
will return `503`.

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
`ghcr.io/pgmq/pg16-pgmq:v1.10.0`. Local Docker validation is optional, but a
release must not proceed unless that CI job passes.

## Health and queue checks

- API `/health` returns `200`.
- Worker logs show polling without repeated lease or SQL errors.
- Queue depth and oldest message age are bounded.
- `vibedigest_private.task_queue_handoffs` has no growing set of stale
  `queued` records.
- Failed tasks have a terminal sanitized error after the configured maximum
  attempts.
- Realtime task/output changes reach the browser without HTTP polling.

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

1. Check Worker replica health and the configured custom Railway config path.
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

### Database

Prefer roll-forward migrations. PGMQ extension/table/function rollback can
destroy delivery state and requires an explicit backup plus human approval.
Never delete the queue as an automatic rollback step.

## Secrets

Deployment and CI secrets are managed outside Git. Verify migrations and
deployments by names, counts, permissions, and redacted mappings only. Never
print or paste secret values into reports or logs.
