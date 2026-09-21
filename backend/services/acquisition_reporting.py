from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from html import escape
from pathlib import Path
from typing import Any, Literal

import httpx

from services.ops_reporting import OpsDailyReport


VERCEL_ANALYTICS_BASE_URL = "https://api.vercel.com/v1/query/web-analytics"
ANALYTICS_DIMENSIONS = ("requestPath", "referrerHostname")
SURFACE_ORDER = (
    "landing",
    "library",
    "public_digest",
    "login",
    "workspace",
    "pricing",
    "other",
)


@dataclass(frozen=True)
class VisitCount:
    visitors: int
    pageviews: int


@dataclass(frozen=True)
class VisitDimensionRow:
    value: str
    visitors: int
    pageviews: int


@dataclass(frozen=True)
class CustomEventAccess:
    status: Literal["available", "unavailable_plan"]
    count: int | None


@dataclass(frozen=True)
class WebAnalyticsSnapshot:
    since: str
    until: str
    visits: VisitCount
    paths: tuple[VisitDimensionRow, ...]
    referrers: tuple[VisitDimensionRow, ...]
    custom_events: CustomEventAccess

    @property
    def surface_pageviews(self) -> dict[str, int]:
        values = {surface: 0 for surface in SURFACE_ORDER}
        for row in self.paths:
            values[classify_path(row.value)] += row.pageviews
        return values


@dataclass(frozen=True)
class AcquisitionDailyReport:
    analytics: WebAnalyticsSnapshot
    operations: OpsDailyReport

    def to_dict(self) -> dict[str, Any]:
        return {
            "analytics": asdict(self.analytics),
            "surface_pageviews": self.analytics.surface_pageviews,
            "operations": self.operations.to_dict(),
        }


class VercelWebAnalyticsClient:
    def __init__(
        self,
        *,
        token: str,
        project_id: str,
        team_id: str | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self._project_id = project_id
        self._team_id = team_id
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url=f"{VERCEL_ANALYTICS_BASE_URL}/",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20.0,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> VercelWebAnalyticsClient:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def load_snapshot(
        self,
        since: datetime,
        until: datetime,
        *,
        limit: int = 100,
    ) -> WebAnalyticsSnapshot:
        if since.tzinfo is None or until.tzinfo is None:
            raise ValueError("Analytics bounds must be timezone-aware")
        if since >= until:
            raise ValueError("Analytics start must be before end")

        params = self._params(since, until)
        visits_payload = self._get("visits/count", params)
        paths = self._load_dimension("requestPath", params, limit)
        referrers = self._load_dimension("referrerHostname", params, limit)
        custom_events = self._load_custom_event_access(params)
        query = visits_payload.get("query") or {}
        data = visits_payload.get("data") or {}

        return WebAnalyticsSnapshot(
            since=str(query.get("since") or since.isoformat()),
            until=str(query.get("until") or until.isoformat()),
            visits=VisitCount(
                visitors=int(data.get("visitors") or 0),
                pageviews=int(data.get("pageviews") or 0),
            ),
            paths=tuple(paths),
            referrers=tuple(referrers),
            custom_events=custom_events,
        )

    def _params(self, since: datetime, until: datetime) -> dict[str, str]:
        params = {
            "projectId": self._project_id,
            "since": since.isoformat(),
            "until": until.isoformat(),
        }
        if self._team_id:
            params["teamId"] = self._team_id
        return params

    def _get(self, path: str, params: dict[str, str | int]) -> dict[str, Any]:
        response = self._client.get(path, params=params)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise RuntimeError("Vercel Web Analytics returned a non-object response")
        return payload

    def _load_dimension(
        self,
        dimension: str,
        params: dict[str, str],
        limit: int,
    ) -> list[VisitDimensionRow]:
        if dimension not in ANALYTICS_DIMENSIONS:
            raise ValueError(f"Unsupported analytics dimension: {dimension}")
        payload = self._get(
            "visits/aggregate",
            {
                **params,
                # Aggregate buckets include the hour containing `until`, while
                # count treats `until` as exclusive. Stay inside the requested
                # window so the pageview totals reconcile.
                "until": (
                    datetime.fromisoformat(params["until"]) - timedelta(microseconds=1)
                ).isoformat(),
                "by": dimension,
                "limit": max(1, min(limit, 250)),
            },
        )
        rows = payload.get("data") or []
        if not isinstance(rows, list):
            raise RuntimeError("Vercel Web Analytics aggregate data is not a list")
        return [
            VisitDimensionRow(
                value=str(row.get(dimension) or ""),
                visitors=int(row.get("visitors") or 0),
                pageviews=int(row.get("pageviews") or 0),
            )
            for row in rows
            if isinstance(row, dict)
        ]

    def _load_custom_event_access(
        self,
        params: dict[str, str],
    ) -> CustomEventAccess:
        response = self._client.get("events/count", params=params)
        if response.status_code == 402:
            return CustomEventAccess(status="unavailable_plan", count=None)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if isinstance(data, dict):
            count = data.get("events", data.get("count", 0))
        else:
            count = data if isinstance(data, int) else 0
        return CustomEventAccess(status="available", count=int(count or 0))


def classify_path(path: str) -> str:
    parts = [part for part in path.split("?")[0].split("/") if part]
    if len(parts) == 1 and parts[0] in {"en", "zh"}:
        return "landing"
    if len(parts) < 2:
        return "other"
    route = parts[1:]
    if route == ["explore"]:
        return "library"
    if route[:1] == ["tasks"]:
        return "public_digest"
    if route == ["login"]:
        return "login"
    if route == ["chat"]:
        return "workspace"
    if route == ["settings", "pricing"]:
        return "pricing"
    return "other"


def write_acquisition_report(
    report: AcquisitionDailyReport,
    output_path: Path,
    output_format: str,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_format == "json":
        content = json.dumps(report.to_dict(), ensure_ascii=False, indent=2)
    elif output_format == "html":
        content = render_acquisition_html(report)
    else:
        raise ValueError(f"Unsupported output format: {output_format}")
    output_path.write_text(content + "\n", encoding="utf-8")


def render_acquisition_html(report: AcquisitionDailyReport) -> str:
    analytics = report.analytics
    ops = report.operations.current
    surfaces = analytics.surface_pageviews
    event_status = (
        f"可用，共 {analytics.custom_events.count or 0} 次"
        if analytics.custom_events.status == "available"
        else "当前 Vercel 套餐不可用"
    )
    cards = [
        ("匿名访客", analytics.visits.visitors),
        ("页面浏览", analytics.visits.pageviews),
        ("新增注册", ops.new_registered_users),
        ("完成用户任务", ops.tasks_completed),
    ]
    card_html = "".join(
        "<article class='metric'><span>"
        f"{escape(label)}</span><strong>{value:,}</strong></article>"
        for label, value in cards
    )
    surface_labels = {
        "landing": "落地页",
        "library": "公开内容库",
        "public_digest": "公开摘要",
        "login": "登录/注册",
        "workspace": "Agent 工作区",
        "pricing": "定价",
        "other": "其他",
    }
    surface_rows = "".join(
        f"<tr><td>{surface_labels[key]}</td><td>{surfaces[key]:,}</td></tr>"
        for key in SURFACE_ORDER
    )
    path_rows = "".join(
        "<tr>"
        f"<td><code>{escape(row.value or '(unknown)')}</code></td>"
        f"<td>{row.visitors:,}</td><td>{row.pageviews:,}</td>"
        "</tr>"
        for row in analytics.paths[:20]
    )
    referrer_rows = "".join(
        "<tr>"
        f"<td>{escape(row.value or 'Direct / unknown')}</td>"
        f"<td>{row.visitors:,}</td><td>{row.pageviews:,}</td>"
        "</tr>"
        for row in analytics.referrers[:12]
    )

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VibeDigest 获客日报 · {ops.report_date.isoformat()}</title>
<style>
:root {{ color-scheme:light dark; --bg:#f5f5f3; --panel:#fff; --text:#171717;
--muted:#6b6b67; --line:#deded9; --accent:#176b45; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:14px/1.55 -apple-system,
BlinkMacSystemFont,"Segoe UI",sans-serif; }}
main {{ max-width:1040px; margin:0 auto; padding:48px 24px 72px; }}
h1 {{ margin:0 0 6px; font-size:30px; letter-spacing:-.03em; }}
h2 {{ margin:34px 0 12px; font-size:18px; }}
.meta,.note {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:24px; }}
.metric,.panel {{ background:var(--panel); border:1px solid var(--line); border-radius:14px; }}
.metric {{ padding:16px; min-height:108px; display:flex; flex-direction:column; justify-content:space-between; }}
.metric span {{ color:var(--muted); font-size:12px; }}
.metric strong {{ font-size:26px; font-variant-numeric:tabular-nums; }}
.panel {{ padding:18px; overflow:auto; }}
.alert {{ border-left:3px solid var(--accent); }}
table {{ width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }}
th,td {{ padding:10px 8px; border-bottom:1px solid var(--line); text-align:right; }}
th:first-child,td:first-child {{ text-align:left; }}
code {{ word-break:break-all; }}
@media (max-width:760px) {{ .grid {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} }}
@media (prefers-color-scheme:dark) {{ :root {{ --bg:#111; --panel:#191919; --text:#f4f4f1;
--muted:#aaa9a2; --line:#353531; --accent:#5bc894; }} }}
</style>
</head>
<body><main>
<h1>VibeDigest 获客日报</h1>
<div class="meta">{ops.report_date.isoformat()} · 匿名访问按 UTC 日，注册与任务按 {escape(report.operations.timezone)} 日 · 两类真值并列，不做用户级关联</div>
<section class="grid">{card_html}</section>
<h2>访问页面阶段</h2>
<div class="panel"><table><thead><tr><th>页面阶段</th><th>浏览次数</th></tr></thead><tbody>{surface_rows}</tbody></table>
<p class="note">浏览次数可以跨页面相加；各路径访客数可能重叠，因此不据此计算转化率。</p></div>
<h2>行为漏斗可用性</h2>
<div class="panel alert">Vercel 自定义事件：<strong>{escape(event_status)}</strong>。数据库仍提供新增注册、24h 激活、任务创建与完成的最终真值。套餐不支持时，本报告只给出页面到达信号，不伪造点击漏斗。</div>
<h2>访问路径</h2>
<div class="panel"><table><thead><tr><th>路径</th><th>访客</th><th>浏览</th></tr></thead><tbody>{path_rows}</tbody></table></div>
<h2>来源域名</h2>
<div class="panel"><table><thead><tr><th>来源</th><th>访客</th><th>浏览</th></tr></thead><tbody>{referrer_rows}</tbody></table></div>
<h2>口径</h2>
<div class="panel">Vercel Web Analytics 提供匿名、无 Cookie 的访问聚合；Supabase 运营口径排除访客、目录供给、Demo、软删除和已审核内部账号。报告不包含原始 URL 参数、邮箱、用户 ID、IP 或跨系统身份映射。</div>
</main></body></html>"""
