from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

backend_root = Path(__file__).resolve().parents[1]
repo_root = backend_root.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from services.acquisition_reporting import AcquisitionDailyReport, VercelWebAnalyticsClient, write_acquisition_report  # noqa: E402
from services.ops_reporting import create_reporting_engine, default_report_date, load_ops_daily_report  # noqa: E402
from utils.env_loader import load_env  # noqa: E402

load_env()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a privacy-safe acquisition daily report.")
    parser.add_argument("--date", type=date.fromisoformat)
    parser.add_argument("--timezone", default="Asia/Shanghai")
    parser.add_argument("--format", choices=("html", "json"), default="html")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--allow-empty-exclusions", action="store_true")
    return parser.parse_args()


def load_vercel_project() -> tuple[str, str | None]:
    project_id = os.getenv("VERCEL_PROJECT_ID")
    team_id = os.getenv("VERCEL_TEAM_ID")
    project_file = repo_root / ".vercel" / "project.json"
    if not project_id and project_file.exists():
        payload = json.loads(project_file.read_text(encoding="utf-8"))
        project_id = payload.get("projectId")
        team_id = team_id or payload.get("orgId")
    if not project_id:
        raise SystemExit("VERCEL_PROJECT_ID or .vercel/project.json is required")
    return str(project_id), str(team_id) if team_id else None


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL")
    token = os.getenv("VERCEL_API_TOKEN") or os.getenv("VERCEL_TOKEN")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    if not token:
        raise SystemExit("VERCEL_API_TOKEN or VERCEL_TOKEN is required")

    local_timezone = ZoneInfo(args.timezone)
    report_date = args.date or default_report_date(datetime.now(local_timezone))
    since = datetime.combine(report_date, time.min, timezone.utc)
    until = since + timedelta(days=1)
    project_id, team_id = load_vercel_project()
    suffix = ".json" if args.format == "json" else ".html"
    output_path = args.output or Path(f".reports/acquisition-daily/{report_date.isoformat()}{suffix}")

    engine = create_reporting_engine(database_url)
    try:
        operations = load_ops_daily_report(
            engine,
            report_date,
            args.timezone,
            require_explicit_exclusions=not args.allow_empty_exclusions,
        )
    finally:
        engine.dispose()

    with VercelWebAnalyticsClient(token=token, project_id=project_id, team_id=team_id) as client:
        analytics = client.load_snapshot(since, until)
    write_acquisition_report(AcquisitionDailyReport(analytics, operations), output_path, args.format)
    print(output_path.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
