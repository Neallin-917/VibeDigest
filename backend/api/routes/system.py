from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Header
from pydantic import BaseModel

from dependencies import get_db_client, get_notifier
from services.notifier import Notifier
from db_client import DBClient

router = APIRouter()

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
