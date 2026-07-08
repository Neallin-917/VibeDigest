# VibeDigest Runbook

This file owns deployment, monitoring, rollback, and incident handling. Setup and contributor workflow live elsewhere.

## Deployment

### Current deployment inventory

Last verified: 2026-07-08.

| Surface | Current state | AI management status |
| --- | --- | --- |
| Frontend | Vercel project `vibe-digest` (`prj_JoNad0xEVl7XnJUTrbRwl0bBuJxo`) under team `team_4UjccirhWnowbBx4gbsuugVc`; latest production deployment `dpl_7ThhsPuYqbDrs2t7AxJCJCabVWfw` is `READY` from commit `0e47b26ca7a28ab8f63b0e5bd3c6ac7b8185e3cc`; production `NEXT_PUBLIC_API_URL` and `BACKEND_API_URL` point to `https://api.vibedigest.io` | Manageable through the Vercel connector and local Vercel CLI |
| Public domain | `vibedigest.io` uses Cloudflare nameservers; root and `www` resolve to Vercel; `https://vibedigest.io` redirects to `https://www.vibedigest.io/en` | DNS is visible through public checks; Cloudflare write access requires a Cloudflare connector, API token, or IaC |
| Backend | Railway project `steadfast-vibrancy`; service `VibeDigest`; production URL `https://api.vibedigest.io`; latest deployment `bed4aad3-7e76-48b2-be55-f6b0e3bd147e` is online and `/health` returns `200` | Manageable through the Railway CLI after local `railway login` |
| Backend API DNS | `api.vibedigest.io` is proxied by Cloudflare to Railway; public A queries return Cloudflare IPs, and the Railway verification TXT record is present | Manageable through the Cloudflare API token in local env |
| Database | Supabase project `transcriber` (`cwdgdytqafqrqnlcdpcc`) in `ap-south-1`, status `ACTIVE_HEALTHY`; local CLI is linked; no Edge Functions | Manageable through the Supabase connector and local Supabase CLI |

The repository also contains `docker-compose.prod.yml` for a production-style backend container behind Traefik/Cloudflare Tunnel on host port `16080`. Treat that as a self-hosted path until the current production backend host is confirmed.

### Local production-style backend

```bash
make release-prod
make start-prod
```

### Verify deployment

Run the read-only ops audit first:

```bash
make ops-audit
```

```bash
docker ps
docker logs <container_id>
curl -fsS http://localhost:16081/health
```

If the deployment touches the frontend surface, also run:

```bash
cd frontend && npm run build
curl -fsSL https://vibedigest.io >/dev/null
```

## Database and Migrations

- Supabase schema changes live under `supabase/migrations/`
- Historical SQL artifacts also exist under `backend/sql/`
- Apply schema changes through the agreed Supabase workflow before promoting a release
- Before applying new migrations, compare local migration files with the remote Supabase migration list. The local SQL filenames and remote migration names may drift because older migrations predate the current `supabase/migrations/` layout.

### Migration drift note

As of 2026-07-06, the Supabase connector reported production migrations through `20260204004941_advisor_fixes_phase1`, while local files under `supabase/migrations/` include newer `20260331` and `202604*` SQL files. Treat this as a release blocker until reconciled.

Safe reconciliation path:

1. Create or use a Supabase development branch.
2. Apply local migrations there first.
3. Compare the resulting schema and affected row counts.
4. Only merge/apply to production after the schema diff is understood.

## Monitoring

### Email

- Feedback email is sent through Resend from `noreply@vibedigest.io`
- Resend domain `vibedigest.io` is verified for sending; DNS includes verified DKIM plus `send.vibedigest.io` SPF/MX records

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

- LangSmith is used for model tracing
- Relevant configuration:
  - `LANGCHAIN_TRACING_V2=true` only when the LangSmith key and project are valid
  - `LANGCHAIN_API_KEY` or `LANGSMITH_API_KEY`
  - `LANGCHAIN_PROJECT` or `LANGSMITH_PROJECT`
- Shared local config keeps tracing disabled by default to prevent invalid LangSmith credentials from polluting local smoke tests.

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
make test-provider-smoke
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
