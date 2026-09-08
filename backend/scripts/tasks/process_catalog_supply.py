#!/usr/bin/env python3
"""Process a bounded catalog-supply batch with the local Codex subscription."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[2]
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from utils.env_loader import load_env  # noqa: E402

load_env()

# This is a purpose-specific entry point. Force the capability profile before
# importing config/worker so it cannot silently fall back to an API provider.
os.environ["WORKER_PROFILE"] = "trusted_codex"
os.environ["LLM_RUNTIME"] = "codex_local"
os.environ.setdefault("TASK_QUEUE_MAX_POLL_SECONDS", "1")
# Long podcast synthesis routinely exceeds the interactive local-chat budget.
# Keep the larger bound scoped to this trusted batch entry point.
os.environ.setdefault("CODEX_LOCAL_TIMEOUT_SECONDS", "600")

from worker import build_worker, drain_worker  # noqa: E402
from services.catalog_backfill_scope import ScopedCatalogSummaryQueue, read_task_ids  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Process a bounded batch from the podcast_supply queue."
    )
    parser.add_argument(
        "--max-jobs",
        type=int,
        default=int(os.getenv("PODCAST_MAX_JOBS_PER_RUN", "4")),
        help="Maximum jobs to process before exiting (default: 4).",
    )
    parser.add_argument(
        "--task-ids-file",
        type=Path,
        help="Only consume summary retries for these task UUIDs.",
    )
    return parser.parse_args()


async def run(max_jobs: int, task_ids: list[str] | None = None) -> int:
    worker = await build_worker()
    if task_ids is not None:
        worker.queue = ScopedCatalogSummaryQueue(worker.queue.db, task_ids=task_ids)
    processed = await drain_worker(worker, max_jobs=max_jobs)
    print(
        json.dumps(
            {
                "execution_profile": worker.profile.name.value,
                "queue": worker.queue.queue_name,
                "processed": processed,
            },
            sort_keys=True,
        )
    )
    return 0


def main() -> int:
    args = parse_args()
    try:
        task_ids = read_task_ids(args.task_ids_file) if args.task_ids_file else None
        return asyncio.run(run(args.max_jobs, task_ids))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
