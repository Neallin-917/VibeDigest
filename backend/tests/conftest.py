import os
import sys
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import MagicMock, AsyncMock, patch

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

from main import app
from db_client import DBClient
from dependencies import get_db_client, get_current_user, get_video_processor, get_coinbase_client
from sqlalchemy import create_engine, text


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
    Apply schema to the test DB and return a connected engine or URL.
    """
    db_url = postgres_container
    engine = create_engine(db_url)
    
    # 1. Read Schema
    # Use path relative to this file (backend/tests/conftest.py)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    schema_path = os.path.join(base_dir, "sql", "full_schema_dump.txt")
    if not os.path.exists(schema_path):
        # Fallback or error
        raise FileNotFoundError(f"Schema dump not found at {schema_path}")
        
    with open(schema_path, "r") as f:
        schema_sql = f.read()
        
    # 2. Apply Schema
    # We need to handle 'auth.users' dependency since we don't have Supabase Auth in container.
    # So we must create a fake auth schema and users table first.
    pre_setup_sql = """
    DROP TABLE IF EXISTS public.task_outputs CASCADE;
    DROP TABLE IF EXISTS public.tasks CASCADE;
    DROP TABLE IF EXISTS auth.users CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        created_at timestamptz DEFAULT now()
    );
    -- Mock extensions if needed
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    
    -- Mock Supabase Roles
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
    
    -- Mock Supabase auth functions used in Policies
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      -- Return the generic test user ID or null
      SELECT '00000000-0000-0000-0000-000000000001'::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
      SELECT 'authenticated';
    $$ LANGUAGE sql STABLE;
    
    -- Create missing tables that policies depend on
    CREATE TABLE IF NOT EXISTS public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        tier text DEFAULT 'free',
        credits_total integer DEFAULT 30,
        credits_used integer DEFAULT 0,
        usage_limit integer DEFAULT 100,
        usage_count integer DEFAULT 0,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tasks (
        id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id uuid REFERENCES auth.users(id),
        guest_id text, -- Added for anonymous tracking
        video_url text,
        status text DEFAULT 'pending',
        progress integer DEFAULT 0,
        video_title text,
        thumbnail_url text,
        error_message text,
        author text,
        author_url text,
        author_image_url text,
        description text,
        keywords text[],
        view_count bigint,
        upload_date timestamptz,
        duration integer,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        is_demo boolean DEFAULT false,
        summary_language text
    );

    CREATE TABLE IF NOT EXISTS public.task_outputs (
        id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users(id),
        kind text,
        locale text,
        status text DEFAULT 'pending',
        progress integer DEFAULT 0,
        content jsonb,
        error_message text,
        attempt integer DEFAULT 0,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.guest_usage (
        guest_id text PRIMARY KEY,
        usage_count integer DEFAULT 0,
        updated_at timestamptz DEFAULT now()
    );

    -- Insert Demo Task to satisfy Foreign Keys in schema dump
    -- But first, ensure the user exists!
    INSERT INTO auth.users (id, email)
    VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, tier, usage_limit, usage_count)
    VALUES ('00000000-0000-0000-0000-000000000001', 'free', 100, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.tasks (id, user_id, video_url, video_title, is_demo)
    VALUES (
        '1e60a06c-ef37-4f82-bffd-1a5135cb45c7',
        '00000000-0000-0000-0000-000000000001', 
        'https://example.com/demo.mp4',
        'Demo Task',
        true
    ) ON CONFLICT (id) DO NOTHING;
    """
    
    print("DEBUG: Connecting to DB...")
    with engine.connect() as conn:
        print("DEBUG: Applying pre-setup SQL...")
        conn.execute(text(pre_setup_sql))
        conn.commit()
        
        try:
             print("DEBUG: Applying Full Schema...")
             # text() with multiple statements works if the driver allows it. 
             # psycopg2 usually needs autocommit or special handling, but execute() often works unless it's huge.
             conn.execute(text(schema_sql))
             conn.commit()
             print("DEBUG: Schema Applied!")
        except Exception as e:
             print(f"DEBUG: Schema application warning/error: {e}")

    print("DEBUG: test_db fixture done.")
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    # Clean up
    app.dependency_overrides.pop(get_db_client, None)


# --- Shared API Fixtures (Task 1) ---

@pytest.fixture
def mock_db_client():
    return MagicMock()

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
async def api_client(mock_db_client, mock_video_processor, mock_coinbase_client, mock_user):
    """
    Shared AsyncClient with commonly mocked dependencies.
    Replaces local 'client' fixture in API tests.
    """
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db_client] = lambda: mock_db_client
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