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
    'vibedigest_private.submit_user_video_task(uuid,text,text,integer,jsonb,text)'
  ) is not null
  and to_regprocedure(
    'vibedigest_private.submit_catalog_video_task(uuid,text,jsonb,text,boolean)'
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
  ) as monthly_quota_ready,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks'
       and column_name = 'publication_status'
  ) as publication_status_ready,
  to_regclass('public.podcast_sources') is not null as podcast_sources_ready,
  to_regclass('public.podcast_episodes') is not null as podcast_episodes_ready,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tasks'
       and column_name = 'workload_kind'
  ) as workload_kind_ready,
  exists (
    select 1 from pgmq.list_queues()
     where queue_name = 'podcast_supply'
  ) as catalog_queue_ready,
  to_regprocedure(
    'vibedigest_private.retry_video_task(uuid,uuid,text,text,text)'
  ) is not null
  and to_regprocedure(
    'vibedigest_private.submit_output_retry(uuid,uuid,text,text,text)'
  ) is not null as retry_routing_ready,
  to_regprocedure(
    'vibedigest_private.accept_agent_turn(uuid,uuid,text,jsonb,text,uuid,jsonb,text,text[])'
  ) is not null and to_regprocedure(
    'vibedigest_private.claim_agent_continuation(uuid,uuid,text,bigint,integer)'
  ) is not null as agent_turns_ready,
  exists (
    select 1 from pg_publication_tables pt
      join pg_publication p on p.pubname = pt.pubname
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
      and pt.tablename = 'chat_messages' and p.pubinsert and p.pubupdate
  ) as chat_realtime_ready
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
        "publication_status_ready",
        "podcast_sources_ready",
        "podcast_episodes_ready",
        "workload_kind_ready",
        "catalog_queue_ready",
        "retry_routing_ready",
        "agent_turns_ready",
        "chat_realtime_ready",
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
