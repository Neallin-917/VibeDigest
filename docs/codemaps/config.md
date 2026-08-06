# Configuration Codemap

> Last verified: 2026-07-30
> Secrets are environment-owned and must never be committed or copied into docs.

## Required Cloud configuration

| Variable | Consumer | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API + worker | Direct Postgres connection; private queue functions require the migration owner/server role |
| `SUPABASE_URL` | API + frontend | Auth/JWKS and project endpoint |
| `SUPABASE_SERVICE_KEY` | API + worker | Server-only Supabase operations; never expose to the browser |
| `SUPABASE_JWT_SECRET` | API | HS256 fallback validation where configured |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | Browser Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | Browser-safe Supabase anon key |
| `LLM_RUNTIME` | API + worker | `api` (default) or trusted-local `codex_local`; production rejects the latter |
| `LLM_PROVIDER` | API + worker + frontend server | Explicit API provider: `openai`, `openrouter`, or `custom` |
| `OPENAI_API_KEY` | API + worker + frontend server | Required for `LLM_PROVIDER=openai` or `custom` |
| `OPENROUTER_API_KEY` | API + worker + frontend server | Required for `LLM_PROVIDER=openrouter` |

`LLM_RUNTIME=api` is the product runtime. Every provider's smart and fast
defaults resolve to GPT-5.6 Luna; the OpenRouter route uses its canonical
`openai/gpt-5.6-luna` model ID. Set `LLM_PROVIDER=openai` to use the official
OpenAI API; `OPENAI_BASE_URL` is only used by `custom`. Leaving `LLM_PROVIDER`
unset keeps the legacy inference (`custom` when `OPENAI_BASE_URL` is set,
otherwise `openrouter`).

`LLM_RUNTIME=codex_local` is for a trusted developer machine only. It uses the
local Codex app-server and its existing `codex login` session, with ephemeral
read-only turns, denied approvals, bounded concurrency, and a timeout. It is
rejected when Railway production metadata is present. Model defaults live only
in `config/llm-provider-defaults.json`; environment aliases may override them.

## Queue worker

| Variable | Default | Meaning |
| --- | ---: | --- |
| `TASK_QUEUE_NAME` | `video_processing` | PGMQ queue |
| `TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS` | `300` | Lease duration |
| `TASK_QUEUE_HEARTBEAT_INTERVAL_SECONDS` | `60` | Lease renewal interval; must be shorter than visibility |
| `TASK_QUEUE_EXECUTION_TIMEOUT_SECONDS` | `3600` | Maximum wall-clock time per attempt |
| `TASK_QUEUE_MAX_ATTEMPTS` | `3` | Terminal attempt count |
| `TASK_QUEUE_MAX_POLL_SECONDS` | `5` | Long-poll duration |

## Other configuration groups

- Payments: `CREEM_*`, `COINBASE_*`
- Observability: `SENTRY_DSN`, `LANGSMITH_*`, `LOG_*`
- CORS/origin: `FRONTEND_URL`, `ALLOWED_ORIGINS`, `BACKEND_ORIGIN_URL`
- Audio: `OPENAI_AUDIO_BASE_URL`, `OPENAI_AUDIO_API_KEY`,
  `OPENAI_TRANSCRIPTION_MODEL`
- Summary: `SUMMARY_STRATEGY` defaults to `v5_dynamic`

Exact validation/defaults are owned by `backend/config.py`,
`backend/worker.py`, `frontend/src/env.ts`, and
`config/llm-provider-defaults.json`.

Production must keep `DEV_AUTH_BYPASS` and `MOCK_MODE` disabled. The backend
fails at startup when Railway production metadata is present and either flag is
enabled.
