import logging
import os
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Form, HTTPException, BackgroundTasks, Body, Header

from dependencies import get_current_user, get_db_client, get_video_processor
from db_client import DBClient
from services.video_processor import VideoProcessor
from utils.url import normalize_video_url
from services.background_tasks import run_pipeline, handle_retry_output
from constants import TaskStatus

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/preview-video")
async def preview_video(
    url: str = Form(...),
    user_id: str = Depends(get_current_user),
    video_processor: VideoProcessor = Depends(get_video_processor)
):
    """Get video metadata without full processing."""
    try:
        logger.info(f"Preview video request received for URL: {url}")
        normalized_url = normalize_video_url(url)
        if not normalized_url:
            raise HTTPException(status_code=400, detail="Invalid video URL")

        info = await video_processor.extract_info_only(normalized_url)
        return {
            "title": info.get("title", "Unknown"),
            "thumbnail": info.get("thumbnail", ""),
            "duration": info.get("duration", 0),
            "author": info.get("author", "Unknown"),
            "url": normalized_url,
        }
    except HTTPException:
        raise  # 不 re-wrap 已经是 HTTPException 的错误（如 "Invalid video URL"）
    except Exception as e:
        logger.warning(f"Preview video failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process-video")
async def process_video(
    background_tasks: BackgroundTasks,
    video_url: str = Form(...),
    user_id: str = Depends(get_current_user),
    authorization: Optional[str] = Header(None),
    db: DBClient = Depends(get_db_client)
):
    """Start video processing. Quota is handled by get_current_user dependency."""
    video_url = normalize_video_url(video_url)
    if not video_url:
        raise HTTPException(status_code=400, detail="Invalid video URL")

    # Determine identity for DB
    is_guest = authorization is None or not authorization.startswith("Bearer ")
    db_user_id = "00000000-0000-0000-0000-000000000001" if is_guest else user_id

    try:
        # 1. Create Task
        task = db.create_task(user_id=db_user_id, video_url=video_url)
        if not task:
            raise HTTPException(status_code=500, detail="Failed to create task")
        task_id = str(task["id"])

        # 1.1 Mark usage if guest
        if is_guest:
            from dependencies import increment_guest_usage
            increment_guest_usage(user_id, db)  # user_id is the unique guest UUID

        # 1.2 Create Essential Placeholders
        db.create_task_output(task_id, db_user_id, kind="script")
        db.create_task_output(task_id, db_user_id, kind="summary")
        db.create_task_output(task_id, db_user_id, kind="comprehension_brief")

        logger.info(f"Created task {task_id} for {user_id}")

        # 2. Pipeline
        background_tasks.add_task(run_pipeline, task_id, video_url, db_user_id)
        return {"task_id": task_id, "message": "Task started"}

    except Exception as e:
        logger.error(f"Error creating task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/retry-output")
async def retry_output(
    background_tasks: BackgroundTasks,
    output_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    db: DBClient = Depends(get_db_client)
):
    """Retry a specific output."""
    db.update_output_status(output_id, status="pending", progress=0, error="")
    background_tasks.add_task(handle_retry_output, output_id, user_id)
    return {"message": "Retry queued"}

@router.patch("/tasks/{task_id}")
async def update_task_title(
    task_id: str,
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user),
    db: DBClient = Depends(get_db_client)
):
    """Update task title."""
    task = db.get_task(task_id)
    if not task or task["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    new_title = payload.get("video_title")
    if new_title:
        db.update_task_status(task_id, video_title=new_title)
    return {"status": "success"}

@router.get("/tasks/{task_id}/status")
async def get_task_status(
    task_id: str,
    user_id: str = Depends(get_current_user),
    db: DBClient = Depends(get_db_client),
):
    """Get current task status."""
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task