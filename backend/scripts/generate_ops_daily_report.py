from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from services.ops_reporting import (  # noqa: E402
    create_reporting_engine,
    default_report_date,
    load_ops_daily_report,
    write_report,
)
from utils.env_loader import load_env  # noqa: E402

load_env()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a read-only VibeDigest operations daily report."
    )
    parser.add_argument("--date", type=date.fromisoformat, help="Report date (YYYY-MM-DD)")
    parser.add_argument("--timezone", default="Asia/Shanghai")
    parser.add_argument("--format", choices=("html", "json"), default="html")
    parser.add_argument("--output", type=Path, help="Output path")
    parser.add_argument(
        "--allow-empty-exclusions",
        action="store_true",
        help="Allow a clean non-production database with no reviewed exclusions.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    timezone = ZoneInfo(args.timezone)
    report_date = args.date or default_report_date(datetime.now(timezone))
    suffix = ".json" if args.format == "json" else ".html"
    output_path = args.output or Path(
        f".reports/ops-daily/{report_date.isoformat()}{suffix}"
    )

    engine = create_reporting_engine(database_url)
    try:
        report = load_ops_daily_report(
            engine,
            report_date,
            args.timezone,
            require_explicit_exclusions=not args.allow_empty_exclusions,
        )
        write_report(report, output_path, args.format)
    finally:
        engine.dispose()

    print(output_path.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
