import json
import ssl
from datetime import date, datetime, timedelta, timezone

import pytest
import services.ops_reporting as ops_reporting

from services.ops_reporting import (
    DAILY_METRICS_SQL,
    DailyMetrics,
    OpsDailyReport,
    default_report_date,
    load_ops_daily_report,
    render_html,
    write_report,
)


def test_reporting_engine_matches_supabase_pooler_tls_policy(monkeypatch):
    captured = {}

    def fake_create_engine(url, **kwargs):
        captured.update(url=url, **kwargs)
        return object()

    monkeypatch.setattr(ops_reporting, "create_engine", fake_create_engine)

    result = ops_reporting.create_reporting_engine(
        "postgresql+pg8000://user:password@example.pooler.supabase.com/postgres"
    )

    context = captured["connect_args"]["ssl_context"]
    assert result is not None
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED


def _metrics(report_date: date, **overrides) -> DailyMetrics:
    values = {
        "report_date": report_date,
        "total_registered_users": 120,
        "new_registered_users": 12,
        "activation_cohort_date": report_date.replace(day=report_date.day - 1),
        "activation_cohort_users": 10,
        "activated_24h_users": 4,
        "active_users": 18,
        "agent_turns": 40,
        "quota_exceeded_users": 3,
        "tasks_created": 31,
        "users_created_tasks": 15,
        "tasks_completed": 28,
        "tasks_failed": 2,
        "tasks_open": 1,
        "completion_seconds_p50": 372.0,
        "completion_seconds_p90": 840.0,
        "payment_orders_created": 2,
        "payment_orders_completed": 1,
        "checkout_volume_usd": 9.9,
    }
    values.update(overrides)
    return DailyMetrics(**values)


def test_metric_rates_use_mature_cohort_and_terminal_tasks():
    metrics = _metrics(date(2026, 8, 30))

    assert metrics.activation_rate == 0.4
    assert metrics.task_terminal_success_rate == 28 / 30


def test_metric_rates_are_unknown_without_denominators():
    metrics = _metrics(
        date(2026, 8, 30),
        activation_cohort_users=0,
        activated_24h_users=0,
        tasks_completed=0,
        tasks_failed=0,
    )

    assert metrics.activation_rate is None
    assert metrics.task_terminal_success_rate is None


def test_render_html_documents_exclusions_and_payment_limitations():
    current = _metrics(date(2026, 8, 30))
    previous = _metrics(date(2026, 8, 29), new_registered_users=6)
    report = OpsDailyReport(
        current=current,
        previous=previous,
        trailing_seven_day_average={
            "new_registered_users": 8.0,
            "active_users": 14.0,
            "agent_turns": 35.0,
            "tasks_created": 24.0,
            "tasks_completed": 21.0,
            "tasks_failed": 1.0,
            "payment_orders_created": 1.0,
            "payment_orders_completed": 0.5,
            "checkout_volume_usd": 4.95,
        },
        snapshot={
            "explicit_excluded_users": 3,
            "automatic_excluded_service_users": 1,
            "excluded_user_tasks_on_report_date": 7,
            "structurally_excluded_tasks_on_report_date": 9,
            "active_pro_users_now": 5,
            "open_user_tasks_now": 2,
            "users_missing_profiles": 0,
            "completed_orders_missing_fiat_amount": 0,
            "latest_user_task_at": "2026-08-30T22:00:00+00:00",
            "generated_at": "2026-08-31T01:00:00+00:00",
        },
        timezone="Asia/Shanghai",
    )

    html = render_html(report)

    assert "VibeDigest 运营日报" in html
    assert "显式排除账号：3 个" in html
    assert "访客任务、目录供给、Demo、软删除任务" in html
    assert "不含续费和退款" in html
    assert "24h 激活率" in html


def test_default_report_date_is_previous_local_day():
    now = datetime(2026, 8, 31, 1, 30, tzinfo=timezone.utc)

    assert default_report_date(now) == date(2026, 8, 30)


def test_daily_query_has_explicit_dirty_data_filters():
    assert "vibedigest_private.ops_excluded_users" in DAILY_METRICS_SQL
    assert "t.guest_id IS NULL" in DAILY_METRICS_SQL
    assert "t.workload_kind = 'user_submission'" in DAILY_METRICS_SQL
    assert "t.is_demo = false" in DAILY_METRICS_SQL
    assert "t.is_deleted = false" in DAILY_METRICS_SQL
    assert "00000000-0000-0000-0000-000000000001" in DAILY_METRICS_SQL


class _FakeResult:
    def __init__(self, value):
        self.value = value

    def mappings(self):
        return self

    def all(self):
        return self.value

    def one(self):
        return self.value


class _FakeConnection:
    def __init__(self, rows, snapshot):
        self.results = [None, _FakeResult(rows), _FakeResult(snapshot)]
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, _params=None):
        self.statements.append(str(statement))
        return self.results.pop(0)


class _FakeEngine:
    def __init__(self, rows, snapshot):
        self.connection = _FakeConnection(rows, snapshot)

    def connect(self):
        return self.connection


def _metric_rows(end_date: date):
    rows = []
    for offset in range(7, -1, -1):
        metric = _metrics(end_date - timedelta(days=offset))
        rows.append(metric.__dict__)
    return rows


def _snapshot(explicit_excluded_users=2):
    return {
        "explicit_excluded_users": explicit_excluded_users,
        "automatic_excluded_service_users": 1,
        "excluded_user_tasks_on_report_date": 7,
        "structurally_excluded_tasks_on_report_date": 9,
        "active_pro_users_now": 5,
        "open_user_tasks_now": 2,
        "users_missing_profiles": 0,
        "completed_orders_missing_fiat_amount": 0,
        "latest_user_task_at": datetime(2026, 8, 30, tzinfo=timezone.utc),
        "generated_at": datetime(2026, 8, 31, tzinfo=timezone.utc),
    }


def test_load_report_uses_read_only_transaction_and_builds_averages():
    engine = _FakeEngine(_metric_rows(date(2026, 8, 30)), _snapshot())

    report = load_ops_daily_report(engine, date(2026, 8, 30))

    assert engine.connection.statements[0] == "SET TRANSACTION READ ONLY"
    assert report.current.report_date == date(2026, 8, 30)
    assert report.previous.report_date == date(2026, 8, 29)
    assert report.trailing_seven_day_average["active_users"] == 18.0
    assert report.snapshot["generated_at"] == "2026-08-31T00:00:00+00:00"


def test_load_report_fails_closed_when_reviewed_exclusions_are_empty():
    engine = _FakeEngine(_metric_rows(date(2026, 8, 30)), _snapshot(0))

    with pytest.raises(RuntimeError, match="No reviewed operations-report exclusions"):
        load_ops_daily_report(engine, date(2026, 8, 30))


def test_load_report_can_explicitly_allow_clean_empty_exclusion_set():
    engine = _FakeEngine(_metric_rows(date(2026, 8, 30)), _snapshot(0))

    report = load_ops_daily_report(
        engine,
        date(2026, 8, 30),
        require_explicit_exclusions=False,
    )

    assert report.current.report_date == date(2026, 8, 30)


def test_write_report_supports_html_and_json(tmp_path):
    engine = _FakeEngine(_metric_rows(date(2026, 8, 30)), _snapshot())
    report = load_ops_daily_report(engine, date(2026, 8, 30))
    html_path = tmp_path / "report.html"
    json_path = tmp_path / "report.json"

    write_report(report, html_path, "html")
    write_report(report, json_path, "json")

    assert "VibeDigest 运营日报" in html_path.read_text()
    assert json.loads(json_path.read_text())["current"]["active_users"] == 18


def test_write_report_rejects_unknown_format(tmp_path):
    engine = _FakeEngine(_metric_rows(date(2026, 8, 30)), _snapshot())
    report = load_ops_daily_report(engine, date(2026, 8, 30))

    with pytest.raises(ValueError, match="Unsupported output format"):
        write_report(report, tmp_path / "report.txt", "text")
