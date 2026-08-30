# Configuration Codemap

> Last verified: 2026-08-28 (main-DB/local Agent acceptance; hosted Agent deployment still pending)
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
| `LLM_RUNTIME` | API + workers + local Next chat | `api` for Railway; `codex_local` for trusted private execution |
| `LLM_PROVIDER` | API + worker + frontend server | Explicit API provider: `openai`, `openrouter`, or `custom` |
| `OPENAI_API_KEY` | API + worker + frontend server | Required for `LLM_PROVIDER=openai` or `custom` |
| `OPENROUTER_API_KEY` | API + worker + frontend server | Required for `LLM_PROVIDER=openrouter` |
| `AGENT_INTERNAL_SECRET` | Next server + API + hosted worker | Shared random server-only service credential, minimum 32 characters |
| `AGENT_CONTINUATION_URL` | API + hosted worker | Fixed Next `/api/internal/agent/continue` callback; HTTPS on Railway |
| `AGENT_CONTINUATION_RUNTIME` | API + hosted worker | Must match chat: `api` hosted, `codex_local` trusted-local |
| `AGENT_CONTINUATION_QUEUE` | API + hosted worker | `agent_answers` hosted; `agent_answers_local_<id>` for local testing |

`LLM_RUNTIME=api` is the product runtime. Every provider's smart and fast
defaults resolve to GPT-5.6 Luna; the OpenRouter route uses its canonical
`openai/gpt-5.6-luna` model ID. Set `LLM_PROVIDER=openai` to use the official
OpenAI API; `OPENAI_BASE_URL` is only used by `custom`. Leaving `LLM_PROVIDER`
unset keeps the legacy inference (`custom` when `OPENAI_BASE_URL` is set,
otherwise `openrouter`).

`LLM_RUNTIME=codex_local` is for trusted developer machines and the bounded
`trusted_codex` catalog worker. It uses the local Codex app-server and existing
ChatGPT-managed login. Conversation runs disable ambient tools and expose only
the shared business tools through one ephemeral loopback MCP server. Model
approval is never a substitute for application authorization. Railway rejects
the setting and retains its API-provider paths. Local frontend launchers default to this
runtime when `LLM_RUNTIME` is absent; an explicit `LLM_RUNTIME=api` override is
preserved for hosted-path testing. Model
defaults live only in `config/llm-provider-defaults.json`; environment aliases
may override them.

`make dev` provisions `.agent-service-key` with mode `0600` only when no explicit
secret exists. The same key is reused by `make start-frontend`; queue identity is
derived from it. Docker reaches Next through `host.docker.internal`. Changing the
port/runtime requires restarting the stack through `make dev`; starting only Next
cannot update an already-running worker. This does not apply database migrations.
Local API-path tests also use a developer queue. Never copy a development secret
into production or expose any `AGENT_*` credential through `NEXT_PUBLIC_*`.
The Compose worker runs `python worker.py --agent-only`: it never constructs a
video worker and requires `agent_answers_local_*`, even for API-path tests.
Railway rejects this local-only mode; its unchanged default entrypoint consumes
the hosted video queue plus the configured hosted continuation queue.

## Queue worker

| Variable | Default | Meaning |
| --- | ---: | --- |
| `TASK_QUEUE_NAME` | `video_processing` | PGMQ queue |
| `PODCAST_TASK_QUEUE_NAME` | `podcast_supply` | Catalog-supply PGMQ queue |
| `WORKER_PROFILE` | `hosted_api` | `hosted_api` or `trusted_codex`; each is capability-locked |
| `PODCAST_MAX_JOBS_PER_RUN` | `4` | Trusted runner batch bound |
| `TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS` | `300` | Lease duration |
| `TASK_QUEUE_HEARTBEAT_INTERVAL_SECONDS` | `60` | Lease renewal interval; must be shorter than visibility |
| `TASK_QUEUE_EXECUTION_TIMEOUT_SECONDS` | `3600` | Maximum wall-clock time per attempt |
| `TASK_QUEUE_MAX_ATTEMPTS` | `3` | Terminal attempt count |
| `TASK_QUEUE_MAX_POLL_SECONDS` | `5` | Long-poll duration |

`VIBEDIGEST_PROCESS_ROLE=podcast_discovery` identifies the deterministic
Railway producer and removes only its LLM-key requirement. It does not weaken
database, Supabase, or production bypass validation.

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
