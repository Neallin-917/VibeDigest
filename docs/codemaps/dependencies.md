# Dependency Codemap

> Last verified: 2026-07-30

## Sources of truth

| Ecosystem | Manifest | Exact resolution | Runtime |
| --- | --- | --- | --- |
| Python | `pyproject.toml` | `uv.lock` | Python 3.12 (`.python-version`) |
| Node | `frontend/package.json` | `frontend/package-lock.json` | Node 24 (`.nvmrc`) |
| CI actions | workflow YAML | pinned action tags | GitHub Actions |

Do not maintain copied “latest version” tables. Read the manifests/locks for
the current version and let Dependabot update the `uv` and `npm` ecosystems.

## Runtime graph

```text
Next.js ──HTTP command──> FastAPI ──private transaction──> Postgres + PGMQ
   ▲                                                        │
   └────────────── Supabase Realtime <── task/output writes ┤
                                                            ▼
                                                      Python Worker
                                                            │
                                             LangGraph + intake + LLM
```

The API and worker share the same locked Python image. Only the worker imports
and executes `job_handlers.py`/`workflow.py` for long-running processing.

## Upgrade policy

- Python: edit `pyproject.toml`, run `uv lock`, then `uv sync --locked`.
- Frontend: edit through `npm install <package>@<version>`, commit lock changes,
  and validate lint, tests, and production build under Node 24.
- Upgrade AI SDK packages as one compatibility batch.
- Never use raw `pip`, unbounded `latest`, or duplicate requirements files.
