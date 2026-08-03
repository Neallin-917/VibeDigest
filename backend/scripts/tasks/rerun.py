#!/usr/bin/env python3
"""
Rerun tasks by ID or batch rerun demo tasks.
Standardizes the rerun process using the modern workflow architecture.

Usage:
    python backend/scripts/tasks/rerun.py --id <task_id>
    python backend/scripts/tasks/rerun.py --demo
"""

import asyncio
import sys
import os
import argparse
import logging
from typing import cast

# Setup path to import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from utils.env_loader import load_env
load_env()

from db_client import DBClient
from workflow import app, VideoProcessingState

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

async def run_single_task(task_id: str, db: DBClient):
    task = db.get_task(task_id)
    if not task:
        logger.error(f"Task {task_id} not found.")
        return

    logger.info(f"Preparing rerun for: {task_id} ({task.get('video_title')})")
    
    # Reset status
    db.update_task_status(task_id, status="processing", progress=5)
    
    # Reset outputs
    outputs = db.get_task_outputs(task_id)
    for o in outputs:
        db.update_output_status(o['id'], status="pending", progress=0, content=None)

    # Initialize State
    initial_state = cast(VideoProcessingState, {
        "task_id": task_id,
        "user_id": task['user_id'],
        "video_url": task['video_url'],
        "video_title": task.get('video_title') or "",
        "thumbnail_url": task.get('thumbnail_url') or "",
        "author": task.get('author') or "",
        "duration": float(task.get('duration') or 0),
        "audio_path": None,
        "direct_audio_url": None,
        "transcript_text": None,
        "transcript_raw": None,
        "transcript_lang": "",
        "final_summary_json": None,
        "cache_hit": False,
        "is_youtube": True,
        "errors": [],
    })

    logger.info("--- Starting Workflow ---")
    final_state = await app.ainvoke(initial_state)
    
    if final_state.get('errors'):
        logger.error(f"Workflow finished with errors: {final_state['errors']}")
    else:
        logger.info("Workflow SUCCESS.")

async def run_demo_tasks():
    logger.info("Starting Demo Task Rerun...")
    # Force strategy if needed, or stick to default
    # settings.SUMMARY_STRATEGY = "v2_classified" 
    
    db = DBClient()
    query = "SELECT * FROM tasks WHERE is_demo = true ORDER BY created_at DESC"
    tasks = db._execute_query(query)
    
    if not tasks:
        logger.warning("No demo tasks found.")
        return

    logger.info(f"Found {len(tasks)} demo tasks.")
    
    # Process sequentially/concurrently
    sem = asyncio.Semaphore(3) # Limit concurrency
    
    async def limited_run(t):
        async with sem:
            await run_single_task(t['id'], db)

    await asyncio.gather(*[limited_run(t) for t in tasks])
    logger.info("All demo tasks processed.")

async def main():
    parser = argparse.ArgumentParser(description="Rerun VibeDigest Tasks")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--id", help="Task ID to rerun")
    group.add_argument("--demo", action="store_true", help="Rerun all demo tasks")
    
    args = parser.parse_args()
    
    if args.id:
        db = DBClient()
        await run_single_task(args.id, db)
    elif args.demo:
        await run_demo_tasks()

if __name__ == "__main__":
    asyncio.run(main())
