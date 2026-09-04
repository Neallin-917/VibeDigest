#!/usr/bin/env python3
"""Enqueue a bounded batch of missing English/Chinese catalog summaries."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

backend_dir = Path(__file__).resolve().parents[2]
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from utils.env_loader import load_env  # noqa: E402

load_env()

from db_client import DBClient  # noqa: E402
from services.execution_policy import CATALOG_SUMMARY_LOCALES  # noqa: E402


MAX_BACKFILL_TASKS = 100


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enqueue missing bilingual summaries for completed catalog tasks."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Maximum catalog tasks to inspect and enqueue (default: 10).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Enqueue the selected outputs; defaults to a read-only preview.",
    )
    return parser.parse_args()


def enqueue_missing_summaries(
    db: DBClient, *, limit: int, apply: bool = False
) -> dict[str, Any]:
    if not 1 <= limit <= MAX_BACKFILL_TASKS:
        raise ValueError(f"limit must be between 1 and {MAX_BACKFILL_TASKS}")

    tasks = db._execute_query(
        """
        SELECT t.id::text AS id
          FROM public.tasks t
         WHERE t.workload_kind = 'catalog_supply'
           AND t.is_demo = true
           AND t.status = 'completed'
           AND NOT EXISTS (
             SELECT 1 FROM vibedigest_private.task_queue_handoffs h
              WHERE h.job_key = 'process:' || t.id::text AND h.status = 'queued'
           )
           AND EXISTS (
             SELECT 1
               FROM public.task_outputs script
              WHERE script.task_id = t.id
                AND script.kind = 'script'
                AND script.status = 'completed'
                AND NULLIF(BTRIM(COALESCE(script.content, '')), '') IS NOT NULL
           )
           AND EXISTS (
             SELECT 1
               FROM unnest(CAST(:locales AS text[])) AS wanted(locale)
              WHERE NOT EXISTS (
                SELECT 1
                  FROM public.task_outputs summary
                 WHERE summary.task_id = t.id
                   AND summary.kind = 'summary'
                   AND summary.locale = wanted.locale
                   AND summary.status = 'completed'
                   AND vibedigest_private.is_valid_catalog_summary(summary.content, wanted.locale)
              )
                AND NOT EXISTS (
                  SELECT 1 FROM public.task_outputs pending
                  JOIN vibedigest_private.task_queue_handoffs h
                    ON h.job_key = 'retry:' || pending.id::text AND h.status = 'queued'
                  WHERE pending.task_id = t.id AND pending.kind = 'summary'
                    AND pending.locale = wanted.locale
                )
           )
         ORDER BY t.published_at DESC NULLS LAST, t.created_at DESC
         LIMIT :limit
        """,
        {"locales": list(CATALOG_SUMMARY_LOCALES), "limit": limit},
    )

    if not apply:
        return {
            "dry_run": True,
            "tasks_selected": len(tasks),
            "task_ids": [task["id"] for task in tasks],
            "outputs_queued": 0,
        }

    resolutions: dict[str, int] = {}
    queued_messages = 0
    for task in tasks:
        for locale in CATALOG_SUMMARY_LOCALES:
            rows = db._execute_query(
                """
                SELECT *
                  FROM vibedigest_private.enqueue_catalog_summary_locale(
                    CAST(:task_id AS uuid),
                    :locale
                  )
                """,
                {
                    "task_id": task["id"],
                    "locale": locale,
                },
            )
            if not rows:
                raise RuntimeError("Catalog summary backfill returned no result")
            resolution = str(rows[0]["resolution"])
            resolutions[resolution] = resolutions.get(resolution, 0) + 1
            if rows[0].get("message_id") is not None and resolution == "queued":
                queued_messages += 1

    return {
        "tasks_selected": len(tasks),
        "outputs_queued": queued_messages,
        "resolutions": resolutions,
    }


def main() -> int:
    args = parse_args()
    try:
        result = enqueue_missing_summaries(
            DBClient(), limit=args.limit, apply=args.apply
        )
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
