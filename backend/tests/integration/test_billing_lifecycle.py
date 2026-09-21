"""Billing entitlement and quota regressions against isolated Postgres/PGMQ."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from services.task_queue import PostgresTaskQueue
from tests.integration.test_pgmq_queue import pgmq_db as _pgmq_db

pgmq_db = _pgmq_db
pytestmark = [pytest.mark.integration, pytest.mark.pgmq]


def _account(db):
    user_id = str(uuid4())
    customer_id = f"billing_{uuid4().hex}"
    db._execute_query(
        "INSERT INTO auth.users(id) VALUES (CAST(:id AS uuid))", {"id": user_id}
    )
    db._execute_query(
        """INSERT INTO profiles(id, creem_customer_id, extra_credits)
           VALUES (CAST(:id AS uuid), :customer, 7)
           ON CONFLICT (id) DO UPDATE SET creem_customer_id = :customer, extra_credits = 7""",
        {"id": user_id, "customer": customer_id},
    )
    return user_id, customer_id


def _profile(db, user_id):
    return db._execute_query(
        "SELECT * FROM profiles WHERE id = CAST(:id AS uuid)", {"id": user_id}
    )[0]


def _submit(db, user_id):
    submission = PostgresTaskQueue(db).submit_process_video(
        video_url=f"https://example.com/billing/{uuid4()}",
        user_id=user_id,
        guest_id=None,
    )
    assert submission.resolution == "created"
    assert submission.message_id is not None


def _future(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def test_initial_upgrade_resets_basic_usage_and_keeps_topups(pgmq_db):
    user, _ = _account(pgmq_db)
    pgmq_db._execute_query(
        "UPDATE profiles SET usage_count = 3 WHERE id = CAST(:id AS uuid)", {"id": user}
    )
    pgmq_db.update_subscription_by_user(user, "pro", _future(365), billing_interval="annual")
    profile = _profile(pgmq_db, user)
    assert profile["tier"] == "pro"
    assert profile["usage_limit"] == 100
    assert profile["usage_count"] == 0
    assert profile["extra_credits"] == 7
    assert profile["billing_interval"] == "annual"
    assert profile["cancel_at_period_end"] is False


@pytest.mark.parametrize("interval,days", [("monthly", 30), ("annual", 365)])
@pytest.mark.parametrize("months_overdue", [0, 4])
def test_pro_calendar_month_refresh_precedes_topup_consumption(
    pgmq_db, interval, days, months_overdue
):
    user, _ = _account(pgmq_db)
    pgmq_db.update_subscription_by_user(user, "pro", _future(days), billing_interval=interval)
    pgmq_db._execute_query(
        """UPDATE profiles SET usage_count = usage_limit,
           usage_reset_at = now() - make_interval(months => :months) - interval '1 second'
           WHERE id = CAST(:id AS uuid)""",
        {"id": user, "months": months_overdue},
    )
    before = _profile(pgmq_db, user)
    _submit(pgmq_db, user)
    after = _profile(pgmq_db, user)
    expected_reset = pgmq_db._execute_query(
        """SELECT (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month')
            AT TIME ZONE 'utc' AS reset_at"""
    )[0]["reset_at"]
    assert after["usage_count"] == 1
    assert after["extra_credits"] == before["extra_credits"] == 7
    assert after["usage_reset_at"] == expected_reset
    assert after["period_end"] == before["period_end"]
    assert after["tier"] == "pro"
    assert after["usage_limit"] == 100
    _submit(pgmq_db, user)
    second = _profile(pgmq_db, user)
    assert second["usage_count"] == 2
    assert second["usage_limit"] == 100
    assert second["usage_reset_at"] == expected_reset
    assert second["extra_credits"] == 7


def test_checkout_paid_retries_and_cancellation_preserve_usage(pgmq_db):
    user, customer = _account(pgmq_db)
    period_end = _future(365)
    pgmq_db.update_subscription_by_user(user, "pro", period_end, billing_interval="annual")
    _submit(pgmq_db, user)
    before = _profile(pgmq_db, user)
    pgmq_db.update_subscription(customer, "pro", period_end)
    pgmq_db.update_subscription_by_user(user, "pro", period_end, billing_interval="annual")
    pgmq_db.update_subscription(customer, "pro", period_end, canceled=True)
    pgmq_db.update_subscription(customer, "pro", period_end)
    after = _profile(pgmq_db, user)
    for key in ("usage_count", "usage_reset_at", "usage_limit", "extra_credits", "period_end"):
        assert after[key] == before[key]
    assert after["cancel_at_period_end"] is True
    assert after["tier"] == "pro"


@pytest.mark.parametrize("paid_via", ["customer", "checkout"])
def test_same_month_reactivation_of_expired_pro_resets_usage_once(pgmq_db, paid_via):
    user, customer = _account(pgmq_db)
    pgmq_db.update_subscription_by_user(user, "pro", _future(30))
    pgmq_db._execute_query(
        """UPDATE profiles SET usage_count = usage_limit,
           period_end = now() - interval '1 second',
           usage_reset_at = (date_trunc('month', now() AT TIME ZONE 'utc')
               + interval '1 month') AT TIME ZONE 'utc'
           WHERE id = CAST(:id AS uuid)""",
        {"id": user},
    )
    before = _profile(pgmq_db, user)
    assert before["tier"] == "pro"
    assert before["usage_count"] == before["usage_limit"] == 100
    period_end = _future(30)
    if paid_via == "customer":
        pgmq_db.update_subscription(customer, "pro", period_end)
    else:
        pgmq_db.update_subscription_by_user(user, "pro", period_end)
    reactivated = _profile(pgmq_db, user)
    assert reactivated["usage_count"] == 0
    assert reactivated["extra_credits"] == 7
    assert reactivated["usage_reset_at"] == before["usage_reset_at"]
    assert reactivated["period_end"] == datetime.fromisoformat(period_end)

    _submit(pgmq_db, user)
    pgmq_db.update_subscription(customer, "pro", period_end)
    pgmq_db.update_subscription_by_user(user, "pro", period_end)
    retried = _profile(pgmq_db, user)
    assert retried["usage_count"] == 1
    assert retried["extra_credits"] == 7
    assert retried["usage_reset_at"] == reactivated["usage_reset_at"]


@pytest.mark.parametrize("prior_state", ["unknown_customer", "free", "unknown_period", "older_period"])
def test_cancellation_before_paid_is_retryable_and_applied_after_payment(pgmq_db, prior_state):
    user, customer = _account(pgmq_db)
    if prior_state == "unknown_customer":
        pgmq_db._execute_query(
            "UPDATE profiles SET creem_customer_id = NULL WHERE id = CAST(:id AS uuid)",
            {"id": user},
        )
    elif prior_state in ("unknown_period", "older_period"):
        pgmq_db.update_subscription_by_user(user, "pro", _future(30))
        if prior_state == "unknown_period":
            pgmq_db._execute_query(
                "UPDATE profiles SET period_end = NULL WHERE id = CAST(:id AS uuid)",
                {"id": user},
            )
    before = _profile(pgmq_db, user)
    period_end = _future(60)
    with pytest.raises(RuntimeError):
        pgmq_db.update_subscription(customer, "pro", period_end, canceled=True)
    assert _profile(pgmq_db, user) == before

    if prior_state == "unknown_customer":
        pgmq_db._execute_query(
            "UPDATE profiles SET creem_customer_id = :customer WHERE id = CAST(:id AS uuid)",
            {"id": user, "customer": customer},
        )
    pgmq_db.update_subscription(customer, "pro", period_end)
    paid = _profile(pgmq_db, user)
    pgmq_db.update_subscription(customer, "pro", period_end, canceled=True)
    canceled = _profile(pgmq_db, user)
    assert canceled["cancel_at_period_end"] is True
    for key in ("tier", "period_end", "usage_count", "usage_reset_at", "extra_credits"):
        assert canceled[key] == paid[key]


def test_renewal_preserves_month_usage_and_ignores_old_paid_or_cancel_event(pgmq_db):
    user, customer = _account(pgmq_db)
    old_period, new_period = _future(30), _future(60)
    pgmq_db.update_subscription_by_user(user, "pro", old_period, billing_interval="monthly")
    _submit(pgmq_db, user)
    pgmq_db.update_subscription(customer, "pro", old_period, canceled=True)
    before = _profile(pgmq_db, user)
    pgmq_db.update_subscription(customer, "pro", new_period)
    pgmq_db.update_subscription(customer, "pro", old_period)
    pgmq_db.update_subscription(customer, "pro", old_period, canceled=True)
    after = _profile(pgmq_db, user)
    assert after["period_end"] == datetime.fromisoformat(new_period)
    assert after["cancel_at_period_end"] is False
    for key in ("usage_count", "usage_reset_at", "extra_credits"):
        assert after[key] == before[key]


def test_expired_pro_downgrades_on_canonical_submission(pgmq_db):
    user, customer = _account(pgmq_db)
    pgmq_db.update_subscription_by_user(user, "pro", _future(30))
    pgmq_db._execute_query(
        """UPDATE profiles SET usage_count = 100, period_end = now() - interval '1 second'
           WHERE id = CAST(:id AS uuid)""", {"id": user}
    )
    expired_period = _profile(pgmq_db, user)["period_end"].isoformat()
    _submit(pgmq_db, user)
    pgmq_db.update_subscription(customer, "pro", expired_period)
    profile = _profile(pgmq_db, user)
    assert profile["tier"] == "free"
    assert profile["usage_limit"] == 3
    assert profile["usage_count"] == 1
    assert profile["extra_credits"] == 7


def test_browser_roles_cannot_write_paid_entitlements(pgmq_db):
    policies = pgmq_db._execute_query(
        "SELECT cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'"
    )
    assert policies
    assert all(row["cmd"] == "SELECT" for row in policies)
    for role in ("anon", "authenticated"):
        for privilege in ("INSERT", "UPDATE", "DELETE"):
            result = pgmq_db._execute_query(
                "SELECT has_table_privilege(:role, 'public.profiles', :privilege) AS allowed",
                {"role": role, "privilege": privilege},
            )
            assert result == [{"allowed": False}], (role, privilege)
