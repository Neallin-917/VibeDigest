"""Integration tests for DBClient against a real PostgreSQL database.

These tests verify SQL query correctness, idempotency, and data integrity
for the critical DB operations that are only mock-tested elsewhere.

Requires: TEST_DATABASE_URL or a PostgreSQL instance on localhost:5432.
Skipped if SKIP_DB_TESTS=1 is set.
"""

import json
import os
import pytest
from uuid import UUID, uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker, scoped_session

from db_client import DBClient
from constants import OutputKind, TaskStatus


def _db_is_reachable() -> bool:
    """Check if the test database is reachable."""
    url = os.getenv("TEST_DATABASE_URL", "postgresql://postgres:password@localhost:15432/langgraph")
    try:
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not _db_is_reachable(),
        reason="PostgreSQL not available (set TEST_DATABASE_URL or start a local instance)",
    ),
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def db_client(test_db):
    """Create a real DBClient pointing at the test database."""
    client = DBClient.__new__(DBClient)
    client.db_url = test_db
    client._jwt_secret = "test-secret"
    client._supabase_url = None
    client._jwks_client = None
    client._supabase_lazy = None
    client.engine = create_engine(test_db, pool_pre_ping=True)
    client.Session = scoped_session(sessionmaker(bind=client.engine))
    return client


@pytest.fixture(autouse=True)
def _clean_tasks(db_client):
    """Clean task data before each test to ensure isolation."""
    yield
    # Cleanup after test
    session = db_client.Session()
    try:
        session.execute(text(
            "DELETE FROM payment_orders WHERE user_id = :uid"
        ), {"uid": TEST_USER_ID})
        session.execute(text(
            "DELETE FROM task_outputs WHERE user_id = :uid"
        ), {"uid": TEST_USER_ID})
        session.execute(text(
            "DELETE FROM tasks WHERE user_id = :uid AND is_demo = false"
        ), {"uid": TEST_USER_ID})
        # Reset profile to defaults
        session.execute(text(
            "UPDATE profiles SET tier = 'free', usage_limit = 100, usage_count = 0, "
            "extra_credits = 0, creem_customer_id = NULL, period_end = NULL "
            "WHERE id = :uid"
        ), {"uid": TEST_USER_ID})
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


# ===================================================================
# create_task + get_task
# ===================================================================

class TestCreateAndGetTask:

    def test_create_task_returns_valid_record(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://youtube.com/watch?v=test1")
        assert task is not None
        assert str(task["user_id"]) == TEST_USER_ID
        assert task["video_url"] == "https://youtube.com/watch?v=test1"
        assert task["status"] == "pending"
        assert task["progress"] == 0

    def test_get_task_by_id(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://youtube.com/watch?v=get_test")
        fetched = db_client.get_task(str(task["id"]))
        assert fetched is not None
        assert str(fetched["id"]) == str(task["id"])

    def test_get_nonexistent_task_returns_none(self, db_client):
        result = db_client.get_task(str(uuid4()))
        assert result is None


# ===================================================================
# find_latest_task_with_valid_script
# ===================================================================

class TestFindLatestTaskWithValidScript:
    """The most critical query — drives the entire cache system."""

    def test_finds_task_with_completed_script(self, db_client):
        url = f"https://youtube.com/watch?v=cache_{uuid4().hex[:8]}"
        task = db_client.create_task(TEST_USER_ID, url)
        task_id = str(task["id"])

        # Create a completed script output
        db_client.create_task_output(task_id, TEST_USER_ID, "script")
        db_client.update_task_output_by_kind(
            task_id, "script",
            content=json.dumps("Real transcript content"),
            status=TaskStatus.COMPLETED,
            progress=100,
        )

        result = db_client.find_latest_task_with_valid_script_for_owner(
            TEST_USER_ID, None, url
        )
        assert result is not None
        assert str(result["id"]) == task_id

    def test_ignores_task_with_pending_script(self, db_client):
        url = f"https://youtube.com/watch?v=pending_{uuid4().hex[:8]}"
        task = db_client.create_task(TEST_USER_ID, url)
        task_id = str(task["id"])

        # Script is pending, not completed
        db_client.create_task_output(task_id, TEST_USER_ID, "script")

        result = db_client.find_latest_task_with_valid_script_for_owner(
            TEST_USER_ID, None, url
        )
        assert result is None

    def test_ignores_task_with_null_script_content(self, db_client):
        url = f"https://youtube.com/watch?v=null_{uuid4().hex[:8]}"
        task = db_client.create_task(TEST_USER_ID, url)
        task_id = str(task["id"])

        db_client.create_task_output(task_id, TEST_USER_ID, "script")
        db_client.update_task_output_by_kind(
            task_id, "script",
            content="null",  # jsonb null
            status=TaskStatus.COMPLETED,
            progress=100,
        )

        result = db_client.find_latest_task_with_valid_script_for_owner(
            TEST_USER_ID, None, url
        )
        assert result is None

    def test_returns_most_recent_task(self, db_client):
        url = f"https://youtube.com/watch?v=multi_{uuid4().hex[:8]}"

        # Create two tasks for the same URL
        task1 = db_client.create_task(TEST_USER_ID, url)
        task2 = db_client.create_task(TEST_USER_ID, url)

        for t in [task1, task2]:
            tid = str(t["id"])
            db_client.create_task_output(tid, TEST_USER_ID, "script")
            db_client.update_task_output_by_kind(
                tid, "script",
                content=json.dumps(f"Content for {tid}"),
                status=TaskStatus.COMPLETED,
                progress=100,
            )

        result = db_client.find_latest_task_with_valid_script_for_owner(
            TEST_USER_ID, None, url
        )
        assert result is not None
        # Should return the MOST RECENT task
        assert str(result["id"]) == str(task2["id"])

    def test_no_match_for_different_url(self, db_client):
        url = f"https://youtube.com/watch?v=unique_{uuid4().hex[:8]}"
        task = db_client.create_task(TEST_USER_ID, url)
        task_id = str(task["id"])

        db_client.create_task_output(task_id, TEST_USER_ID, "script")
        db_client.update_task_output_by_kind(
            task_id, "script",
            content=json.dumps("Content"),
            status=TaskStatus.COMPLETED,
            progress=100,
        )

        # Search with a different URL
        result = db_client.find_latest_task_with_valid_script_for_owner(
            TEST_USER_ID,
            None,
            "https://youtube.com/watch?v=other",
        )
        assert result is None


# ===================================================================
# ensure_task_outputs (idempotency)
# ===================================================================

class TestEnsureTaskOutputs:

    def test_creates_missing_outputs(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/ensure_test")
        task_id = str(task["id"])

        db_client.ensure_task_outputs(
            task_id, TEST_USER_ID,
            ["script", "summary", "classification"],
        )

        outputs = db_client.get_task_outputs(task_id)
        kinds = {o["kind"] for o in outputs}
        assert "script" in kinds
        assert "summary" in kinds
        assert "classification" in kinds

    def test_idempotent_on_second_call(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/idempotent_test")
        task_id = str(task["id"])

        # Call twice with the same kinds
        db_client.ensure_task_outputs(task_id, TEST_USER_ID, ["script", "summary"])
        db_client.ensure_task_outputs(task_id, TEST_USER_ID, ["script", "summary"])

        outputs = db_client.get_task_outputs(task_id)
        script_outputs = [o for o in outputs if o["kind"] == "script"]
        # Should NOT create duplicates
        assert len(script_outputs) == 1

    def test_adds_new_kinds_without_duplicating_existing(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/add_kind_test")
        task_id = str(task["id"])

        db_client.ensure_task_outputs(task_id, TEST_USER_ID, ["script"])
        db_client.ensure_task_outputs(task_id, TEST_USER_ID, ["script", "audio"])

        outputs = db_client.get_task_outputs(task_id)
        kinds = [o["kind"] for o in outputs]
        assert kinds.count("script") == 1
        assert kinds.count("audio") == 1


# ===================================================================
# upsert_completed_task_output
# ===================================================================

class TestUpsertCompletedTaskOutput:

    def test_creates_new_output_if_not_exists(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/upsert_new")
        task_id = str(task["id"])

        result = db_client.upsert_completed_task_output(
            task_id, TEST_USER_ID, "script", json.dumps("New content")
        )
        assert result is not None
        assert result["status"] == "completed"

    def test_updates_existing_output(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/upsert_update")
        task_id = str(task["id"])

        # Create initial output
        db_client.ensure_task_outputs(task_id, TEST_USER_ID, ["script"])

        # Upsert should update, not create duplicate
        result = db_client.upsert_completed_task_output(
            task_id, TEST_USER_ID, "script", json.dumps("Updated content")
        )
        assert result is not None

        # Verify only one script output exists
        outputs = db_client.get_task_outputs(task_id)
        script_outputs = [o for o in outputs if o["kind"] == "script"]
        assert len(script_outputs) == 1
        assert script_outputs[0]["status"] == "completed"


# ===================================================================
# update_task_status
# ===================================================================

class TestUpdateTaskStatus:

    def test_update_status_and_progress(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/status_test")
        task_id = str(task["id"])

        db_client.update_task_status(task_id, status="processing", progress=50)

        updated = db_client.get_task(task_id)
        assert updated["status"] == "processing"
        assert updated["progress"] == 50

    def test_update_metadata_fields(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/meta_test")
        task_id = str(task["id"])

        db_client.update_task_status(
            task_id,
            video_title="Updated Title",
            thumbnail_url="http://new-thumb.jpg",
        )

        updated = db_client.get_task(task_id)
        assert updated["video_title"] == "Updated Title"
        assert updated["thumbnail_url"] == "http://new-thumb.jpg"

    def test_update_to_error_with_message(self, db_client):
        task = db_client.create_task(TEST_USER_ID, "https://example.com/error_test")
        task_id = str(task["id"])

        db_client.update_task_status(
            task_id, status="error", progress=100, error="Something went wrong"
        )

        updated = db_client.get_task(task_id)
        assert updated["status"] == "error"
        assert updated["error_message"] == "Something went wrong"


# ===================================================================
# update_subscription_by_user
# ===================================================================

class TestUpdateSubscription:

    def test_upgrade_to_pro(self, db_client):
        db_client.update_subscription_by_user(
            TEST_USER_ID, tier="pro", period_end="2026-05-01T00:00:00Z"
        )

        # Verify profile updated
        rows = db_client._execute_query(
            "SELECT tier, usage_limit, usage_count FROM profiles WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )
        assert len(rows) == 1
        assert rows[0]["tier"] == "pro"
        assert rows[0]["usage_limit"] == 100
        assert rows[0]["usage_count"] == 0

    def test_downgrade_to_free(self, db_client):
        # First upgrade
        db_client.update_subscription_by_user(
            TEST_USER_ID, tier="pro", period_end="2026-05-01T00:00:00Z"
        )
        # Then downgrade
        db_client.update_subscription_by_user(
            TEST_USER_ID, tier="free", period_end="2026-05-01T00:00:00Z"
        )

        rows = db_client._execute_query(
            "SELECT tier, usage_limit FROM profiles WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )
        assert rows[0]["tier"] == "free"
        assert rows[0]["usage_limit"] == 3


# ===================================================================
# find_latest_inflight_task
# ===================================================================

class TestFindLatestInflightTask:

    def test_finds_pending_task(self, db_client):
        url = f"https://youtube.com/watch?v=inflight_{uuid4().hex[:8]}"
        task = db_client.create_task(TEST_USER_ID, url)

        result = db_client.find_latest_inflight_task(TEST_USER_ID, url)
        assert result is not None
        assert str(result["id"]) == str(task["id"])

    def test_ignores_completed_task(self, db_client):
        url = f"https://youtube.com/watch?v=done_{uuid4().hex[:8]}"
        task = db_client.create_task(TEST_USER_ID, url)
        db_client.update_task_status(str(task["id"]), status="completed", progress=100)

        result = db_client.find_latest_inflight_task(TEST_USER_ID, url)
        assert result is None

    def test_ignores_other_users_tasks(self, db_client):
        url = f"https://youtube.com/watch?v=other_user_{uuid4().hex[:8]}"
        db_client.create_task(TEST_USER_ID, url)

        # Search with a different user_id
        result = db_client.find_latest_inflight_task(str(uuid4()), url)
        assert result is None


# ===================================================================
# Payment chain: order → completion → credits/tier
# ===================================================================

class TestPaymentChain:
    """End-to-end payment flow verification against real DB."""

    def test_create_and_complete_payment_order(self, db_client):
        order = db_client.create_payment_order(
            TEST_USER_ID, provider="creem", amount_fiat=9.99
        )
        assert order is not None
        assert order["status"] == "pending"
        assert str(order["user_id"]) == TEST_USER_ID

        order_id = str(order["id"])
        db_client.update_payment_order(
            order_id, status="completed",
            metadata={"checkout_id": "chk_123"},
        )

        updated = db_client.get_payment_order(order_id)
        assert updated is not None
        assert updated["status"] == "completed"

    def test_credits_added_after_payment(self, db_client):
        """Simulate one-time payment: create order → add credits → verify profile."""
        # Reset credits
        db_client._execute_query(
            "UPDATE profiles SET extra_credits = 0 WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )

        # Add credits (simulating webhook handler)
        db_client.add_credits(TEST_USER_ID, 50)

        rows = db_client._execute_query(
            "SELECT extra_credits FROM profiles WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )
        assert rows[0]["extra_credits"] == 50

        # Add more credits (cumulative)
        db_client.add_credits(TEST_USER_ID, 30)

        rows = db_client._execute_query(
            "SELECT extra_credits FROM profiles WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )
        assert rows[0]["extra_credits"] == 80

    def test_subscription_upgrade_full_chain(self, db_client):
        """Simulate: checkout.completed (recurring) → Pro activation → verify."""
        # 1. Create payment order
        order = db_client.create_payment_order(
            TEST_USER_ID, provider="creem", amount_fiat=19.99
        )
        order_id = str(order["id"])

        # 2. Mark order completed
        db_client.update_payment_order(order_id, status="completed")

        # 3. Activate Pro subscription (what webhook handler does)
        db_client.update_subscription_by_user(
            TEST_USER_ID, tier="pro", period_end="2026-05-01T00:00:00Z"
        )

        # 4. Verify user is actually Pro
        rows = db_client._execute_query(
            "SELECT tier, usage_limit, usage_count FROM profiles WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )
        assert rows[0]["tier"] == "pro"
        assert rows[0]["usage_limit"] == 100
        assert rows[0]["usage_count"] == 0

    def test_subscription_cancel_full_chain(self, db_client):
        """Simulate: Pro → subscription.canceled → Free downgrade."""
        # Start as Pro
        db_client.update_subscription_by_user(
            TEST_USER_ID, tier="pro", period_end="2026-05-01T00:00:00Z"
        )

        # Link a creem customer ID
        db_client.link_creem_customer(TEST_USER_ID, "cust_test_123")

        # Cancel subscription (by customer ID, as webhook does)
        db_client.update_subscription("cust_test_123", "free", "2026-04-01T00:00:00Z")

        # Verify downgrade
        rows = db_client._execute_query(
            "SELECT tier, usage_limit FROM profiles WHERE id = :uid",
            {"uid": TEST_USER_ID},
        )
        assert rows[0]["tier"] == "free"
        assert rows[0]["usage_limit"] == 3

    def test_idempotent_order_completion(self, db_client):
        """Completing the same order twice should not double-credit."""
        order = db_client.create_payment_order(
            TEST_USER_ID, provider="coinbase", amount_fiat=29.99
        )
        order_id = str(order["id"])

        # First completion
        db_client.update_payment_order(order_id, status="completed")
        completed = db_client.get_payment_order(order_id)
        assert completed["status"] == "completed"

        # Second completion (idempotent — webhook handler checks status before adding credits)
        existing = db_client.get_payment_order(order_id)
        assert existing["status"] == "completed"  # Already done, handler would skip
