import os
import sys
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import MagicMock, AsyncMock

import pytest
from httpx import AsyncClient, ASGITransport

backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

# Keep pytest hermetic and quiet:
# - disable Sentry entirely in tests
# - disable LangSmith/LangChain tracing background threads
# - reduce default console noise
os.environ["SENTRY_DSN"] = ""
os.environ["SENTRY_TRACES_SAMPLE_RATE"] = "0"
os.environ["SENTRY_PROFILES_SAMPLE_RATE"] = "0"
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_API_KEY"] = ""
os.environ["LANGSMITH_API_KEY"] = ""
os.environ.setdefault("LOG_LEVEL", "WARNING")

if os.getenv("SKIP_DB_TESTS") == "1":
    pytest.skip("DB tests disabled via SKIP_DB_TESTS=1", allow_module_level=True)

from main import app  # noqa: E402
from db_client import DBClient  # noqa: E402
from dependencies import (  # noqa: E402
    get_coinbase_client,
    get_current_user,
    get_db_client,
    get_task_queue,
    get_video_processor,
)
from services.task_queue import GuestQuotaExceededError, TaskSubmission  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "network: marks tests that require external network access"
    )



@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest.fixture(scope="session")
def postgres_container():
    """
    Returns DB URL.
    Optimized: Uses TEST_DATABASE_URL if set, or defaults to local docker run.
    """
    # Default to standard port 5432 if not specified
    db_url = os.getenv("TEST_DATABASE_URL", "postgresql://postgres:password@localhost:15432/langgraph")
    
    # Simple check if ready
    # We yield it. If connection fails in test_db, it will raise there.
    yield db_url
    
    # We do not stop it automatically here if it's external.
    pass

@pytest.fixture(scope="session")
def test_db(postgres_container):
    """
    Apply the canonical Cloud baseline to the test DB.

    Supabase supplies auth schema primitives in production; the fixture creates
    only that platform contract, then executes the repository migration.
    """
    db_url = postgres_container
    engine = create_engine(db_url)

    project_root = Path(__file__).resolve().parents[2]
    baseline_path = (
        project_root
        / "supabase"
        / "migrations"
        / "20260101000000_cloud_schema_baseline.sql"
    )
    baseline_sql = baseline_path.read_text()

    platform_sql = """
    DROP TABLE IF EXISTS public.chat_messages CASCADE;
    DROP TABLE IF EXISTS public.chat_threads CASCADE;
    DROP TABLE IF EXISTS public.payment_orders CASCADE;
    DROP TABLE IF EXISTS public.task_outputs CASCADE;
    DROP TABLE IF EXISTS public.tasks CASCADE;
    DROP TABLE IF EXISTS public.profiles CASCADE;
    DROP TABLE IF EXISTS public.guest_usage CASCADE;
    DROP TYPE IF EXISTS public.chat_thread_status CASCADE;
    DROP TYPE IF EXISTS public.subscription_tier CASCADE;
    DROP TABLE IF EXISTS auth.users CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;

    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        created_at timestamptz DEFAULT now()
    );
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      GRANT usage ON SCHEMA public TO anon, authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    END
    $$;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT '00000000-0000-0000-0000-000000000001'::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
      SELECT 'authenticated';
    $$ LANGUAGE sql STABLE;
    """

    fixture_data_sql = """
    INSERT INTO auth.users (id, email)
    VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com')
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles
       SET usage_limit = 100,
           usage_count = 0
     WHERE id = '00000000-0000-0000-0000-000000000001';

    INSERT INTO public.tasks (
      id, user_id, video_url, video_title, is_demo
    )
    VALUES (
      '1e60a06c-ef37-4f82-bffd-1a5135cb45c7',
      '00000000-0000-0000-0000-000000000001',
      'https://example.com/demo.mp4',
      'Demo Task',
      true
    )
    ON CONFLICT (id) DO NOTHING;
    """

    with engine.begin() as conn:
        conn.exec_driver_sql(platform_sql)
        conn.exec_driver_sql(baseline_sql)
        conn.exec_driver_sql(fixture_data_sql)

    return db_url

@pytest.fixture(scope="module")
async def async_client(test_db) -> AsyncGenerator[AsyncClient, None]:
    """
    Fixture for creating an async client.
    Overrides the DBClient to point to the test container.
    """
    # Create a fresh DBClient for testing
    test_db_client = DBClient()
    test_db_client.db_url = test_db
    test_db_client.engine = create_engine(test_db)

    from sqlalchemy.orm import sessionmaker, scoped_session
    test_db_client.Session = scoped_session(sessionmaker(bind=test_db_client.engine))

    # Override the dependency
    app.dependency_overrides[get_db_client] = lambda: test_db_client
    task_queue = MagicMock()

    def submit_process_video(
        *,
        video_url,
        user_id,
        guest_id,
        output_intent=None,
        is_demo=False,
        publish_on_complete=False,
    ):
        if guest_id and test_db_client.get_task_count(guest_id) >= 1:
            raise GuestQuotaExceededError("Guest quota exceeded")
        task = test_db_client.create_task(
            user_id=user_id,
            video_url=video_url,
            is_demo=is_demo,
            publish_on_complete=publish_on_complete,
        )
        task_id = str(task["id"])
        for kind in ("script", "summary"):
            test_db_client.create_task_output(task_id, user_id, kind=kind)
        if guest_id:
            test_db_client.track_guest_trial(guest_id)
        return TaskSubmission(
            task_id=task_id,
            resolution="created",
            message_id=1,
        )

    task_queue.submit_process_video.side_effect = submit_process_video
    task_queue.submit_retry_output.return_value = 2
    app.dependency_overrides[get_task_queue] = lambda: task_queue

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    # Clean up
    app.dependency_overrides.pop(get_db_client, None)
    app.dependency_overrides.pop(get_task_queue, None)


# --- Shared API Fixtures (Task 1) ---

@pytest.fixture
def mock_db_client():
    return MagicMock()

@pytest.fixture
def mock_task_queue():
    queue = MagicMock()
    queue.submit_process_video.return_value = TaskSubmission(
        task_id="task_123",
        resolution="created",
        message_id=1,
    )
    queue.submit_retry_output.return_value = 2
    return queue

@pytest.fixture
def mock_user():
    return "test_user_id"

@pytest.fixture
def mock_video_processor():
    processor = MagicMock()
    processor.extract_info_only = AsyncMock(return_value={
        "title": "Test Video",
        "thumbnail": "http://thumb",
        "duration": 100,
        "author": "Test Author",
        "description": "Desc",
        "upload_date": "2023-01-01",
        "view_count": 100
    })
    return processor

@pytest.fixture
def mock_coinbase_client():
    client = MagicMock()
    # Mocking what test_payments_api expected
    client.charge.create.return_value.hosted_url = "http://cb.com/charge"
    client.charge.create.return_value.code = "CODE123"
    return client

@pytest.fixture
async def api_client(
    mock_db_client,
    mock_video_processor,
    mock_coinbase_client,
    mock_task_queue,
    mock_user,
):
    """
    Shared AsyncClient with commonly mocked dependencies.
    Replaces local 'client' fixture in API tests.
    """
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_client] = lambda: mock_db_client
    app.dependency_overrides[get_task_queue] = lambda: mock_task_queue
    app.dependency_overrides[get_video_processor] = lambda: mock_video_processor
    app.dependency_overrides[get_coinbase_client] = lambda: mock_coinbase_client
    app.dependency_overrides[get_current_user] = lambda: mock_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides = saved_overrides


def pytest_collection_modifyitems(config: pytest.Config, items: list) -> None:
    """Auto-mark tests and apply CI network-skip logic.

    Rules:
    - Files inside tests/integration/ → @pytest.mark.integration
    - Files whose name contains "manual" → @pytest.mark.integration
    - In CI, tests marked @pytest.mark.network are skipped unless RUN_NETWORK_TESTS=1
    """
    integration_mark = pytest.mark.integration
    for item in items:
        path_parts = Path(item.fspath).parts
        if "integration" in path_parts or "manual" in Path(item.fspath).stem:
            item.add_marker(integration_mark, append=False)

    # Keep CI deterministic: skip network tests by default in CI.
    # Set RUN_NETWORK_TESTS=1 to opt in.
    if not _is_truthy(os.getenv("RUN_NETWORK_TESTS")) and _is_truthy(os.getenv("CI")):
        skip_network = pytest.mark.skip(
            reason="Skipping network tests in CI. Set RUN_NETWORK_TESTS=1 to enable."
        )
        for item in items:
            if "network" in item.keywords:
                item.add_marker(skip_network)
