# VibeDigest Runbook

This file owns deployment, monitoring, rollback, and incident handling. Setup and contributor workflow live elsewhere.

## Deployment

### Local production-style backend

```bash
make release-prod
make start-prod
```

### Verify deployment

```bash
docker ps
docker logs <container_id>
```

If the deployment touches the frontend surface, also run:

```bash
cd frontend && npm run build
```

## Database and Migrations

- Supabase schema changes live under `supabase/migrations/`
- Historical SQL artifacts also exist under `backend/sql/`
- Apply schema changes through the agreed Supabase workflow before promoting a release

## Monitoring

### Error tracking

- Frontend and backend errors are reported to Sentry
- Required configuration:
  - `SENTRY_DSN`
  - `SENTRY_ENVIRONMENT`
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_ENVIRONMENT` for browser-side event labeling
- Environment matrix:
  - local → `development`
  - Railway production → `production`
  - Vercel production → `production`

### LLM observability

- Langfuse / LangSmith are used for model tracing
- Relevant configuration:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGCHAIN_TRACING_V2=true`

### Logs

- Container logs:

```bash
docker logs -f <container_id>
```

- Local non-production logs are generated artifacts and should not be committed

## Rollback

1. Stop the current deployment:

```bash
make stop
```

2. Revert the image or git revision used by `docker-compose.prod.yml`
3. Start the previous known-good version:

```bash
make start-prod
```

## Incident Triage

### LLM/provider failures

Symptoms:
- summarization failures
- connection timeouts
- provider mismatch errors

Checks:

```bash
make verify
```

Then verify:
- `OPENAI_BASE_URL` and `OPENAI_API_KEY` when using a custom OpenAI-compatible endpoint
- `OPENROUTER_API_KEY` when using OpenRouter
- provider routing behavior matches `AGENTS.md`

### Backend container crashes

Checks:
- inspect container logs
- confirm Supabase credentials are set
- confirm FFmpeg is available in the image

### Frontend build failures

Checks:

```bash
cd frontend && npm run build
```

Then inspect:
- missing environment variables
- route or metadata errors
- type errors in App Router code

## Cleanup

Generated local artifacts can be removed with:

```bash
make clean
```
