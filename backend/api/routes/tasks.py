import logging

from db_client import DBClient
from dependencies import (
    get_current_user,
    get_db_client,
    get_task_queue,
)
from fastapi import APIRouter, Body, Depends, Form, Header, HTTPException
from services.output_intent import build_output_intent
from services.task_queue import GuestQuotaExceededError, TaskQueue
from utils.url import normalize_video_url

router = APIRouter()
logger = logging.getLogger(__name__)
GUEST_DATABASE_USER_ID = "00000000-0000-0000-0000-000000000001"


@router.post("/process-video")
def process_video(
    video_url: str = Form(...),
    request_text: str | None = Form(None),
    ui_locale: str | None = Form(None),
    user_id: str = Depends(get_current_user),
    authorization: str | None = Header(None),
    x_guest_id: str | None = Header(None, alias="X-Guest-Id"),
    queue: TaskQueue = Depends(get_task_queue),
):
    """Create and durably enqueue a video-processing task."""
    video_url = normalize_video_url(video_url)
    if not video_url:
        raise HTTPException(status_code=400, detail="Invalid video URL")

    is_guest = authorization is None or not authorization.startswith("Bearer ")
    database_user_id = GUEST_DATABASE_USER_ID if is_guest else user_id
    output_intent = build_output_intent(request_text or video_url, ui_locale)

    try:
        submission = queue.submit_process_video(
            video_url=video_url,
            user_id=database_user_id,
            guest_id=x_guest_id if is_guest else None,
            output_intent=output_intent,
        )
        task_id = submission.task_id

        if submission.resolution == "reused_inflight":
            logger.info("Reusing in-flight task %s for %s", task_id, video_url)
            return {"task_id": task_id, "message": "Task already in progress"}

        if submission.resolution == "reused_completed":
            logger.info("Reusing completed task %s for %s", task_id, video_url)
            return {"task_id": task_id, "message": "Task already processed"}

        logger.info("Created task %s for %s", task_id, user_id)
        return {"task_id": task_id, "message": "Task queued"}

    except GuestQuotaExceededError as exc:
        raise HTTPException(status_code=402, detail="Guest quota exceeded") from exc
    except Exception as exc:
        logger.exception("Error creating or enqueueing task: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Task queue is temporarily unavailable",
        ) from exc


@router.post("/retry-output")
def retry_output(
    output_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    authorization: str | None = Header(None),
    x_guest_id: str | None = Header(None, alias="X-Guest-Id"),
    db: DBClient = Depends(get_db_client),
    queue: TaskQueue = Depends(get_task_queue),
):
    """Retry a specific output."""
    output = db.get_output(output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    task = db.get_task(str(output["task_id"]))
    is_guest = authorization is None or not authorization.startswith("Bearer ")
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if is_guest:
        if not x_guest_id or task.get("guest_id") != x_guest_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        database_user_id = GUEST_DATABASE_USER_ID
    elif str(output.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    else:
        database_user_id = user_id

    try:
        queue.submit_retry_output(
            output_id=output_id,
            user_id=database_user_id,
            guest_id=x_guest_id if is_guest else None,
        )
    except Exception as exc:
        logger.exception("Failed to enqueue output retry %s", output_id)
        raise HTTPException(
            status_code=503,
            detail="Task queue is temporarily unavailable",
        ) from exc
    return {"message": "Retry queued"}


@router.patch("/tasks/{task_id}")
def update_task_title(
    task_id: str,
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user),
    authorization: str | None = Header(None),
    x_guest_id: str | None = Header(None, alias="X-Guest-Id"),
    db: DBClient = Depends(get_db_client),
):
    """Update task title."""
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    is_guest = authorization is None or not authorization.startswith("Bearer ")
    is_owner = (
        task.get("guest_id") == x_guest_id
        if is_guest
        else str(task.get("user_id")) == user_id
    )
    if not is_owner:
        raise HTTPException(status_code=403, detail="Unauthorized")

    new_title = payload.get("video_title")
    if new_title:
        db.update_task_status(task_id, video_title=new_title)
    return {"status": "success"}


@router.get("/tasks/{task_id}/status")
def get_task_status(
    task_id: str,
    user_id: str = Depends(get_current_user),
    authorization: str | None = Header(None),
    x_guest_id: str | None = Header(None, alias="X-Guest-Id"),
    db: DBClient = Depends(get_db_client),
):
    """Get current task status."""
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    is_guest = authorization is None or not authorization.startswith("Bearer ")
    is_owner = (
        task.get("guest_id") == x_guest_id
        if is_guest
        else str(task.get("user_id")) == user_id
    )
    if not is_owner and not task.get("is_demo"):
        raise HTTPException(status_code=403, detail="Unauthorized")
    return task
