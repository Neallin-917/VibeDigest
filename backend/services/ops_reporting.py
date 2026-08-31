from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from html import escape
from pathlib import Path
from statistics import mean
from typing import Any, Mapping

from sqlalchemy import Engine, create_engine, text

from utils.database_ssl import pg8000_connect_args


DAILY_METRICS_SQL = """
WITH report_days AS (
    SELECT generate_series(
        CAST(:report_date AS date) - interval '7 days',
        CAST(:report_date AS date),
        interval '1 day'
    )::date AS report_date
),
bounds AS (
    SELECT
        report_date,
        report_date::timestamp AT TIME ZONE :timezone AS start_at,
        (report_date + 1)::timestamp AT TIME ZONE :timezone AS end_at
    FROM report_days
),
explicit_excluded_users AS (
    SELECT user_id FROM vibedigest_private.ops_excluded_users
),
excluded_users AS (
    SELECT user_id FROM explicit_excluded_users
    UNION
    SELECT '00000000-0000-0000-0000-000000000001'::uuid
),
eligible_users AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    LEFT JOIN excluded_users e ON e.user_id = u.id
    WHERE e.user_id IS NULL
),
valid_tasks AS (
    SELECT t.*
    FROM public.tasks t
    LEFT JOIN excluded_users e ON e.user_id = t.user_id
    WHERE e.user_id IS NULL
      AND t.guest_id IS NULL
      AND t.workload_kind = 'user_submission'
      AND t.is_demo = false
      AND t.is_deleted = false
),
daily_new_users AS (
    SELECT
        (u.created_at AT TIME ZONE :timezone)::date AS metric_date,
        count(*)::bigint AS new_registered_users
    FROM eligible_users u
    GROUP BY 1
),
activation_cohorts AS (
    SELECT
        (u.created_at AT TIME ZONE :timezone)::date AS cohort_date,
        count(*)::bigint AS cohort_users,
        count(*) FILTER (
            WHERE EXISTS (
                SELECT 1
                FROM valid_tasks t
                WHERE t.user_id = u.id
                  AND t.status = 'completed'
                  AND t.created_at >= u.created_at
                  AND t.updated_at < u.created_at + interval '24 hours'
            )
        )::bigint AS activated_24h_users
    FROM eligible_users u
    GROUP BY 1
),
daily_tasks AS (
    SELECT
        (t.created_at AT TIME ZONE :timezone)::date AS metric_date,
        count(*)::bigint AS tasks_created,
        count(DISTINCT t.user_id)::bigint AS users_created_tasks,
        count(*) FILTER (WHERE t.status = 'completed')::bigint AS tasks_completed,
        count(*) FILTER (WHERE t.status IN ('error', 'failed'))::bigint AS tasks_failed,
        count(*) FILTER (WHERE t.status IN ('pending', 'processing'))::bigint AS tasks_open,
        percentile_cont(0.5) WITHIN GROUP (
            ORDER BY extract(epoch FROM (t.updated_at - t.created_at))
        ) FILTER (WHERE t.status = 'completed') AS completion_seconds_p50,
        percentile_cont(0.9) WITHIN GROUP (
            ORDER BY extract(epoch FROM (t.updated_at - t.created_at))
        ) FILTER (WHERE t.status = 'completed') AS completion_seconds_p90
    FROM valid_tasks t
    GROUP BY 1
),
valid_turns AS (
    SELECT a.*
    FROM vibedigest_private.agent_turns a
    LEFT JOIN excluded_users e ON e.user_id = a.user_id
    WHERE e.user_id IS NULL
),
daily_turns AS (
    SELECT
        (a.created_at AT TIME ZONE :timezone)::date AS metric_date,
        count(*)::bigint AS agent_turns,
        count(DISTINCT a.user_id) FILTER (
            WHERE a.error_code = 'quota_exceeded'
        )::bigint AS quota_exceeded_users
    FROM valid_turns a
    GROUP BY 1
),
active_user_events AS (
    SELECT
        (t.created_at AT TIME ZONE :timezone)::date AS metric_date,
        t.user_id
    FROM valid_tasks t
    UNION
    SELECT
        (a.created_at AT TIME ZONE :timezone)::date AS metric_date,
        a.user_id
    FROM valid_turns a
),
daily_active_users AS (
    SELECT metric_date, count(DISTINCT user_id)::bigint AS active_users
    FROM active_user_events
    GROUP BY metric_date
),
valid_orders AS (
    SELECT o.*
    FROM public.payment_orders o
    LEFT JOIN excluded_users e ON e.user_id = o.user_id
    WHERE e.user_id IS NULL
),
daily_orders_created AS (
    SELECT
        (o.created_at AT TIME ZONE :timezone)::date AS metric_date,
        count(*)::bigint AS payment_orders_created
    FROM valid_orders o
    GROUP BY 1
),
daily_orders_completed AS (
    SELECT
        (o.updated_at AT TIME ZONE :timezone)::date AS metric_date,
        count(*)::bigint AS payment_orders_completed,
        coalesce(sum(o.amount_fiat), 0) AS checkout_volume_usd
    FROM valid_orders o
    WHERE o.status = 'completed'
    GROUP BY 1
)
SELECT
    b.report_date,
    (
        SELECT count(*)::bigint
        FROM eligible_users u
        WHERE u.created_at < b.end_at
    ) AS total_registered_users,
    coalesce(n.new_registered_users, 0) AS new_registered_users,
    b.report_date - 1 AS activation_cohort_date,
    coalesce(ac.cohort_users, 0) AS activation_cohort_users,
    coalesce(ac.activated_24h_users, 0) AS activated_24h_users,
    coalesce(au.active_users, 0) AS active_users,
    coalesce(tr.agent_turns, 0) AS agent_turns,
    coalesce(tr.quota_exceeded_users, 0) AS quota_exceeded_users,
    coalesce(dt.tasks_created, 0) AS tasks_created,
    coalesce(dt.users_created_tasks, 0) AS users_created_tasks,
    coalesce(dt.tasks_completed, 0) AS tasks_completed,
    coalesce(dt.tasks_failed, 0) AS tasks_failed,
    coalesce(dt.tasks_open, 0) AS tasks_open,
    dt.completion_seconds_p50,
    dt.completion_seconds_p90,
    coalesce(oc.payment_orders_created, 0) AS payment_orders_created,
    coalesce(od.payment_orders_completed, 0) AS payment_orders_completed,
    coalesce(od.checkout_volume_usd, 0) AS checkout_volume_usd
FROM bounds b
LEFT JOIN daily_new_users n ON n.metric_date = b.report_date
LEFT JOIN activation_cohorts ac ON ac.cohort_date = b.report_date - 1
LEFT JOIN daily_tasks dt ON dt.metric_date = b.report_date
LEFT JOIN daily_turns tr ON tr.metric_date = b.report_date
LEFT JOIN daily_active_users au ON au.metric_date = b.report_date
LEFT JOIN daily_orders_created oc ON oc.metric_date = b.report_date
LEFT JOIN daily_orders_completed od ON od.metric_date = b.report_date
ORDER BY b.report_date;
"""


SNAPSHOT_SQL = """
WITH explicit_excluded_users AS (
    SELECT user_id FROM vibedigest_private.ops_excluded_users
),
excluded_users AS (
    SELECT user_id FROM explicit_excluded_users
    UNION
    SELECT '00000000-0000-0000-0000-000000000001'::uuid
),
valid_tasks AS (
    SELECT t.*
    FROM public.tasks t
    LEFT JOIN excluded_users e ON e.user_id = t.user_id
    WHERE e.user_id IS NULL
      AND t.guest_id IS NULL
      AND t.workload_kind = 'user_submission'
      AND t.is_demo = false
      AND t.is_deleted = false
),
report_bounds AS (
    SELECT
        CAST(:report_date AS date)::timestamp AT TIME ZONE :timezone AS start_at,
        (CAST(:report_date AS date) + 1)::timestamp AT TIME ZONE :timezone AS end_at
)
SELECT
    (SELECT count(*)::bigint FROM explicit_excluded_users)
        AS explicit_excluded_users,
    (
        SELECT count(*)::bigint
        FROM auth.users
        WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
    ) AS automatic_excluded_service_users,
    (
        SELECT count(*)::bigint
        FROM public.tasks t
        JOIN explicit_excluded_users e ON e.user_id = t.user_id
        CROSS JOIN report_bounds b
        WHERE t.created_at >= b.start_at AND t.created_at < b.end_at
    ) AS excluded_user_tasks_on_report_date,
    (
        SELECT count(*)::bigint
        FROM public.tasks t, report_bounds b
        WHERE t.created_at >= b.start_at AND t.created_at < b.end_at
          AND (t.guest_id IS NOT NULL OR t.workload_kind <> 'user_submission'
               OR t.is_demo OR t.is_deleted)
    ) AS structurally_excluded_tasks_on_report_date,
    (
        SELECT count(*)::bigint
        FROM public.profiles p
        LEFT JOIN excluded_users e ON e.user_id = p.id
        WHERE e.user_id IS NULL
          AND p.tier = 'pro'
          AND p.period_end > now()
    ) AS active_pro_users_now,
    (
        SELECT count(*)::bigint
        FROM valid_tasks t
        WHERE t.status IN ('pending', 'processing')
    ) AS open_user_tasks_now,
    (
        SELECT count(*)::bigint
        FROM auth.users u
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN excluded_users e ON e.user_id = u.id
        WHERE e.user_id IS NULL AND p.id IS NULL
    ) AS users_missing_profiles,
    (
        SELECT count(*)::bigint
        FROM public.payment_orders o
        LEFT JOIN excluded_users e ON e.user_id = o.user_id
        WHERE e.user_id IS NULL
          AND o.status = 'completed'
          AND o.amount_fiat IS NULL
    ) AS completed_orders_missing_fiat_amount,
    (SELECT max(created_at) FROM valid_tasks) AS latest_user_task_at,
    now() AS generated_at;
"""


@dataclass(frozen=True)
class DailyMetrics:
    report_date: date
    total_registered_users: int
    new_registered_users: int
    activation_cohort_date: date
    activation_cohort_users: int
    activated_24h_users: int
    active_users: int
    agent_turns: int
    quota_exceeded_users: int
    tasks_created: int
    users_created_tasks: int
    tasks_completed: int
    tasks_failed: int
    tasks_open: int
    completion_seconds_p50: float | None
    completion_seconds_p90: float | None
    payment_orders_created: int
    payment_orders_completed: int
    checkout_volume_usd: float

    @classmethod
    def from_mapping(cls, row: Mapping[str, Any]) -> DailyMetrics:
        values = dict(row)
        for key in (
            "total_registered_users",
            "new_registered_users",
            "activation_cohort_users",
            "activated_24h_users",
            "active_users",
            "agent_turns",
            "quota_exceeded_users",
            "tasks_created",
            "users_created_tasks",
            "tasks_completed",
            "tasks_failed",
            "tasks_open",
            "payment_orders_created",
            "payment_orders_completed",
        ):
            values[key] = int(values[key] or 0)
        for key in (
            "completion_seconds_p50",
            "completion_seconds_p90",
            "checkout_volume_usd",
        ):
            values[key] = float(values[key]) if values[key] is not None else None
        values["checkout_volume_usd"] = values["checkout_volume_usd"] or 0.0
        return cls(**values)

    @property
    def activation_rate(self) -> float | None:
        if self.activation_cohort_users == 0:
            return None
        return self.activated_24h_users / self.activation_cohort_users

    @property
    def task_terminal_success_rate(self) -> float | None:
        terminal = self.tasks_completed + self.tasks_failed
        if terminal == 0:
            return None
        return self.tasks_completed / terminal


@dataclass(frozen=True)
class OpsDailyReport:
    current: DailyMetrics
    previous: DailyMetrics
    trailing_seven_day_average: dict[str, float]
    snapshot: dict[str, Any]
    timezone: str

    def to_dict(self) -> dict[str, Any]:
        return _json_safe(asdict(self))


AVERAGE_FIELDS = (
    "new_registered_users",
    "active_users",
    "agent_turns",
    "tasks_created",
    "tasks_completed",
    "tasks_failed",
    "payment_orders_created",
    "payment_orders_completed",
    "checkout_volume_usd",
)


def create_reporting_engine(database_url: str) -> Engine:
    connect_args = pg8000_connect_args(database_url)
    return create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)


def load_ops_daily_report(
    engine: Engine,
    report_date: date,
    timezone: str = "Asia/Shanghai",
    *,
    require_explicit_exclusions: bool = True,
) -> OpsDailyReport:
    params = {"report_date": report_date.isoformat(), "timezone": timezone}
    with engine.connect() as connection:
        connection.execute(text("SET TRANSACTION READ ONLY"))
        rows = connection.execute(text(DAILY_METRICS_SQL), params).mappings().all()
        snapshot = dict(
            connection.execute(text(SNAPSHOT_SQL), params).mappings().one()
        )

    if require_explicit_exclusions and not snapshot["explicit_excluded_users"]:
        raise RuntimeError(
            "No reviewed operations-report exclusions are configured. "
            "Populate vibedigest_private.ops_excluded_users or explicitly allow "
            "an empty exclusion set for a clean non-production database."
        )
    if len(rows) != 8:
        raise RuntimeError(f"Expected 8 daily metric rows, received {len(rows)}")

    metrics = [DailyMetrics.from_mapping(row) for row in rows]
    current = metrics[-1]
    previous = metrics[-2]
    trailing = metrics[:-1]
    averages = {
        field: mean(float(getattr(metric, field)) for metric in trailing)
        for field in AVERAGE_FIELDS
    }
    return OpsDailyReport(
        current=current,
        previous=previous,
        trailing_seven_day_average=averages,
        snapshot=_json_safe(snapshot),
        timezone=timezone,
    )


def write_report(
    report: OpsDailyReport,
    output_path: Path,
    output_format: str,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_format == "json":
        content = json.dumps(report.to_dict(), ensure_ascii=False, indent=2)
    elif output_format == "html":
        content = render_html(report)
    else:
        raise ValueError(f"Unsupported output format: {output_format}")
    output_path.write_text(content + "\n", encoding="utf-8")


def render_html(report: OpsDailyReport) -> str:
    current = report.current
    previous = report.previous
    average = report.trailing_seven_day_average

    cards = [
        ("总注册用户", _integer(current.total_registered_users), None),
        (
            "新增注册",
            _integer(current.new_registered_users),
            _comparison(current.new_registered_users, previous.new_registered_users),
        ),
        (
            "活跃注册用户",
            _integer(current.active_users),
            _comparison(current.active_users, previous.active_users),
        ),
        (
            "24h 激活率",
            _percent(current.activation_rate),
            f"{current.activation_cohort_date.isoformat()} 注册 cohort",
        ),
        (
            "用户任务",
            _integer(current.tasks_created),
            _comparison(current.tasks_created, previous.tasks_created),
        ),
        (
            "终态成功率",
            _percent(current.task_terminal_success_rate),
            f"成功 {current.tasks_completed} / 失败 {current.tasks_failed}",
        ),
        (
            "Agent 对话",
            _integer(current.agent_turns),
            _comparison(current.agent_turns, previous.agent_turns),
        ),
        (
            "确认结账金额",
            f"${current.checkout_volume_usd:,.2f}",
            "不含续费和退款，不能视为净收入",
        ),
    ]
    card_html = "".join(
        f"<article class='card'><div class='label'>{escape(label)}</div>"
        f"<div class='value'>{escape(value)}</div>"
        f"<div class='hint'>{escape(hint or '')}</div></article>"
        for label, value, hint in cards
    )

    metric_rows = [
        (
            "新增注册",
            current.new_registered_users,
            previous.new_registered_users,
            "new_registered_users",
        ),
        ("活跃注册用户", current.active_users, previous.active_users, "active_users"),
        ("Agent 对话", current.agent_turns, previous.agent_turns, "agent_turns"),
        ("用户任务", current.tasks_created, previous.tasks_created, "tasks_created"),
        (
            "完成任务",
            current.tasks_completed,
            previous.tasks_completed,
            "tasks_completed",
        ),
        ("失败任务", current.tasks_failed, previous.tasks_failed, "tasks_failed"),
        (
            "创建支付订单",
            current.payment_orders_created,
            previous.payment_orders_created,
            "payment_orders_created",
        ),
        (
            "完成支付订单",
            current.payment_orders_completed,
            previous.payment_orders_completed,
            "payment_orders_completed",
        ),
    ]
    comparison_rows = "".join(
        "<tr>"
        f"<td>{escape(label)}</td><td>{_integer(today)}</td>"
        f"<td>{_integer(yesterday)}</td><td>{average[key]:.1f}</td>"
        "</tr>"
        for label, today, yesterday, key in metric_rows
    )

    snapshot = report.snapshot
    quality_items = [
        f"显式排除账号：{snapshot['explicit_excluded_users']} 个；报告日过滤其任务 "
        f"{snapshot['excluded_user_tasks_on_report_date']} 个。",
        f"自动排除访客占位账号：{snapshot['automatic_excluded_service_users']} 个。",
        f"结构性排除的访客、目录供给、Demo 或软删除任务："
        f"{snapshot['structurally_excluded_tasks_on_report_date']} 个。",
        f"缺少 profile 的注册用户：{snapshot['users_missing_profiles']} 个。",
        f"已完成但缺少法币金额的订单："
        f"{snapshot['completed_orders_missing_fiat_amount']} 个。",
    ]
    quality_html = "".join(f"<li>{escape(item)}</li>" for item in quality_items)
    latest_task = snapshot.get("latest_user_task_at") or "无"
    generated_at = snapshot.get("generated_at") or "未知"

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VibeDigest 运营日报 · {current.report_date.isoformat()}</title>
<style>
:root {{ color-scheme: light dark; --bg:#f5f5f3; --panel:#fff; --text:#171717;
--muted:#6b6b67; --line:#deded9; --accent:#176b45; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:14px/1.55 -apple-system,
BlinkMacSystemFont,"Segoe UI",sans-serif; }}
main {{ max-width:1040px; margin:0 auto; padding:48px 24px 72px; }}
h1 {{ margin:0 0 6px; font-size:30px; letter-spacing:-.03em; }}
h2 {{ margin:34px 0 12px; font-size:18px; }}
.meta,.hint {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:24px; }}
.card,.panel {{ background:var(--panel); border:1px solid var(--line); border-radius:14px; }}
.card {{ padding:16px; min-height:118px; }}
.label {{ color:var(--muted); font-size:12px; }}
.value {{ margin:8px 0 4px; font-size:25px; font-weight:700; font-variant-numeric:tabular-nums; }}
.panel {{ padding:18px; overflow:auto; }}
table {{ width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }}
th,td {{ padding:10px 8px; border-bottom:1px solid var(--line); text-align:right; }}
th:first-child,td:first-child {{ text-align:left; }}
ul {{ margin:0; padding-left:20px; }}
.scope {{ border-left:3px solid var(--accent); padding-left:14px; }}
@media (max-width:760px) {{ .grid {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} }}
@media (prefers-color-scheme:dark) {{ :root {{ --bg:#111; --panel:#191919; --text:#f4f4f1;
--muted:#aaa9a2; --line:#353531; --accent:#5bc894; }} }}
</style>
</head>
<body><main>
<h1>VibeDigest 运营日报</h1>
<div class="meta">{current.report_date.isoformat()} · {escape(report.timezone)} · 数据生成于 {escape(str(generated_at))}</div>
<section class="grid">{card_html}</section>
<h2>趋势对比</h2>
<div class="panel"><table><thead><tr><th>指标</th><th>昨日</th><th>前日</th><th>前 7 日均值</th></tr></thead>
<tbody>{comparison_rows}</tbody></table></div>
<h2>当前运营状态</h2>
<div class="panel"><ul>
<li>当前有效 Pro 用户：{snapshot['active_pro_users_now']} 人。</li>
<li>当前未终态用户任务：{snapshot['open_user_tasks_now']} 个。</li>
<li>额度不足用户：{current.quota_exceeded_users} 人。</li>
<li>任务完成耗时：P50 {_duration(current.completion_seconds_p50)}，P90 {_duration(current.completion_seconds_p90)}。</li>
<li>最新真实用户任务：{escape(str(latest_task))}。</li>
</ul></div>
<h2>数据质量</h2><div class="panel"><ul>{quality_html}</ul></div>
<h2>统计范围</h2>
<div class="panel scope">核心指标仅统计注册用户和真实 <code>user_submission</code>。
排除访客任务、目录供给、Demo、软删除任务，以及私有名单中的内部、开发、测试和验收账号。
24h 激活率使用已完整成熟的前一日注册 cohort。支付金额只表示已确认的初始结账订单，当前表结构不含完整续费和退款流水。</div>
</main></body></html>"""


def default_report_date(timezone_now: datetime) -> date:
    return timezone_now.date() - timedelta(days=1)


def _comparison(current: int, previous: int) -> str:
    delta = current - previous
    if previous == 0:
        return f"较前日 {delta:+d}"
    return f"较前日 {delta:+d}（{delta / previous:+.1%}）"


def _integer(value: int) -> str:
    return f"{value:,}"


def _percent(value: float | None) -> str:
    return "—" if value is None else f"{value:.1%}"


def _duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"{seconds:.0f} 秒"
    return f"{seconds / 60:.1f} 分钟"


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value
