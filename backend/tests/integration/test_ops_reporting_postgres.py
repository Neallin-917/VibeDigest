from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from services.ops_reporting import load_ops_daily_report


pytestmark = pytest.mark.integration

REAL_USER = "10000000-0000-0000-0000-000000000001"
INTERNAL_USER = "10000000-0000-0000-0000-000000000002"


def test_daily_report_executes_in_postgres_and_excludes_dirty_activity(test_db):
    engine = create_engine(test_db)
    project_root = Path(__file__).resolve().parents[3]
    migration = (
        project_root
        / "supabase"
        / "migrations"
        / "20260831120000_add_ops_reporting_exclusions.sql"
    ).read_text()

    setup_sql = f"""
    create schema if not exists vibedigest_private;
    create table if not exists vibedigest_private.agent_turns (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      error_code text,
      created_at timestamptz not null default now()
    );
    {migration}

    insert into auth.users(id, email, created_at) values
      ('{REAL_USER}', 'real@example.com', '2026-08-30 01:00:00+00'),
      ('{INTERNAL_USER}', 'internal@example.com', '2026-08-30 01:30:00+00');

    insert into vibedigest_private.ops_excluded_users(user_id, reason)
    values ('{INTERNAL_USER}', 'internal_acceptance');

    insert into public.tasks(
      user_id, guest_id, video_url, status, created_at, updated_at,
      workload_kind, is_demo, is_deleted
    ) values
      ('{REAL_USER}', null, 'https://example.com/real', 'completed',
       '2026-08-30 02:00:00+00', '2026-08-30 02:10:00+00',
       'user_submission', false, false),
      ('{INTERNAL_USER}', null, 'https://example.com/internal', 'completed',
       '2026-08-30 02:00:00+00', '2026-08-30 02:05:00+00',
       'user_submission', false, false),
      ('00000000-0000-0000-0000-000000000001', 'browser-guest',
       'https://example.com/guest', 'completed', '2026-08-30 02:00:00+00',
       '2026-08-30 02:05:00+00', 'user_submission', false, false);

    insert into vibedigest_private.agent_turns(user_id, created_at) values
      ('{REAL_USER}', '2026-08-30 03:00:00+00'),
      ('{INTERNAL_USER}', '2026-08-30 03:00:00+00');

    insert into public.payment_orders(
      user_id, provider, amount_fiat, status, created_at, updated_at
    ) values
      ('{REAL_USER}', 'creem', 9.90, 'completed',
       '2026-08-30 04:00:00+00', '2026-08-30 04:10:00+00'),
      ('{INTERNAL_USER}', 'creem', 99.00, 'completed',
       '2026-08-30 04:00:00+00', '2026-08-30 04:10:00+00');
    """

    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(setup_sql)

        report = load_ops_daily_report(engine, date(2026, 8, 30))

        assert report.current.total_registered_users == 1
        assert report.current.new_registered_users == 1
        assert report.current.active_users == 1
        assert report.current.agent_turns == 1
        assert report.current.tasks_created == 1
        assert report.current.tasks_completed == 1
        assert report.current.payment_orders_completed == 1
        assert report.current.checkout_volume_usd == 9.9
        assert report.snapshot["excluded_user_tasks_on_report_date"] == 1
        assert report.snapshot["structurally_excluded_tasks_on_report_date"] == 1
    finally:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                f"""
                delete from public.payment_orders
                where user_id in ('{REAL_USER}', '{INTERNAL_USER}');
                delete from public.tasks
                where user_id in ('{REAL_USER}', '{INTERNAL_USER}')
                   or guest_id = 'browser-guest';
                delete from auth.users where id in ('{REAL_USER}', '{INTERNAL_USER}');
                """
            )
        engine.dispose()
