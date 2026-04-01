# Runbook: VibeDigest Operations

This document outlines the procedures for deploying, monitoring, and maintaining the VibeDigest application.

## Deployment Procedures

### Production Deployment
The application is containerized using Docker.

1. **Build & Start**:
   ```bash
   make deploy
   ```
   This command executes `release-prod` (builds image) followed by `start-prod` (runs container).

2. **Verify Deployment**:
   After deployment, verify the services are running:
   ```bash
   docker ps
   # Check logs
   docker logs vibedigest-backend-1
   ```

3. **Database Migrations**:
   Ensure Supabase migrations are applied (currently managed via Supabase CLI or dashboard).
   For historical chat message cleanup, see [docs/migration/chat_messages_parts_migration.md](./migration/chat_messages_parts_migration.md).

### Rollback Strategy
If a deployment fails or introduces critical bugs:

1. **Stop Current Containers**:
   ```bash
   make stop
   ```
2. **Revert to Previous Image**:
   Modify `docker-compose.prod.yml` to point to the previous working tag or rebuild from the previous git commit.
3. **Restart**:
   ```bash
   make start-prod
   ```

## Monitoring and Observability

The system uses several tools for observability. Ensure these environment variables are set.

### Error Tracking (Sentry)
- **Frontend**: Reports client-side errors.
- **Backend**: Reports API and worker exceptions.
- **Check**: Log into Sentry dashboard to view active issues.
- **Config**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.

### LLM Observability (Langfuse / LangSmith)
- Traces LLM calls, costs, and latency.
- **Config**:
  - `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
  - `LANGCHAIN_TRACING_V2=true`

### Logging
- **Level**: Configured via `LOG_LEVEL` (default: `INFO`).
- **Access**:
  ```bash
  docker logs -f <container_id>
  ```

## Common Issues & Fixes

### 1. LLM Connection Failures
**Symptoms**: Summarization fails, timeout errors.
**Fix**:
1. Run verification script:
   ```bash
   make verify
   ```
2. Check `OPENAI_API_KEY` validity.
3. Verify `OPENAI_BASE_URL` if using a proxy.

### 2. Docker Container Crashes
**Symptoms**: API unreachable, container status `Exited`.
**Fix**:
- Check memory usage.
- Review logs for unhandled exceptions during startup.
- Ensure `SUPABASE_SERVICE_KEY` is present.

### 3. Frontend Build Errors
**Symptoms**: `npm run build` fails.
**Fix**:
- Run type checking locally: `tsc --noEmit`.
- Check for environment variable mismatches between local and build env.

## Maintenance Tasks

### Cleaning Up
Remove temporary files and build artifacts:
```bash
make clean
```

### Database Backups
(Managed via Supabase Platform)
- Ensure Point-in-Time Recovery (PITR) is enabled in Supabase settings.

## Support

For critical incidents, contact the engineering lead or refer to the internal escalation policy.
