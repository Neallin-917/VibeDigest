# Contributor Guide

Welcome to the VibeDigest project! This guide covers the development workflow, environment setup, and testing procedures.

## Development Workflow

We follow a strict development workflow to ensure quality and stability.

### 1. Git Workflow
- **Branching**: Create feature branches from `main` (e.g., `feat/user-auth`, `fix/login-bug`).
- **Commits**: Use conventional commits format:
  ```text
  <type>: <description>

  <optional body>
  ```
  Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- **Pull Requests**:
  - Use `git diff [base-branch]...HEAD` to review all changes.
  - Draft a comprehensive summary.
  - Include a test plan.

### 2. Coding Standards
- **Immutability**: Always create new objects; never mutate state.
- **File Organization**: Prefer many small files (200-400 lines) over few large ones.
- **Error Handling**: Comprehensive `try/catch` blocks with user-friendly messages.
- **Input Validation**: Use `zod` for all data crossing boundaries.

## Environment Setup

### 1. Prerequisites
- Node.js (v20+)
- Python (3.10+)
- Docker & Docker Compose
- Supabase CLI (optional, for local DB)

### 2. Configuration
We use a **shared config + local secrets** pattern:

- `.env.production` — Shared configuration (committed to Git)
- `.env.local` — Secrets/API keys (never committed)

```bash
# 1. Clone will get .env.production automatically (from Git) if available

# 2. Create local secrets file (root - for backend/docker)
cp .env.example .env.local
# Fill in: OPENROUTER_API_KEY or OPENAI_BASE_URL + OPENAI_API_KEY, SUPABASE_SERVICE_KEY, DATABASE_URL, etc.

# 3. Create local secrets file (frontend)
# Note: Check frontend/.env for reference of required keys
cp frontend/.env frontend/.env.local
# Fill in: TEST_USER_PASSWORD, etc.
```

**Key Environment Variables:**

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Required when `OPENAI_BASE_URL` is set for a custom OpenAI-compatible endpoint |
| `OPENROUTER_API_KEY` | Required when `OPENAI_BASE_URL` is not set and the app falls back to OpenRouter |
| `OPENAI_BASE_URL` | When set, switches text LLM routing to that OpenAI-compatible endpoint |
| `SUPABASE_URL` | Database endpoint |
| `SUPABASE_SERVICE_KEY` | Backend service role key (keep secret!) |
| `MODEL_ALIAS_SMART` | Optional override for the smart text model tier |
| `MODEL_ALIAS_FAST` | Optional override for the fast text model tier |
| `SENTRY_DSN` | Error tracking DSN |
| `LANGFUSE_PUBLIC_KEY` | LLM observability |

### 3. Installation
Use the Makefile to install dependencies for both frontend and backend:

```bash
make install
```

## Available Scripts

We use `make` to orchestrate tasks across the monorepo.

### Root Commands (Makefile)

| Command | Description |
|---------|-------------|
| `make install` | Install both backend (pip) and frontend (npm) dependencies |
| `make start-dev` | Start backend in Docker with hot-reload |
| `make start-frontend` | Start the Next.js frontend development server |
| `make start-prod` | Start backend in Docker (Production mode, immutable image) |
| `make stop` | Stop all running Docker containers |
| `make restart-dev` | Restart backend Docker container (Dev mode) |
| `make deploy` | Build and deploy production images |
| `make verify` | Run connection tests for LLM and Workflow |
| `make clean` | Clean up temporary files (`__pycache__`, etc.) |

### Frontend Commands (`frontend/package.json`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build production application |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:cov` | Run tests with coverage report |

## Testing Procedures

We require **80% test coverage** for all new features.

### Running Tests
```bash
# Run all tests (Frontend + Backend)
make test

# Run only backend tests (Pytest)
make test-backend

# Run only frontend tests (Vitest)
make test-frontend
```

### Test Types
1. **Unit Tests**: Individual functions/components.
2. **Integration Tests**: API endpoints and database interactions.
3. **Verification**: Use `make verify` to test actual LLM connectivity.
4. **Local smoke**: `make test-backend` now attempts one real `/api/process-video` smoke against the active provider and skips cleanly if DB/provider prerequisites are missing.

### Troubleshooting
- If build fails, analyze the error log.
- Use `make clean` to remove stale artifacts.
- Ensure Docker is running for integration tests.
