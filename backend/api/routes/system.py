import logging
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel

from dependencies import get_db_client, get_notifier
from services.notifier import Notifier
from db_client import DBClient

router = APIRouter()
logger = logging.getLogger(__name__)

TASK_SUBMISSION_READINESS_SQL = """
select
  to_regprocedure(
    'vibedigest_private.submit_video_task(uuid,text,text,integer,jsonb,text)'
  ) is not null as submission_function_ready,
  to_regnamespace('pgmq') is not null as queue_schema_ready,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks'
       and column_name = 'output_intent'
  ) as task_intent_ready,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'task_outputs'
       and column_name = 'intent'
  ) as output_intent_ready,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'task_outputs'
       and column_name = 'provenance'
  ) as output_provenance_ready,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'usage_reset_at'
  ) as monthly_quota_ready
"""

class FeedbackModel(BaseModel):
    category: str
    message: str
    contact_email: Optional[str] = None

@router.get("/")
async def read_root():
    return {"status": "VibeDigest API is running", "docs": "/docs"}

@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring and dev scripts."""
    return {"status": "healthy", "service": "vibedigest-backend"}


@router.get("/health/ready")
async def readiness_check(db: DBClient = Depends(get_db_client)):
    """Only report ready when the API's private task-submission contract exists."""
    try:
        rows = db._execute_query(TASK_SUBMISSION_READINESS_SQL)
    except Exception:
        logger.warning("Readiness contract query failed")
        raise HTTPException(status_code=503, detail="Service is not ready")

    contract = rows[0] if rows else {}
    if not all(contract.get(key) is True for key in (
        "submission_function_ready",
        "queue_schema_ready",
        "task_intent_ready",
        "output_intent_ready",
        "output_provenance_ready",
        "monthly_quota_ready",
    )):
        logger.error("Task submission database contract is not ready")
        raise HTTPException(status_code=503, detail="Service is not ready")

    return {"status": "ready", "service": "vibedigest-backend"}

@router.post("/api/feedback")
async def submit_feedback(
    background_tasks: BackgroundTasks,
    feedback: FeedbackModel,
    authorization: Optional[str] = Header(None),
    db: DBClient = Depends(get_db_client),
    notifier: Notifier = Depends(get_notifier)
):
    """
    Submit user feedback/complaint.
    Allows anonymous submissions for landing page visitors.
    """
    # Try to get user_id from token, fallback to "anonymous" if not logged in
    user_id = "anonymous"
    if authorization:
        validated_user = db.validate_token(authorization)
        if validated_user:
            user_id = validated_user

    # logger is not imported yet, need to setup logging or print
    # Using print for now as per main.py logic or rely on root logger configuration in main
    # But better to get a logger
    import logging
    logger = logging.getLogger(__name__)

    logger.info(
        f"FEEDBACK [{feedback.category}] from {user_id}: {feedback.message} (Contact: {feedback.contact_email})"
    )

    # Send email in background
    background_tasks.add_task(
        notifier.send_feedback_email,
        feedback.category,
        feedback.message,
        user_id,
        feedback.contact_email,
    )

    return {"status": "received", "message": "Thank you for your feedback!"}
