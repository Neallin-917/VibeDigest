#!/usr/bin/env python3
"""
Normalize historical `public.chat_messages.content` rows to AI SDK v6 UIMessage parts.

Why:
- Older rows may still store plain text or legacy envelope objects.
- The current chat stack expects `content` to be a JSON array of parts.
- We want an idempotent cleanup path that is safe to inspect first.

Usage:
  # Report only (default)
  uv run scripts/migrate_chat_messages_to_parts.py

  # Report only and write a JSON summary
  uv run scripts/migrate_chat_messages_to_parts.py --report-json /tmp/chat-migration-report.json

  # Apply updates in-place
  uv run scripts/migrate_chat_messages_to_parts.py --apply

Env:
  DATABASE_URL
  SUPABASE_URL / SUPABASE_SERVICE_KEY are not required by this script, but the
  backend DB config still expects a valid database connection.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.exc import OperationalError


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

for env_file in (
    REPO_ROOT / ".env",
    REPO_ROOT / ".env.local",
    BACKEND_ROOT / ".env",
    BACKEND_ROOT / ".env.local",
):
    load_dotenv(env_file, override=False)

from backend.db_client import DBClient  # noqa: E402


logger = logging.getLogger("migrate_chat_messages_to_parts")


TEXT_PART_TYPE = "text"
DEFAULT_BATCH_SIZE = 500


@dataclass
class RowSample:
    id: str
    thread_id: str
    role: str
    created_at: str
    storage_kind: str
    action: str
    preview: str


def _configure_logging(debug: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _truncate(value: str, limit: int = 180) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _try_json_loads(value: str) -> Any:
    try:
        return json.loads(value)
    except Exception:
        return None


def _text_part(text_value: Any) -> dict[str, Any]:
    return {"type": TEXT_PART_TYPE, "text": "" if text_value is None else str(text_value)}


def _normalize_part(value: Any) -> list[dict[str, Any]]:
    """
    Convert a legacy storage value into a UIMessage parts array.

    Rules:
    - Plain strings become a single text part.
    - Existing part objects are preserved when they already look like parts.
    - Message envelopes (`role`, `parts`, `content`) are unwrapped to parts.
    - Unknown objects are stringified and wrapped in a text part.
    """

    if value is None:
        return []

    if isinstance(value, list):
        normalized: list[dict[str, Any]] = []
        for item in value:
            normalized.extend(_normalize_part(item))
        return normalized

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []

        parsed = _try_json_loads(stripped)
        if parsed is None:
            return [_text_part(value)]

        if isinstance(parsed, str):
            return [_text_part(parsed)]

        return _normalize_part(parsed)

    if isinstance(value, dict):
        # Message envelope from legacy storage.
        if "parts" in value and isinstance(value["parts"], list):
            return _normalize_part(value["parts"])

        if "role" in value and "content" in value:
            return _normalize_part(value["content"])

        # Preserve part objects that already look like valid UIMessage parts.
        if isinstance(value.get("type"), str):
            part_type = value["type"]
            if part_type == TEXT_PART_TYPE:
                text_value = value.get("text", value.get("content"))
                return [_text_part(text_value)]
            if part_type != "message":
                return [value]

        if "content" in value:
            return _normalize_part(value["content"])

        if "text" in value and isinstance(value["text"], str):
            return [_text_part(value["text"])]

        return [_text_part(_json_dumps(value))]

    if isinstance(value, (bool, int, float)):
        return [_text_part(value)]

    return [_text_part(str(value))]


def _decode_existing_content(value: Any) -> Any:
    """
    Decode the current stored value into a comparable Python object.

    - JSONB rows already arrive as dict/list/scalars.
    - TEXT rows may contain raw text or JSON strings.
    """

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ""
        parsed = _try_json_loads(stripped)
        if parsed is not None:
            return parsed
        return value
    return value


def _classify_storage_kind(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, list):
        return "native-array"
    if isinstance(value, dict):
        return "native-object"
    if isinstance(value, str):
        parsed = _try_json_loads(value.strip())
        if parsed is None:
            return "plain-text"
        if isinstance(parsed, list):
            return "json-array-string"
        if isinstance(parsed, dict):
            return "json-object-string"
        if isinstance(parsed, str):
            return "json-string"
        return f"json-{type(parsed).__name__}"
    return type(value).__name__


def _fetch_content_column_type(db: DBClient) -> str:
    rows = db._execute_query(
        """
        SELECT data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'chat_messages'
          AND column_name = 'content'
        LIMIT 1
        """
    )
    if not rows:
        raise SystemExit("Could not find public.chat_messages.content")

    row = rows[0]
    data_type = str(row.get("data_type") or "").lower()
    udt_name = str(row.get("udt_name") or "").lower()

    if udt_name:
        return udt_name
    return data_type


def _iter_chat_message_rows(db: DBClient, batch_size: int) -> Iterable[list[dict[str, Any]]]:
    last_created_at: Optional[Any] = None
    last_id: Optional[str] = None

    while True:
        if last_created_at is None:
            query = """
                SELECT id, thread_id, role, content, created_at
                FROM public.chat_messages
                ORDER BY created_at ASC, id ASC
                LIMIT :limit
            """
            params = {"limit": batch_size}
        else:
            query = """
                SELECT id, thread_id, role, content, created_at
                FROM public.chat_messages
                WHERE (created_at, id) > (:created_at, :id)
                ORDER BY created_at ASC, id ASC
                LIMIT :limit
            """
            params = {"created_at": last_created_at, "id": last_id, "limit": batch_size}

        rows = db._execute_query(query, params)
        if not rows:
            break

        yield rows
        last = rows[-1]
        last_created_at = last["created_at"]
        last_id = str(last["id"])


def _safe_preview(value: Any) -> str:
    if isinstance(value, str):
        return _truncate(value)
    try:
        return _truncate(_json_dumps(value))
    except Exception:
        return _truncate(str(value))


def _write_report(report_path: Path, report: dict[str, Any]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(_json_dumps(report) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize public.chat_messages.content rows to AI SDK v6 UIMessage parts."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates to the database. Default is report-only dry-run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Force report-only mode even if --apply is also provided.",
    )
    parser.add_argument(
        "--report-json",
        type=Path,
        help="Write a machine-readable summary report to this path.",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=20,
        help="Maximum number of affected rows to include in the report.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Rows to scan per batch (default: {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging.",
    )
    args = parser.parse_args()

    _configure_logging(args.debug)

    apply_changes = bool(args.apply) and not bool(args.dry_run)
    if args.apply and args.dry_run:
        logger.warning("Both --apply and --dry-run were provided; running in dry-run mode.")

    db = DBClient()
    if not db.engine:
        raise SystemExit("Database engine not initialized. Set DATABASE_URL before running this script.")

    try:
        content_column_type = _fetch_content_column_type(db)
    except OperationalError as error:
        raise SystemExit(
            "Could not connect to DATABASE_URL while scanning public.chat_messages. "
            "Check the configured pooler/session connection and retry."
        ) from error
    content_is_jsonb = content_column_type == "jsonb"

    stats = Counter()
    samples: list[RowSample] = []
    rows_to_update: list[dict[str, Any]] = []

    logger.info("Scanning public.chat_messages (content column type: %s)", content_column_type)

    for batch in _iter_chat_message_rows(db, batch_size=max(1, args.batch_size)):
        stats["scanned"] += len(batch)
        for row in batch:
            raw_content = row.get("content")
            storage_kind = _classify_storage_kind(raw_content)
            stats[f"storage:{storage_kind}"] += 1

            normalized_parts = _normalize_part(raw_content)
            existing_semantic = _decode_existing_content(raw_content)

            needs_update = existing_semantic != normalized_parts
            if needs_update:
                stats["needs_update"] += 1
                rows_to_update.append(
                    {
                        "id": str(row["id"]),
                        "thread_id": str(row["thread_id"]),
                        "role": str(row["role"]),
                        "created_at": str(row["created_at"]),
                        "storage_kind": storage_kind,
                        "normalized_parts": normalized_parts,
                        "preview": _safe_preview(raw_content),
                    }
                )
                if len(samples) < max(0, args.sample_limit):
                    samples.append(
                        RowSample(
                            id=str(row["id"]),
                            thread_id=str(row["thread_id"]),
                            role=str(row["role"]),
                            created_at=str(row["created_at"]),
                            storage_kind=storage_kind,
                            action="update",
                            preview=_safe_preview(raw_content),
                        )
                    )
            else:
                stats["already_normalized"] += 1

    report = {
        "table": "public.chat_messages",
        "content_column_type": content_column_type,
        "apply": apply_changes,
        "summary": {
            "scanned": stats["scanned"],
            "needs_update": stats["needs_update"],
            "already_normalized": stats["already_normalized"],
            "storage_kinds": {
                key.removeprefix("storage:"): value
                for key, value in sorted(stats.items())
                if key.startswith("storage:")
            },
        },
        "samples": [asdict(sample) for sample in samples],
    }

    logger.info(
        "Scan complete: scanned=%s needs_update=%s already_normalized=%s apply=%s",
        stats["scanned"],
        stats["needs_update"],
        stats["already_normalized"],
        apply_changes,
    )

    if not apply_changes:
        logger.info("Dry-run only. Re-run with --apply to write normalized parts back to the database.")
        if args.report_json:
            _write_report(args.report_json, report)
            logger.info("Wrote report to %s", args.report_json)
        return 0

    if not rows_to_update:
        logger.info("No row-level content updates were needed.")
    else:
        logger.info("Applying %s row updates...", len(rows_to_update))
        batch_size = max(1, min(args.batch_size, 1000))

        with db.engine.begin() as conn:
            for start in range(0, len(rows_to_update), batch_size):
                chunk = rows_to_update[start : start + batch_size]
                for item in chunk:
                    serialized = _json_dumps(item["normalized_parts"])
                    if content_is_jsonb:
                        conn.execute(
                            text(
                                """
                                UPDATE public.chat_messages
                                SET content = CAST(:content AS jsonb)
                                WHERE id = :id
                                """
                            ),
                            {"id": item["id"], "content": serialized},
                        )
                    else:
                        conn.execute(
                            text(
                                """
                                UPDATE public.chat_messages
                                SET content = :content
                                WHERE id = :id
                                """
                            ),
                            {"id": item["id"], "content": serialized},
                        )

        stats["updated"] = len(rows_to_update)
        logger.info("Applied row updates: %s", len(rows_to_update))

    if not content_is_jsonb:
        logger.info("Converting public.chat_messages.content from %s to jsonb...", content_column_type)
        with db.engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE public.chat_messages
                    ALTER COLUMN content TYPE jsonb
                    USING content::jsonb
                    """
                )
            )
        stats["schema_converted_to_jsonb"] = 1
        logger.info("Column conversion complete.")

    report["summary"]["updated"] = int(stats.get("updated", 0))
    report["summary"]["schema_converted_to_jsonb"] = bool(stats.get("schema_converted_to_jsonb", 0))

    if args.report_json:
        _write_report(args.report_json, report)
        logger.info("Wrote report to %s", args.report_json)

    logger.info("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
