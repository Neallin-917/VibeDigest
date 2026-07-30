import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import scoped_session, sessionmaker

from db_client import DBClient
from services.task_queue import GuestQuotaExceededError, PostgresTaskQueue

pytestmark = [pytest.mark.integration, pytest.mark.pgmq]

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"
AUTH_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def pgmq_db() -> DBClient:
    database_url = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://postgres:password@localhost:15432/langgraph",
    )
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("select 1"))
    except OperationalError as exc:
        pytest.fail(f"PGMQ integration database is not reachable: {exc}")

    platform_sql = """
    create extension if not exists "uuid-ossp";
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text
    );
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
    end
    $$;
    create or replace function auth.uid()
    returns uuid language sql stable as $$
      select null::uuid
    $$;
    insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-000000000001', 'queue@example.com')
    on conflict (id) do nothing;
    """

    with engine.begin() as connection:
        connection.exec_driver_sql(platform_sql)
        raw_connection = connection.connection.driver_connection
        with raw_connection.cursor() as cursor:
            for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
                # Execute migration files through psycopg directly. SQLAlchemy's
                # exec_driver_sql passes an empty mapping to psycopg2, which
                # misinterprets literal "%" characters in PL/pgSQL RAISE and
                # format expressions as DBAPI placeholders.
                cursor.execute(migration.read_text())

    client = DBClient()
    client.db_url = database_url
    client.engine = engine
    client.Session = scoped_session(sessionmaker(bind=engine))
    return client


def _create_queue(db: DBClient, queue_name: str) -> None:
    db._execute_query(
        "select pgmq.create(:queue_name)",
        {"queue_name": queue_name},
    )


def test_atomic_submit_read_and_archive(pgmq_db: DBClient):
    queue_name = f"video_processing_test_{uuid4().hex[:12]}"
    _create_queue(pgmq_db, queue_name)
    queue = PostgresTaskQueue(pgmq_db, queue_name=queue_name)
    video_url = f"https://example.com/video/{uuid4()}"

    submission = queue.submit_process_video(
        video_url=video_url,
        user_id=AUTH_USER_ID,
        guest_id=None,
    )
    duplicate = queue.submit_process_video(
        video_url=video_url,
        user_id=AUTH_USER_ID,
        guest_id=None,
    )

    assert submission.resolution == "created"
    assert duplicate.resolution == "reused_inflight"
    assert duplicate.task_id == submission.task_id
    assert duplicate.message_id == submission.message_id

    task_rows = pgmq_db._execute_query(
        "select * from public.tasks where id = cast(:task_id as uuid)",
        {"task_id": submission.task_id},
    )
    output_rows = pgmq_db._execute_query(
        "select kind from public.task_outputs where task_id = cast(:task_id as uuid)",
        {"task_id": submission.task_id},
    )
    assert len(task_rows) == 1
    assert {row["kind"] for row in output_rows} == {
        "script",
        "summary",
        "comprehension_brief",
    }

    jobs = queue.read(
        visibility_timeout_seconds=30,
        max_poll_seconds=1,
    )
    assert len(jobs) == 1
    assert jobs[0].message == {
        "version": 1,
        "kind": "process_video",
        "job_id": jobs[0].job_id,
        "task_id": submission.task_id,
    }
    queue.archive(
        job_id=jobs[0].job_id,
        message_id=jobs[0].message_id,
        status="completed",
    )

    handoff = pgmq_db._execute_query(
        """
        select status
        from vibedigest_private.task_queue_handoffs
        where job_id = cast(:job_id as uuid)
        """,
        {"job_id": jobs[0].job_id},
    )
    assert handoff == [{"status": "completed"}]


def test_submission_rolls_back_when_queue_send_fails(pgmq_db: DBClient):
    queue = PostgresTaskQueue(
        pgmq_db,
        queue_name=f"missing_queue_{uuid4().hex[:12]}",
    )
    video_url = f"https://example.com/rollback/{uuid4()}"
    guest_id = f"guest-{uuid4()}"

    with pytest.raises(Exception):
        queue.submit_process_video(
            video_url=video_url,
            user_id=AUTH_USER_ID,
            guest_id=guest_id,
        )

    tasks = pgmq_db._execute_query(
        "select id from public.tasks where video_url = :video_url",
        {"video_url": video_url},
    )
    usage = pgmq_db._execute_query(
        "select usage_count from public.guest_usage where guest_id = :guest_id",
        {"guest_id": guest_id},
    )
    assert tasks == []
    assert usage == []


def test_guest_quota_is_enforced_inside_submission_transaction(pgmq_db: DBClient):
    queue_name = f"video_processing_quota_{uuid4().hex[:12]}"
    _create_queue(pgmq_db, queue_name)
    queue = PostgresTaskQueue(
        pgmq_db,
        queue_name=queue_name,
        guest_quota_limit=1,
    )
    guest_id = f"guest-{uuid4()}"

    queue.submit_process_video(
        video_url=f"https://example.com/first/{uuid4()}",
        user_id=AUTH_USER_ID,
        guest_id=guest_id,
    )

    with pytest.raises(GuestQuotaExceededError):
        queue.submit_process_video(
            video_url=f"https://example.com/second/{uuid4()}",
            user_id=AUTH_USER_ID,
            guest_id=guest_id,
        )

    usage = pgmq_db._execute_query(
        "select usage_count from public.guest_usage where guest_id = :guest_id",
        {"guest_id": guest_id},
    )
    assert usage == [{"usage_count": 1}]


def test_guest_quota_is_safe_under_concurrent_submissions(pgmq_db: DBClient):
    queue_name = f"video_processing_race_{uuid4().hex[:12]}"
    _create_queue(pgmq_db, queue_name)
    guest_id = f"guest-{uuid4()}"
    barrier = Barrier(2)

    def submit(video_suffix: str) -> str:
        queue = PostgresTaskQueue(
            pgmq_db,
            queue_name=queue_name,
            guest_quota_limit=1,
        )
        barrier.wait(timeout=5)
        try:
            queue.submit_process_video(
                video_url=f"https://example.com/concurrent/{video_suffix}",
                user_id=AUTH_USER_ID,
                guest_id=guest_id,
            )
        except GuestQuotaExceededError:
            return "rejected"
        return "created"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(submit, ("a", "b")))

    assert sorted(outcomes) == ["created", "rejected"]
    usage = pgmq_db._execute_query(
        "select usage_count from public.guest_usage where guest_id = :guest_id",
        {"guest_id": guest_id},
    )
    assert usage == [{"usage_count": 1}]
