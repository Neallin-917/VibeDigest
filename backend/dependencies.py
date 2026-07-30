from functools import lru_cache
import logging
from typing import Optional
from fastapi import Header, HTTPException, Depends
from coinbase_commerce.client import Client as CoinbaseClient

from db_client import DBClient
from config import settings
from services.notifier import Notifier
from services.supadata_client import SupadataClient
from services.summarizer import Summarizer
from services.task_queue import PostgresTaskQueue, TaskQueue
from services.transcriber import Transcriber
from services.video_processor import VideoProcessor

logger = logging.getLogger(__name__)

# Guest usage is tracked solely via the guest_usage DB table.
# No more in-memory dicts — the database is the single source of truth.


@lru_cache()
def get_db_client() -> DBClient:
    return DBClient()


def get_task_queue(
    db: DBClient = Depends(get_db_client),
) -> TaskQueue:
    return PostgresTaskQueue(db)


@lru_cache()
def get_video_processor() -> VideoProcessor:
    return VideoProcessor()


@lru_cache()
def get_transcriber() -> Transcriber:
    return Transcriber()


@lru_cache()
def get_summarizer() -> Summarizer:
    return Summarizer()


@lru_cache()
def get_notifier() -> Notifier:
    return Notifier()


@lru_cache()
def get_supadata_client() -> SupadataClient:
    return SupadataClient()


@lru_cache()
def get_coinbase_client() -> CoinbaseClient:
    return CoinbaseClient(api_key=settings.COINBASE_API_KEY)


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
    db: DBClient = Depends(get_db_client),
) -> str:
    """Identify the caller; task quota is enforced atomically at submission."""
    if settings.MOCK_MODE:
        return "00000000-0000-0000-0000-000000000001"

    # 1. AUTHENTICATED (Bearer token present)
    if authorization and authorization.startswith("Bearer "):
        if not db.is_auth_configured():
            logger.error("Authentication service misconfigured: SUPABASE_JWT_SECRET is missing")
            raise HTTPException(
                status_code=503,
                detail="Authentication service misconfigured. Contact the administrator.",
            )
        user_id = db.validate_token(authorization)
        if user_id:
            return user_id
        raise HTTPException(status_code=401, detail="Invalid Token")

    # 2. GUEST (X-Guest-Id present). The queue submission transaction is the
    # only authority for quota and same-URL reuse decisions.
    if x_guest_id:
        return x_guest_id

    # 3. No usable identity. Do not fall back to a shared user, because that
    # bypasses guest quota and makes task ownership ambiguous.
    raise HTTPException(status_code=401, detail="Authentication or guest identity required")
