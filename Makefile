.PHONY: all install start test lint clean help
.PHONY: install-backend install-frontend
.PHONY: start-backend start-frontend start-dev start-prod
.PHONY: test-backend test-frontend test-local-integration-smoke
.PHONY: stop restart-dev rebuild-dev restart-prod deploy
.PHONY: perf perf-frontend perf-check perf-update-baseline

# --- Configuration ---
# 提取端口 (macOS 兼容)
FRONTEND_PORT=$(shell grep -o '"frontend_port": [0-9]*' .workspace.json | awk '{print $$2}')
BACKEND_PORT=16081

# Default target
help:
	@echo "Available commands:"
	@echo "  make install       - Install both backend and frontend dependencies"
	@echo "  make start-backend - Start the backend server (local)"
	@echo "  make start-frontend- Start the frontend development server"
	@echo "  make stop-frontend - Stop the frontend development server"
	@echo "  make stop-backend  - Stop the backend development server"
	@echo "  make restart-frontend - Restart the frontend development server"
	@echo "  make restart-backend  - Restart the backend development server"
	@echo "  make start-dev     - Start backend in Docker (Dev Mode, hot reload)"
	@echo "  make start-prod    - Start backend in Docker (Prod Mode, stable)"
	@echo "  make stop          - Stop all Docker containers"
	@echo "  make restart-dev   - Restart backend in Docker (quick, no rebuild)"
	@echo "  make rebuild-dev   - Rebuild backend in Docker (full rebuild)"
	@echo "  make restart-prod  - Restart backend in Docker (Prod Mode)"
	@echo "  make deploy        - Deploy to Production (Same as start-prod for now)"
	@echo "  make test          - Run all tests"
	@echo "  make lint          - Run formatters and linters"
	@echo "  make clean         - Clean up temporary files"

# --- Installation ---
install: install-backend install-frontend

install-backend:
	@echo "Installing backend dependencies..."
	uv pip install -r requirements.txt

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# --- Execution ---
start-backend:
	@echo "Starting backend..."
	cd backend && uv run uvicorn main:app --reload --port $(BACKEND_PORT)

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

# Prod: Runs Immutable Image, No Build
PROJ_PROD=vibedigest-prod
start-prod:
	@echo "Starting Docker (Prod Mode)... [Project: $(PROJ_PROD)]"
	@echo "ℹ️  Using image: transcriber-backend:prod"
	COMPOSE_PROJECT_NAME=$(PROJ_PROD) docker-compose --env-file .env.local -f docker-compose.prod.yml up -d

# Release: Explicitly builds the production image
release-prod:
	@echo "Building Production Image..."
	docker build -t transcriber-backend:prod -f backend/Dockerfile .
	@echo "✅ New production image built: transcriber-backend:prod"
	@echo "Run 'make start-prod' to deploy."

deploy: release-prod start-prod

stop:
	@echo "Stopping all containers..."
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose down
	COMPOSE_PROJECT_NAME=$(PROJ_PROD) docker-compose -f docker-compose.prod.yml down

restart-dev:
	@echo "Restarting Docker (Dev Mode)... [Quick - no rebuild]"
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose down
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose up -d

rebuild-dev:
	@echo "Rebuilding Docker (Dev Mode)... [Full rebuild]"
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose down
	COMPOSE_PROJECT_NAME=$(PROJ_DEV) docker-compose up --build -d

restart-prod:
	@echo "Restarting Docker (Prod Mode)..."
	COMPOSE_PROJECT_NAME=$(PROJ_PROD) docker-compose --env-file .env.local -f docker-compose.prod.yml down
	COMPOSE_PROJECT_NAME=$(PROJ_PROD) docker-compose --env-file .env.local -f docker-compose.prod.yml up -d

# --- Testing ---
test: test-backend test-frontend

test-backend: test-unit test-local-integration-smoke

test-unit:
	@echo "Running unit tests (mocked, fast)..."
	EVENTLET_NO_GREENDNS=yes uv run pytest backend/tests/ -m "not integration and not slow"

test-local-integration-smoke:
	@echo "Running local integration smoke (provider + /api/process-video)..."
	@python -c 'exec("""import os\nimport socket\nimport sys\nfrom pathlib import Path\nfrom urllib.parse import urlparse\nfrom dotenv import load_dotenv\n\nproject_root = Path.cwd()\nload_dotenv(project_root / \".env.local\", override=False)\nload_dotenv(project_root / \".env\", override=False)\ncustom = (os.getenv(\"OPENAI_BASE_URL\") or \"\").strip()\nif custom and not (os.getenv(\"OPENAI_API_KEY\") or \"\").strip():\n    print(\"SKIP: OPENAI_BASE_URL is set but OPENAI_API_KEY is missing.\")\n    sys.exit(3)\nif (not custom) and not (os.getenv(\"OPENROUTER_API_KEY\") or \"\").strip():\n    print(\"SKIP: OPENAI_BASE_URL is unset and OPENROUTER_API_KEY is missing.\")\n    sys.exit(3)\nparsed = urlparse(os.getenv(\"TEST_DATABASE_URL\", \"postgresql://postgres:password@localhost:15432/langgraph\"))\nhost = parsed.hostname or \"localhost\"\nport = parsed.port or 5432\nsock = socket.socket()\nsock.settimeout(1.5)\nstatus = sock.connect_ex((host, port))\nsock.close()\nif status != 0:\n    print(f\"SKIP: test database is not reachable at {host}:{port}.\")\n    sys.exit(3)\n""")'; \
	status=$$?; \
	if [ $$status -eq 3 ]; then exit 0; fi; \
	if [ $$status -ne 0 ]; then exit $$status; fi; \
	export PYTHONPATH=$$PYTHONPATH:$(PWD)/backend; \
	EVENTLET_NO_GREENDNS=yes uv run python backend/scripts/llm/verify_config.py --connect; \
	export PYTHONPATH=$$PYTHONPATH:$(PWD)/backend; \
	EVENTLET_NO_GREENDNS=yes uv run pytest -c backend/pytest.ini backend/tests/test_integration.py::test_process_video_endpoint_real_db --no-cov -v

test-integration:
	@echo "Running integration tests (OpenRouter real API)..."
	OPENAI_BASE_URL= MODEL_ALIAS_SMART=openai/gpt-4o-mini MODEL_ALIAS_FAST=openai/gpt-4o-mini uv run pytest backend/tests/ -m integration --no-cov -v

test-frontend:
	@echo "Running frontend tests..."
	cd frontend && npm run test

verify:
	@echo "Verifying LLM connection..."
	uv run backend/scripts/llm/verify_connection.py
	@echo "Verifying Workflow..."
	uv run backend/scripts/tasks/test_workflow.py

# --- Quality Control ---
lint:
	@echo "Linting backend..."
	# assuming ruff or black if available, otherwise just echo
	@echo "Linting frontend..."
	cd frontend && npm run lint

# --- Utility ---
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null; true
	find . -name ".coverage" -delete 2>/dev/null; true
	find . -name "coverage.json" -not -path "*/node_modules/*" -delete 2>/dev/null; true
	rm -rf backend/temp/* backend/downloads/*
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
