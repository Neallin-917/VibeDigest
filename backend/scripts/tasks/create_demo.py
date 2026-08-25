#!/usr/bin/env python3
"""
Create and optionally process a public demo task.

Usage:
    uv run python backend/scripts/tasks/create_demo.py
    uv run python backend/scripts/tasks/create_demo.py --url https://www.youtube.com/watch?v=...
    uv run python backend/scripts/tasks/create_demo.py --user-id <uuid> --no-run
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

backend_dir = Path(__file__).resolve().parents[2]
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from utils.env_loader import load_env  # noqa: E402

load_env()

from db_client import DBClient  # noqa: E402
from services.task_queue import PostgresTaskQueue, TaskQueue  # noqa: E402
from utils.url import normalize_video_url  # noqa: E402


DEFAULT_DEMO_URL = "https://www.youtube.com/watch?v=7rzYDM6vMtI"
DEMO_USER_ENV_KEYS = ("VIBEDIGEST_DEMO_USER_ID", "DEMO_USER_ID")
logger = logging.getLogger(__name__)
CatalogRunner = Callable[[int], Awaitable[int]]


@dataclass(frozen=True)
class DemoTaskResult:
    task_id: str
    user_id: str
    video_url: str
    status: str
    ran_workflow: bool


def resolve_demo_user_id(db: DBClient, explicit_user_id: str | None = None) -> str:
    """Resolve the account that should own generated demo tasks."""
    if explicit_user_id and explicit_user_id.strip():
        return explicit_user_id.strip()

    for key in DEMO_USER_ENV_KEYS:
        value = os.getenv(key, "").strip()
        if value:
            return value

    rows = db._execute_query(
        """
        SELECT id
        FROM profiles
        ORDER BY created_at ASC
        LIMIT 1
        """
    )
    if not rows:
        env_hint = " or ".join(DEMO_USER_ENV_KEYS)
        raise RuntimeError(
            f"No default profile found. Set {env_hint} or pass --user-id."
        )
    return str(rows[0]["id"])


def _load_catalog_runner() -> CatalogRunner:
    from scripts.tasks.process_catalog_supply import run

    return run


async def create_demo_task(
    *,
    db: DBClient,
    task_queue: TaskQueue,
    video_url: str,
    user_id: str | None = None,
    video_title: str | None = None,
    run_workflow: bool = True,
    workflow_runner: CatalogRunner | None = None,
) -> DemoTaskResult:
    normalized_url = normalize_video_url(video_url)
    if not normalized_url:
        raise ValueError("Invalid video URL")

    resolved_user_id = resolve_demo_user_id(db, user_id)
    submission = task_queue.submit_catalog_video(
        user_id=resolved_user_id,
        video_url=normalized_url,
        publish_on_complete=True,
        output_intent={"source": "manual_demo"},
    )
    task_id = submission.task_id
    if video_title:
        db.update_task_status(task_id, video_title=video_title)

    if run_workflow:
        runner = workflow_runner or _load_catalog_runner()
        await runner(1)

    latest_task: dict[str, Any] | None = None
    try:
        latest_task = db.get_task(task_id)
    except Exception as exc:
        logger.warning("Created demo task but failed to fetch final status: %s", exc)

    return DemoTaskResult(
        task_id=task_id,
        user_id=resolved_user_id,
        video_url=normalized_url,
        status=str((latest_task or {}).get("status") or "pending"),
        ran_workflow=run_workflow,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a VibeDigest demo task.")
    parser.add_argument(
        "--url",
        default=DEFAULT_DEMO_URL,
        help=f"Video URL to process. Defaults to {DEFAULT_DEMO_URL}",
    )
    parser.add_argument(
        "--user-id",
        default=None,
        help="Owner account UUID. Defaults to VIBEDIGEST_DEMO_USER_ID, DEMO_USER_ID, then first profile.",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Optional initial video_title value.",
    )
    parser.add_argument(
        "--no-run",
        action="store_true",
        help="Create the demo task and placeholders without running the workflow.",
    )
    return parser.parse_args()


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args()
    db = DBClient()
    task_queue = PostgresTaskQueue(db)

    try:
        result = await create_demo_task(
            db=db,
            task_queue=task_queue,
            video_url=args.url,
            user_id=args.user_id,
            video_title=args.title,
            run_workflow=not args.no_run,
        )
    except Exception as exc:
        logger.error("Failed to create demo task: %s", exc)
        return 1

    print(f"task_id={result.task_id}")
    print(f"user_id={result.user_id}")
    print(f"video_url={result.video_url}")
    print("is_demo=true")
    print(f"workflow={'ran' if result.ran_workflow else 'skipped'}")
    if result.status:
        print(f"status={result.status}")
    if result.ran_workflow and result.status == "error":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
