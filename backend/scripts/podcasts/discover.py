#!/usr/bin/env python3
"""Sync the podcast catalog, discover recent episodes, and enqueue new tasks."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[2]
project_root = backend_dir.parent
default_catalog_path = project_root / "config" / "podcast-sources.json"
if not default_catalog_path.exists():
    default_catalog_path = backend_dir / "podcast-sources.json"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from utils.env_loader import load_env  # noqa: E402

load_env()
os.environ["VIBEDIGEST_PROCESS_ROLE"] = "podcast_discovery"

from db_client import DBClient  # noqa: E402
from services.podcast_discovery import (  # noqa: E402
    PodcastDiscoveryService,
    PodcastRepository,
    YouTubeChannelDiscoverer,
    load_podcast_catalog,
)
from services.task_queue import PostgresTaskQueue  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover recent podcast episodes and submit canonical queue tasks."
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=default_catalog_path,
        help="Podcast catalog JSON path.",
    )
    parser.add_argument("--source", help="Discover one active source slug, even if its schedule is disabled.")
    parser.add_argument("--since-days", type=int, default=7)
    parser.add_argument("--max-enqueues", type=int, default=4)
    parser.add_argument(
        "--sync-only",
        action="store_true",
        help="Update the database source registry without network discovery or queue writes.",
    )
    return parser.parse_args()


async def run(args: argparse.Namespace) -> int:
    db = DBClient()
    repository = PodcastRepository(db)
    catalog = load_podcast_catalog(args.catalog)
    synced = repository.sync_catalog(catalog)
    if args.sync_only:
        print(json.dumps({"catalog_sources_synced": synced}, ensure_ascii=False))
        return 0

    demo_user_id = (
        os.getenv("VIBEDIGEST_DEMO_USER_ID", "").strip()
        or os.getenv("DEMO_USER_ID", "").strip()
    )
    if not demo_user_id:
        raise RuntimeError(
            "VIBEDIGEST_DEMO_USER_ID is required for scheduled podcast discovery"
        )

    service = PodcastDiscoveryService(
        repository=repository,
        discoverer=YouTubeChannelDiscoverer(),
        task_queue=PostgresTaskQueue(db),
        demo_user_id=demo_user_id,
    )
    stats = await service.run(
        source_slug=args.source,
        since_days=args.since_days,
        max_enqueues=args.max_enqueues,
    )
    result = {"catalog_sources_synced": synced, **vars(stats)}
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 1 if stats.source_failures else 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    try:
        return asyncio.run(run(args))
    except Exception as exc:
        logging.getLogger(__name__).exception("Podcast discovery failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
