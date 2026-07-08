#!/usr/bin/env python3
"""
Backfill V4 summaries for tasks that have transcripts but missing/outdated summaries.

Finds tasks with completed `script` outputs but no V4 summary, then regenerates
the summary using the V4 two-phase dynamic strategy.

Usage:
    # Dry-run (list tasks to be processed)
    uv run backend/scripts/db/backfill_summary_v4.py --dry-run

    # Process all matching tasks (max 10 by default)
    uv run backend/scripts/db/backfill_summary_v4.py

    # Process specific task
    uv run backend/scripts/db/backfill_summary_v4.py --task-id <uuid>

    # Process with higher concurrency
    uv run backend/scripts/db/backfill_summary_v4.py --concurrency 5 --limit 50
"""

import asyncio
import sys
import os
import json
import argparse
import logging
from typing import List, Dict, Any, Optional

# Setup path to import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from utils.env_loader import load_env
load_env()

from db_client import DBClient
from services.summarizer import Summarizer
from services.summarizer.validation import parse_summary_payload_v4
from config import settings
from utils.text_utils import detect_language

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s: %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


def find_tasks_needing_v4_summary(db: DBClient, limit: int = 10, demo_only: bool = False) -> List[Dict[str, Any]]:
    """
    Find tasks that have a completed script but:
    - No summary output, OR
    - Summary with version < 4, OR
    - Summary still pending/error
    """
    demo_filter = "AND t.is_demo = true" if demo_only else ""
    
    query = f"""
        WITH task_scripts AS (
            SELECT DISTINCT t.id as task_id, t.user_id, t.video_title,
                   os.content as script_content,
                   os.id as script_output_id
            FROM tasks t
            JOIN task_outputs os ON os.task_id = t.id AND os.kind = 'script'
            WHERE os.status = 'completed' 
              AND length(os.content) > 100
              AND t.is_deleted = false
              {demo_filter}
        ),
        task_summaries AS (
            SELECT task_id, content, status
            FROM task_outputs
            WHERE kind = 'summary'
        )
        SELECT ts.task_id, ts.user_id, ts.video_title, ts.script_content,
               tsum.content as summary_content, tsum.status as summary_status
        FROM task_scripts ts
        LEFT JOIN task_summaries tsum ON tsum.task_id = ts.task_id
        WHERE (
            -- No summary at all
            tsum.content IS NULL
            -- Or summary failed
            OR tsum.status = 'error'
        )
        ORDER BY ts.task_id
        LIMIT :limit
    """
    rows = db._execute_query(query, {"limit": limit})

    def needs_v4_backfill(content: Optional[str]) -> bool:
        if not content:
            return True
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return True
        version = data.get("version")
        try:
            return int(version) < 4
        except (TypeError, ValueError):
            return True

    return [r for r in rows if needs_v4_backfill(r.get("summary_content"))]


def find_single_task(db: DBClient, task_id: str) -> Optional[Dict[str, Any]]:
    """Find a single task by ID with its script content."""
    query = """
        SELECT t.id as task_id, t.user_id, t.video_title,
               os.content as script_content
        FROM tasks t
        JOIN task_outputs os ON os.task_id = t.id AND os.kind = 'script'
        WHERE t.id = :task_id
          AND os.status = 'completed'
          AND length(os.content) > 100
        LIMIT 1
    """
    rows = db._execute_query(query, {"task_id": task_id})
    return rows[0] if rows else None


import re

def clean_json_markdown(text: str) -> str:
    """Strip markdown code fences to get pure JSON."""
    if not text:
        return ""
    pattern = r"^```(?:json)?\s*(.*?)\s*```$"
    match = re.match(pattern, text.strip(), re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1)
    return text.strip()

async def regenerate_summary_v4(
    db: DBClient,
    task_id: str,
    user_id: str,
    script_content: str,
    video_title: str = "",
    dry_run: bool = False
) -> bool:
    """Regenerate V4 summary for a single task."""
    
    if dry_run:
        logger.info(f"[DRY-RUN] Would process: {task_id} ({video_title[:50]}...)")
        return True
    
    logger.info(f"Processing: {task_id} ({video_title[:40]}...)")
    
    # --- Language Verification Fix ---
    # Detect actual language from transcript text (SSOT)
    real_lang = detect_language(script_content)
    logger.info(f"  Detected language from text: {real_lang}")
    
    # Check and fix script_raw metadata if present
    # This ensures upstream consistency for future ops
    try:
        # We need to query for script_raw explicitly as it's not passed in
        script_raw_row = db._execute_query(
            "SELECT id, content FROM task_outputs WHERE task_id = :tid AND kind = 'script_raw'", 
            {"tid": task_id}
        )
        
        if script_raw_row and script_raw_row[0].get("content"):
            row = script_raw_row[0]
            raw_content = row["content"]
            try:
                raw_json = json.loads(raw_content)
                current_meta_lang = raw_json.get("language")
                
                if current_meta_lang != real_lang:
                    logger.info(f"  Fixing script_raw language metadata: {current_meta_lang} -> {real_lang}")
                    raw_json["language"] = real_lang
                    new_content = json.dumps(raw_json, ensure_ascii=False)
                    db.update_output_status(
                        row["id"],
                        status="completed",
                        progress=100,
                        content=new_content,
                        error=""
                    )
            except json.JSONDecodeError:
                pass
    except Exception as e:
        logger.warning(f"  Failed to check/fix script_raw metadata: {e}")
    # ---------------------------------
    
    try:
        # Use Summarizer directly instead of full cognition workflow
        summarizer = Summarizer()
        summary_result = await summarizer.summarize(
            transcript=script_content,
            target_language=real_lang
        )
        
        if summary_result:
            # Clean markdown fences if present
            summary_result = clean_json_markdown(summary_result)
            
            try:
                summary_data = parse_summary_payload_v4(summary_result)
                version = int(summary_data.get("version", 0))
                summary_result = json.dumps(summary_data, ensure_ascii=False)
            except ValueError as exc:
                logger.error(f"  FAILED: Invalid V4 summary payload ({exc})")
                return False
                
            if version != 4:
                logger.warning(f"  Generated summary is V{version}, not V4!")
            
            # Save to DB
            db.upsert_completed_task_output(
                task_id, user_id, "summary", summary_result
            )
            logger.info(f"  SUCCESS (V{version})")
            return True
        else:
            logger.error(f"  FAILED: No summary generated")
            return False
            
    except Exception as e:
        logger.error(f"  FAILED: {e}")
        return False


async def process_batch(
    db: DBClient,
    tasks: List[Dict[str, Any]],
    concurrency: int = 3,
    dry_run: bool = False
) -> tuple[int, int]:
    """Process a batch of tasks with concurrency control."""
    
    sem = asyncio.Semaphore(concurrency)
    success_count = 0
    fail_count = 0
    
    async def process_one(task: Dict[str, Any]) -> bool:
        async with sem:
            return await regenerate_summary_v4(
                db,
                task_id=str(task["task_id"]),
                user_id=str(task["user_id"]),
                script_content=task["script_content"],
                video_title=task.get("video_title") or "",
                dry_run=dry_run
            )
    
    results = await asyncio.gather(*[process_one(t) for t in tasks], return_exceptions=True)
    
    for r in results:
        if r is True:
            success_count += 1
        else:
            fail_count += 1
    
    return success_count, fail_count


async def main():
    parser = argparse.ArgumentParser(description="Backfill V4 summaries")
    parser.add_argument("--task-id", help="Process a specific task ID")
    parser.add_argument("--limit", type=int, default=10, help="Max tasks to process (default: 10)")
    parser.add_argument("--concurrency", type=int, default=3, help="Parallel workers (default: 3)")
    parser.add_argument("--dry-run", action="store_true", help="List tasks without processing")
    parser.add_argument("--model", help="Override LLM model (e.g., gpt-4o)")
    parser.add_argument("--demo-only", action="store_true", help="Only process demo tasks")
    
    args = parser.parse_args()
    
    if args.model:
        settings.MODEL_ALIAS_SMART = args.model
        settings.MODEL_ALIAS_FAST = args.model
        logger.info(f"Using model override: {args.model}")
    
    db = DBClient()
    
    if args.task_id:
        task = find_single_task(db, args.task_id)
        if not task:
            logger.error(f"Task {args.task_id} not found or has no completed script")
            sys.exit(1)
        tasks = [task]
    else:
        tasks = find_tasks_needing_v4_summary(db, limit=args.limit, demo_only=args.demo_only)
    
    if not tasks:
        logger.info("No tasks need V4 summary backfill.")
        return
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Found {len(tasks)} task(s) needing V4 summary")
    logger.info(f"{'='*60}")
    
    for t in tasks:
        title = (t.get("video_title") or "Untitled")[:50]
        curr_ver = "None"
        if t.get("summary_content"):
            try:
                curr_ver = f"V{json.loads(t['summary_content']).get('version', '?')}"
            except:
                curr_ver = "Invalid"
        task_id_str = str(t['task_id'])
        logger.info(f"  {task_id_str[:8]}... | {curr_ver:6} | {title}")
    
    logger.info(f"{'='*60}\n")
    
    if args.dry_run:
        logger.info("[DRY-RUN] No changes made. Remove --dry-run to process.")
        return
    
    success, fail = await process_batch(db, tasks, args.concurrency, args.dry_run)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Completed: {success} success, {fail} failed")
    logger.info(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
