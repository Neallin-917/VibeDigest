.PHONY: all install start test lint lint-backend clean help
.PHONY: install-backend install-frontend
.PHONY: dev dev-stop start-backend start-worker start-frontend start-dev
.PHONY: test-backend test-frontend test-db-integration-smoke test-integration test-queue-integration test-llm-replay test-llm-live test-provider-smoke create-demo-task sync-podcast-sources discover-podcasts backfill-podcasts process-podcast-supply
.PHONY: stop restart-dev rebuild-dev
.PHONY: perf perf-frontend perf-check perf-update-baseline
.PHONY: ops-audit ops-daily-report

# --- Configuration ---
# 提取端口 (macOS 兼容)
FRONTEND_PORT=$(shell grep -o '"frontend_port": [0-9]*' .workspace.json | awk '{print $$2}')
BACKEND_PORT=16081

# Default target
help:
	@echo "Available commands:"
	@echo "  make install       - Install both backend and frontend dependencies"
	@echo "  make dev           - Start Docker backend + local frontend with unified logs"
	@echo "  make dev-stop      - Stop the Docker API and worker"
	@echo "  make start-backend - Start the backend server (local)"
	@echo "  make start-worker  - Start the durable Cloud task worker"
	@echo "  make start-frontend- Start the frontend development server"
	@echo "  make stop-frontend - Stop the frontend development server"
	@echo "  make stop-backend  - Stop the backend development server"
	@echo "  make restart-frontend - Restart the frontend development server"
	@echo "  make restart-backend  - Restart the backend development server"
	@echo "  make start-dev     - Start the API and worker against the dev Cloud DB"
	@echo "  make stop          - Stop all Docker containers"
	@echo "  make restart-dev   - Restart backend in Docker (quick, no rebuild)"
	@echo "  make rebuild-dev   - Rebuild backend in Docker (full rebuild)"
	@echo "  make test          - Run all tests"
	@echo "  make test-integration - Run offline integration tests"
	@echo "  make test-llm-replay - Run deterministic LLM replay tests without a database"
	@echo "  make test-llm-live - Run opt-in real-provider contract tests"
	@echo "  make test-provider-smoke - Verify the configured LLM provider with a real API call"
	@echo "  make ops-audit    - Run read-only deployment and local ops checks"
	@echo "  make ops-daily-report - Generate the previous day's read-only operations report"
	@echo "  make create-demo-task - Create and process the default demo task"
	@echo "  make sync-podcast-sources - Sync the podcast source catalog into Postgres"
	@echo "  make discover-podcasts - Discover and enqueue recent podcast episodes"
	@echo "  make backfill-podcasts - Advance bounded historical podcast backfill"
	@echo "  make process-podcast-supply - Process a bounded catalog batch with Codex subscription"
	@echo "  make lint          - Run formatters and linters"
	@echo "  make clean         - Clean up temporary files"

ops-daily-report:
	uv run python backend/scripts/generate_ops_daily_report.py

# --- Installation ---
install: install-backend install-frontend

install-backend:
	@echo "Installing backend dependencies..."
	uv sync --locked --group dev

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm ci

# --- Execution ---
dev:
	FRONTEND_PORT=$(FRONTEND_PORT) \
	BACKEND_HOST_PORT="$(BACKEND_HOST_PORT)" \
	uv run python scripts/dev.py

start-backend:
	@echo "Starting backend..."
	cd backend && uv run uvicorn main:app --reload --port $(BACKEND_PORT)

start-worker:
	@echo "Starting task worker..."
	cd backend && WORKER_PROFILE=hosted_api LLM_RUNTIME=api uv run python worker.py

start-frontend:
	@echo "Starting frontend..."
	cd frontend && npm run dev

stop-frontend:
	@echo "Stopping frontend on port $(FRONTEND_PORT)..."
	@lsof -t -i:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || echo "No process found on port $(FRONTEND_PORT)"

stop-backend:
	@echo "Stopping backend on port $(BACKEND_PORT)..."
	@lsof -t -i:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || echo "No process found on port $(BACKEND_PORT)"

restart-frontend: stop-frontend start-frontend

restart-backend: stop-backend start-backend

# --- Docker Environment (Isolated) ---
# Dev: Builds from source, Hot Reloads
PROJ_DEV=vibedigest-dev
start-dev:
	@echo "Starting Docker (Dev Mode)... [Project: $(PROJ_DEV)]"
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose -f docker-compose.yml up --build -d

dev-stop:
	@echo "Stopping Docker API and worker... [Project: $(PROJ_DEV)]"
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose -f docker-compose.yml down

stop:
	@echo "Stopping all containers..."
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose down

restart-dev:
	@echo "Restarting Docker (Dev Mode)... [Quick - no rebuild]"
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose down
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose up -d

rebuild-dev:
	@echo "Rebuilding Docker (Dev Mode)... [Full rebuild]"
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose down
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose up --build -d

# --- Testing ---
test: test-backend test-frontend

test-backend: test-unit test-db-integration-smoke

test-unit:
	@echo "Running unit tests (mocked, fast)..."
	EVENTLET_NO_GREENDNS=yes uv run pytest backend/tests/ -m "not integration and not llm_live and not eval and not network and not slow"

test-db-integration-smoke:
	@echo "Running API/database integration smoke..."
	@uv run python -c 'exec("""import os\nimport socket\nimport sys\nfrom pathlib import Path\nfrom urllib.parse import urlparse\nfrom dotenv import load_dotenv\n\nproject_root = Path.cwd()\nload_dotenv(project_root / \".env.local\", override=False)\nload_dotenv(project_root / \".env\", override=False)\nparsed = urlparse(os.getenv(\"TEST_DATABASE_URL\", \"postgresql://postgres:password@localhost:15432/langgraph\"))\nhost = parsed.hostname or \"localhost\"\nport = parsed.port or 5432\nsock = socket.socket()\nsock.settimeout(1.5)\nstatus = sock.connect_ex((host, port))\nsock.close()\nif status != 0:\n    print(f\"SKIP: test database is not reachable at {host}:{port}.\")\n    sys.exit(3)\n""")'; \
	status=$$?; \
	if [ $$status -eq 3 ]; then exit 0; fi; \
	if [ $$status -ne 0 ]; then exit $$status; fi; \
	PYTHONPATH=$$PYTHONPATH:$(PWD)/backend EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini -o addopts='' backend/tests/test_integration.py::test_process_video_endpoint_real_db --no-cov -v

test-queue-integration:
	@echo "Running real PGMQ integration tests..."
	PYTHONPATH=$$PYTHONPATH:$(PWD)/backend EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini -o addopts='' backend/tests/integration/test_pgmq_queue.py backend/tests/integration/test_agent_turns.py --no-cov -v

test-provider-smoke:
	@echo "Running provider smoke (real LLM API call)..."
	@uv run python -c 'exec("""import os\nimport sys\nfrom pathlib import Path\nfrom dotenv import load_dotenv\n\nproject_root = Path.cwd()\nload_dotenv(project_root / \".env.local\", override=False)\nload_dotenv(project_root / \".env\", override=False)\ncustom = (os.getenv(\"OPENAI_BASE_URL\") or \"\").strip()\nif custom and not (os.getenv(\"OPENAI_API_KEY\") or \"\").strip():\n    print(\"SKIP: OPENAI_BASE_URL is set but OPENAI_API_KEY is missing.\")\n    sys.exit(3)\nif (not custom) and not (os.getenv(\"OPENROUTER_API_KEY\") or \"\").strip():\n    print(\"SKIP: OPENAI_BASE_URL is unset and OPENROUTER_API_KEY is missing.\")\n    sys.exit(3)\n""")'; \
	status=$$?; \
	if [ $$status -eq 3 ]; then exit 0; fi; \
	if [ $$status -ne 0 ]; then exit $$status; fi; \
	PYTHONPATH=$$PYTHONPATH:$(PWD)/backend EVENTLET_NO_GREENDNS=yes uv run python backend/scripts/llm/verify_config.py --connect

ops-audit:
	uv run python scripts/ops_audit.py

test-integration:
	@echo "Running offline integration tests..."
	EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini backend/tests/ -m "integration and not pgmq and not llm_live and not eval and not network" --no-cov -v

test-llm-replay:
	@echo "Running deterministic LLM replay tests..."
	EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini backend/tests/integration/test_llm_replay_pipeline.py -m "integration and not llm_live" --no-cov -v

test-llm-live:
	@echo "Running opt-in real-provider contract tests..."
	OPENAI_BASE_URL= EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini backend/tests/integration/test_llm_pipeline.py -m llm_live --no-cov -v

test-frontend:
	@echo "Running frontend tests..."
	cd frontend && npm run test -- --run

verify:
	@echo "Verifying LLM connection..."
	uv run backend/scripts/llm/verify_connection.py
	@echo "Verifying Workflow..."
	uv run backend/scripts/tasks/test_workflow.py

create-demo-task:
	uv run python backend/scripts/tasks/create_demo.py \
		$(if $(DEMO_URL),--url "$(DEMO_URL)",) \
		$(if $(DEMO_USER_ID),--user-id "$(DEMO_USER_ID)",) \
		$(if $(DEMO_TITLE),--title "$(DEMO_TITLE)",) \
		$(if $(DEMO_NO_RUN),--no-run,)

sync-podcast-sources:
	uv run python backend/scripts/podcasts/discover.py --sync-only

discover-podcasts:
	uv run python backend/scripts/podcasts/discover.py \
		$(if $(PODCAST_SOURCE),--source "$(PODCAST_SOURCE)",) \
		$(if $(PODCAST_SINCE_DAYS),--since-days "$(PODCAST_SINCE_DAYS)",) \
		$(if $(PODCAST_MAX_ENQUEUES),--max-enqueues "$(PODCAST_MAX_ENQUEUES)",)

backfill-podcasts:
	uv run python backend/scripts/podcasts/discover.py \
		--mode backfill \
		$(if $(PODCAST_SOURCE),--source "$(PODCAST_SOURCE)",) \
		$(if $(PODCAST_SINCE_DAYS),--since-days "$(PODCAST_SINCE_DAYS)",) \
		$(if $(PODCAST_MAX_ENQUEUES),--max-enqueues "$(PODCAST_MAX_ENQUEUES)",) \
		$(if $(PODCAST_BACKFILL_WINDOW),--backfill-window "$(PODCAST_BACKFILL_WINDOW)",)

process-podcast-supply:
	uv run python backend/scripts/tasks/process_catalog_supply.py \
		$(if $(PODCAST_MAX_JOBS),--max-jobs "$(PODCAST_MAX_JOBS)",)

# --- Quality Control ---
lint:
	@echo "Linting backend..."
	$(MAKE) lint-backend
	@echo "Linting frontend..."
	cd frontend && npm run lint

lint-backend:
	uv run ruff check backend/api backend/services backend/utils backend/config.py backend/db_client.py backend/dependencies.py backend/main.py backend/worker.py
	uv run ruff check backend/api/routes/tasks.py backend/services/job_handlers.py backend/services/task_queue.py backend/worker.py --select=E4,E7,E9,F,I,UP,B --ignore=B008

# --- Utility ---
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".next" -prune -exec rm -rf {} + 2>/dev/null \; ; true
	find . -type d -name ".next-test" -prune -exec rm -rf {} + 2>/dev/null \; ; true
	find . -type d -name "coverage" -prune -exec rm -rf {} + 2>/dev/null \; ; true
	find . -type d -name "playwright-report" -prune -exec rm -rf {} + 2>/dev/null \; ; true
	find . -type d -name "test-results" -prune -exec rm -rf {} + 2>/dev/null \; ; true
	find . -name ".coverage" -delete 2>/dev/null; true
	find . -name "coverage.json" -not -path "*/node_modules/*" -delete 2>/dev/null; true
	rm -rf backend/temp/* backend/downloads/* backend/logs/* reports/* downloads/* temp/*
	@echo "Clean complete."

# --- Performance Monitoring ---
perf: perf-frontend
	@echo "Performance check complete. See .perf/ for reports."

perf-frontend:
	@mkdir -p .perf
	@echo "Building frontend and analyzing bundle sizes..."
	cd frontend && npm run build > /dev/null 2>&1
	node scripts/parse-build-output.js > .perf/frontend.json
	@echo "Results: .perf/frontend.json"
	@node -e "const d=require('./.perf/frontend.json'); console.log('  Total JS: '+d.total_js_kb+' KB ('+d.chunk_count+' chunks)')"

perf-check:
	@echo "Comparing against baselines..."
	@node scripts/perf-check.js

perf-update-baseline:
	@mkdir -p .perf/baselines
	@test -f .perf/frontend.json || (echo "Error: Run 'make perf-frontend' first." && exit 1)
	@cp .perf/frontend.json .perf/baselines/frontend.baseline.json
	@echo "Baseline updated from latest perf run."
