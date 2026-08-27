import os
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import sessionmaker, scoped_session
import json
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError
from utils.error_messages import sanitize_error_message

# Configure logging
logger = logging.getLogger(__name__)

# Pricing Constants
FREE_LIMIT = 3
PRO_LIMIT = 100


def _normalize_error_for_storage(error: str) -> str:
    if error == "":
        return ""
    return sanitize_error_message(error)

# REMOVED: GUEST_TRIAL_CACHE was an in-memory dict that could drift from DB.
# Guest usage is now tracked solely via the guest_usage table in the database.
# See dependencies.py for the unified guest usage functions.


class DBClient:
    def __init__(self):
        # JWT Secret for Supabase token verification (replaces supabase-py auth client)
        # Import settings lazily to avoid circular import at module level
        from config import settings
        self._jwt_secret = settings.SUPABASE_JWT_SECRET
        self._supabase_url = settings.SUPABASE_URL
        self._jwks_client: Optional[PyJWKClient] = None

        # Initialize JWKS client for ES256/RS256 support
        # Supabase exposes JWKS at /auth/v1/.well-known/jwks.json
        if self._supabase_url:
            jwks_url = f"{self._supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            self._jwks_client = PyJWKClient(jwks_url, cache_keys=True)

        if not self._jwt_secret and not self._jwks_client:
            logger.warning(
                "Neither SUPABASE_JWT_SECRET nor SUPABASE_URL set. "
                "Token validation will fail."
            )

        # SQLAlchemy Engine (Single connection pool for ALL data operations)
        # In production/dev, this should be the Supabase Transaction Pooler (port 6543) or Session Pooler (5432)
        # Format: postgresql://postgres.project:password@aws-0-region.pooler.supabase.com:6543/postgres
        self.db_url = os.environ.get("DATABASE_URL")
        self.engine: Optional[Engine] = None

        if self.db_url:
            try:
                connect_args: dict = {}
                if "pg8000" in self.db_url:
                    import ssl as _ssl
                    _ctx = _ssl.create_default_context()
                    _ctx.check_hostname = False
                    _ctx.verify_mode = _ssl.CERT_NONE
                    connect_args["ssl_context"] = _ctx

                self.engine = create_engine(
                    self.db_url, connect_args=connect_args,
                    pool_pre_ping=True, pool_size=10, max_overflow=20,
                )
                self.Session = scoped_session(sessionmaker(bind=self.engine))
                from urllib.parse import urlparse as _urlparse
                _parsed = _urlparse(self.db_url)
                logger.info(f"SQLAlchemy engine initialized for: {_parsed.hostname}:{_parsed.port}")
            except Exception as e:
                logger.error(f"Failed to initialize SQLAlchemy engine: {e}")
                self.engine = None
        else:
            logger.warning("DATABASE_URL not set. Data operations will fail.")
            self.engine = None

        # Lazy supabase-py client for backward compatibility (scripts only)
        self._supabase_lazy: Optional[Any] = None

    @property
    def supabase(self):
        """Lazy-loaded supabase-py client for scripts. Not used in main app flow."""
        if self._supabase_lazy is None:
            try:
                from supabase import create_client

                url = os.environ.get("SUPABASE_URL", "")
                key = os.environ.get("SUPABASE_SERVICE_KEY", "")
                if url and key:
                    self._supabase_lazy = create_client(url, key)
            except Exception as e:
                logger.warning(f"Lazy supabase client init failed: {e}")
        return self._supabase_lazy

    def _normalize_kind(self, kind: Any) -> str:
        if kind is None:
            return ""
        if hasattr(kind, "value"):
            return str(kind.value)
        return str(kind)

    def _execute_query(
        self, query_str: str, params: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Helper to execute safe parameterized queries."""
        if not self.engine:
            raise Exception("Database engine not initialized")

        session = self.Session()
        try:
            result = session.execute(text(query_str), params or {})
            session.commit()

            # Try to return dicts if it's a SELECT or RETURNING
            if result.returns_rows:
                return [dict(row._mapping) for row in result]
            return []
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def create_task(
        self,
        user_id: str,
        video_url: str,
        video_title: Optional[str] = None,
        is_demo: bool = False,
        publish_on_complete: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Create a new task row."""
        query = """
            INSERT INTO tasks (
                user_id, video_url, status, progress, video_title, is_demo,
                publication_status, publish_on_complete, workload_kind
            )
            VALUES (
                :user_id, :video_url, 'pending', 0, :video_title, :is_demo,
                :publication_status, :publish_on_complete, :workload_kind
            )
            RETURNING *;
        """
        rows = self._execute_query(
            query,
            {
                "user_id": user_id,
                "video_url": video_url,
                "video_title": video_title,
                "is_demo": is_demo,
                "publication_status": "processing" if is_demo else "private",
                "publish_on_complete": publish_on_complete if is_demo else False,
                "workload_kind": "catalog_supply" if is_demo else "user_submission",
            },
        )
        return rows[0] if rows else None

    def find_latest_inflight_task(
        self, user_id: str, video_url: str
    ) -> Optional[Dict[str, Any]]:
        """Find the newest pending/processing task for the same user and URL."""
        query = """
            SELECT *
            FROM tasks
            WHERE user_id = :user_id
              AND video_url = :video_url
              AND status IN ('pending', 'processing')
            ORDER BY created_at DESC
            LIMIT 1
        """
        rows = self._execute_query(
            query,
            {"user_id": user_id, "video_url": video_url},
        )
        return rows[0] if rows else None

    def create_task_output(
        self, task_id: str, user_id: str, kind: str, locale: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Create a new task_output row."""
        kind = self._normalize_kind(kind)
        query = """
            INSERT INTO task_outputs (task_id, user_id, kind, locale, status, progress, attempt)
            VALUES (:task_id, :user_id, :kind, :locale, 'pending', 0, 0)
            RETURNING *;
        """
        rows = self._execute_query(
            query,
            {"task_id": task_id, "user_id": user_id, "kind": kind, "locale": locale},
        )
        return rows[0] if rows else None

    def update_task_status(
        self,
        task_id: str,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        video_title: Optional[str] = None,
        thumbnail_url: Optional[str] = None,
        error: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """Update task status and progress."""
        fields = []
        params: Dict[str, Any] = {"task_id": task_id}

        if status:
            fields.append("status = :status")
            params["status"] = status
        if progress is not None:
            fields.append("progress = :progress")
            params["progress"] = progress
        if video_title is not None:
            fields.append("video_title = :video_title")
            params["video_title"] = video_title
        if thumbnail_url is not None:
            fields.append("thumbnail_url = :thumbnail_url")
            params["thumbnail_url"] = thumbnail_url
        if error is not None:
            fields.append("error_message = :error")
            params["error"] = _normalize_error_for_storage(error)

        # Metadata fields
        meta_mapping = {
            "author": "author",
            "author_url": "author_url",
            "author_image_url": "author_image_url",
            "description": "description",
            "keywords": "keywords",
            "view_count": "view_count",
            "upload_date": "upload_date",
            "duration": "duration",
        }
        for k, col in meta_mapping.items():
            val = kwargs.get(k)
            if val is not None:
                if k == "duration":
                    try:
                        val = int(float(val))
                    except (ValueError, TypeError):
                        val = 0
                fields.append(f"{col} = :{k}")
                params[k] = val

        if not fields:
            return

        fields.append("updated_at = now()")
        query = f"UPDATE tasks SET {', '.join(fields)} WHERE id = :task_id"

        rows = self._execute_query(f"{query} RETURNING id", params)
        if not rows:
            raise LookupError(f"Task {task_id} was not updated")

    def update_output_status(
        self,
        output_id: str,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        content: Optional[str] = None,
        error: Optional[str] = None,
        locale: Optional[str] = None,
        intent: Optional[Dict[str, Any]] = None,
        provenance: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Update output status, content, and progress."""
        fields = []
        params: Dict[str, Any] = {"output_id": output_id}

        if status:
            fields.append("status = :status")
            params["status"] = status
        if progress is not None:
            fields.append("progress = :progress")
            params["progress"] = progress
        if content is not None:
            fields.append("content = :content")
            params["content"] = content
        if error is not None:
            fields.append("error_message = :error")
            params["error"] = _normalize_error_for_storage(error)
        if locale is not None:
            fields.append("locale = :locale")
            params["locale"] = locale
        if intent is not None:
            fields.append("intent = CAST(:intent AS jsonb)")
            params["intent"] = json.dumps(intent, ensure_ascii=False)
        if provenance is not None:
            fields.append("provenance = CAST(:provenance AS jsonb)")
            params["provenance"] = json.dumps(provenance, ensure_ascii=False)

        fields.append("updated_at = now()")
        query = f"UPDATE task_outputs SET {', '.join(fields)} WHERE id = :output_id"

        rows = self._execute_query(f"{query} RETURNING id", params)
        if not rows:
            raise LookupError(f"Output {output_id} was not updated")

    def mark_task_failed_if_not_completed(self, task_id: str, error: str) -> bool:
        """Set a terminal task error without permitting completed -> error."""
        rows = self._execute_query(
            """
            UPDATE tasks
               SET status = 'error',
                   error_message = :error,
                   updated_at = now()
             WHERE id = :task_id
               AND status <> 'completed'
            RETURNING id
            """,
            {
                "task_id": task_id,
                "error": _normalize_error_for_storage(error),
            },
        )
        return bool(rows)

    def mark_output_failed_if_not_completed(
        self,
        output_id: str,
        error: str,
    ) -> bool:
        """Set a terminal output error without permitting completed -> error."""
        rows = self._execute_query(
            """
            UPDATE task_outputs
               SET status = 'error',
                   error_message = :error,
                   updated_at = now()
             WHERE id = :output_id
               AND status <> 'completed'
            RETURNING id
            """,
            {
                "output_id": output_id,
                "error": _normalize_error_for_storage(error),
            },
        )
        return bool(rows)

    def get_task_count(self, identifier: str) -> int:
        """Count tasks. For guest IDs, check the guest_usage table."""
        if not self.engine:
            return 0
        with self.engine.connect() as conn:
            # 1. Check guest_usage table first (X-Guest-Id)
            try:
                guest_query = text("SELECT usage_count FROM guest_usage WHERE guest_id = :id")
                guest_res = conn.execute(guest_query, {"id": identifier}).scalar()
                if guest_res is not None:
                    return int(guest_res)
            except (ProgrammingError, OperationalError):
                logger.warning(
                    "[db] guest_usage table not found — apply Supabase migrations"
                )

            # 2. Fallback to tasks table (Regular user_id — must be valid UUID)
            try:
                from uuid import UUID
                UUID(identifier)  # validate UUID format
            except (ValueError, AttributeError):
                return 0
            query = text("SELECT COUNT(*) FROM tasks WHERE user_id = :id")
            result = conn.execute(query, {"id": identifier}).scalar()
            return int(result or 0)

    def track_guest_trial(self, guest_id: str):
        """Mark a guest trial as used in the guest_usage table."""
        if not self.engine:
            return
        try:
            with self.engine.connect() as conn:
                query = text("""
                    INSERT INTO guest_usage (guest_id, usage_count)
                    VALUES (:id, 1)
                    ON CONFLICT (guest_id) DO UPDATE SET
                        usage_count = guest_usage.usage_count + 1,
                        updated_at = now();
                """)
                conn.execute(query, {"id": guest_id})
                conn.commit()
        except (ProgrammingError, OperationalError):
            logger.warning(
                "[db] guest_usage table not found — cannot track guest trial for %s",
                guest_id,
            )

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a task by ID."""
        # Explicitly select columns to avoid future schema changes breaking things or fetching unused heavy columns
        query = """
            SELECT
                id, user_id, guest_id, video_url, status, progress, video_title, thumbnail_url,
                error_message, created_at, updated_at, is_demo,
                publication_status, publish_on_complete, published_at,
                publication_block_reason,
                author, author_url, author_image_url, description, keywords,
                view_count, upload_date, duration, output_intent, workload_kind
            FROM tasks WHERE id = :task_id
        """
        rows = self._execute_query(query, {"task_id": task_id})
        logger.info(f"Task fetch result: {rows}")
        return rows[0] if rows else None

    def get_output(self, output_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a task_output by ID."""
        query = "SELECT * FROM task_outputs WHERE id = :output_id"
        rows = self._execute_query(query, {"output_id": output_id})
        return rows[0] if rows else None

    def get_task_outputs(self, task_id: str, include_content: bool = True) -> List[Dict[str, Any]]:
        """
        Fetch all outputs for a task.
        :param include_content: If False, excludes the heavy 'content' column.
        """
        if include_content:
            query = "SELECT * FROM task_outputs WHERE task_id = :task_id"
        else:
            query = """
                SELECT
                    id, task_id, user_id, kind, locale, status, progress,
                    attempt, error_message, created_at, updated_at
                FROM task_outputs WHERE task_id = :task_id
            """
        return self._execute_query(query, {"task_id": task_id})

    def find_latest_completed_task_by_url(
        self, video_url: str
    ) -> Optional[Dict[str, Any]]:
        """Find the most recent completed task with the same video_url."""
        query = """
            SELECT * FROM tasks 
            WHERE video_url = :video_url AND status = 'completed'
            ORDER BY created_at DESC LIMIT 1
        """
        rows = self._execute_query(query, {"video_url": video_url})
        return rows[0] if rows else None

    def find_latest_task_with_valid_script_for_owner(
        self,
        user_id: str,
        guest_id: Optional[str],
        video_url: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Find the newest reusable script for the exact task owner and URL.

        Guest tasks share a database user UUID, so guest ownership must also
        include guest_id. Authenticated tasks require guest_id IS NULL.
        """
        owner_predicate = (
            "t.guest_id IS NULL" if guest_id is None else "t.guest_id = :guest_id"
        )
        query = f"""
            SELECT t.*
            FROM tasks t
            JOIN task_outputs o ON o.task_id = t.id
            WHERE t.user_id = :user_id
              AND {owner_predicate}
              AND t.video_url = :video_url
              AND o.kind = 'script'
              AND o.status = 'completed'
              AND o.content IS NOT NULL
              AND NULLIF(BTRIM(CAST(o.content AS TEXT)), '') IS NOT NULL
              AND BTRIM(CAST(o.content AS TEXT)) <> 'null'
            ORDER BY t.created_at DESC
            LIMIT 1
        """
        params = {"user_id": user_id, "video_url": video_url}
        if guest_id is not None:
            params["guest_id"] = guest_id
        rows = self._execute_query(query, params)
        return rows[0] if rows else None

    def create_completed_task_output(
        self,
        task_id: str,
        user_id: str,
        kind: str,
        content: str,
        locale: Optional[str] = None,
        raw_data: Optional[Dict] = None,
    ) -> Optional[Dict[str, Any]]:
        """Create a new task_output row that is already completed (for caching)."""
        kind = self._normalize_kind(kind)
        query = """
            INSERT INTO task_outputs (task_id, user_id, kind, locale, status, progress, content, attempt)
            VALUES (:task_id, :user_id, :kind, :locale, 'completed', 100, :content, 0)
            RETURNING *;
        """
        rows = self._execute_query(
            query,
            {
                "task_id": task_id,
                "user_id": user_id,
                "kind": kind,
                "locale": locale,
                "content": content,
            },
        )
        return rows[0] if rows else None

    def upsert_completed_task_output(
        self, task_id: str, user_id: str, kind: str, content: str, locale: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Upsert a task_output row that is already completed (for caching or overwriting)."""
        kind = self._normalize_kind(kind)
        # First check if it exists (placeholder or failed previous attempt)
        check_q = "SELECT id FROM task_outputs WHERE task_id = :tid AND kind = :kind"
        params = {"tid": task_id, "kind": kind}

        # Locale matching logic
        if locale:
            check_q += " AND LOWER(locale) = LOWER(:loc)"
            params["loc"] = locale
        else:
            check_q += " AND locale IS NULL"

        existing = self._execute_query(check_q, params)
        if existing:
            oid = existing[0]["id"]
            self.update_output_status(
                oid, status="completed", progress=100, content=content
            )
            return self.get_output(oid)
        else:
            return self.create_completed_task_output(
                task_id, user_id, kind, content, locale
            )

    def ensure_task_outputs(
        self, task_id: str, user_id: str, kinds: List[str], locale: Optional[str] = None
    ) -> None:
        """Ensure specific output placeholders exist for a task (Phase 0)."""
        current_outputs = self.get_task_outputs(task_id)
        existing_kinds = set(o["kind"] for o in current_outputs)

        for k in kinds:
            kind = self._normalize_kind(k)
            if kind not in existing_kinds:
                self.create_task_output(task_id, user_id, kind=kind, locale=locale)

    def update_task_output_by_kind(
        self,
        task_id: str,
        kind: str,
        content: Optional[str] = None,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        error: Optional[str] = None,
    ) -> None:
        """Convenience: Update output by task_id + kind using a single SQL UPDATE."""
        kind = self._normalize_kind(kind)

        fields = []
        params: Dict[str, Any] = {"task_id": task_id, "kind": kind}

        if status is not None:
            fields.append("status = :status")
            params["status"] = status
        if progress is not None:
            fields.append("progress = :progress")
            params["progress"] = progress
        if content is not None:
            fields.append("content = :content")
            params["content"] = content
        if error is not None:
            fields.append("error_message = :error")
            params["error"] = _normalize_error_for_storage(error)

        if not fields:
            return

        fields.append("updated_at = now()")
        query = (
            f"UPDATE task_outputs SET {', '.join(fields)} "
            f"WHERE task_id = :task_id AND kind = :kind RETURNING id"
        )
        rows = self._execute_query(query, params)
        if not rows:
            raise LookupError(
                f"Output kind '{kind}' for task {task_id} was not updated"
            )

    def is_auth_configured(self) -> bool:
        """Check whether JWT secret or JWKS client is available for token validation."""
        return bool(self._jwt_secret) or bool(self._jwks_client)

    def validate_token(self, token: str) -> Optional[str]:
        """Validate Supabase JWT and return user_id.

        Supports both HS256 (legacy symmetric) and ES256/RS256 (asymmetric via JWKS).
        Detects algorithm from token header and routes to the appropriate verification path.
        """
        if token.startswith("Bearer "):
            token = token.split(" ")[1]

        # Log token preview for debugging (first 20 chars only)
        token_preview = token[:20] + "..." if len(token) > 20 else token
        logger.debug(f"Validating token: {token_preview}")

        # Detect algorithm from token header
        try:
            header = jwt.get_unverified_header(token)
            alg = header.get("alg", "HS256")
        except jwt.DecodeError:
            logger.error("Failed to decode token header")
            return None

        try:
            if alg == "HS256" and self._jwt_secret:
                # Legacy HS256 path (symmetric HMAC)
                payload = jwt.decode(
                    token,
                    self._jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                )
            elif self._jwks_client:
                # ES256/RS256 path via JWKS (asymmetric)
                signing_key = self._jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256", "RS256"],
                    audience="authenticated",
                )
            else:
                logger.error(
                    f"No suitable key material for token validation (alg={alg})"
                )
                return None

            user_id = payload.get("sub")
            if user_id:
                return str(user_id)
            logger.warning("JWT decoded but 'sub' claim is missing")
            return None
        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return None
        except (PyJWKClientConnectionError, PyJWKClientError) as e:
            logger.error(f"JWKS key fetch failed: {e}")
            return None
        except jwt.InvalidTokenError as e:
            logger.error(f"Token validation failed: {e}")
            return None

    def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch user profile including credits and tier."""
        query = "SELECT * FROM profiles WHERE id = :user_id"
        rows = self._execute_query(query, {"user_id": user_id})

        if not rows:
            # Create default profile if missing
            try:
                # Assuming trigger fails or we are in a test env without triggers
                insert_q = """
                    INSERT INTO profiles (id, tier, usage_limit)
                    VALUES (:id, 'free', 3)
                    RETURNING *;
                """
                rows = self._execute_query(insert_q, {"id": user_id})
                return rows[0] if rows else None
            except Exception as e:
                logger.error(f"Failed to create profile: {e}")
                return None
        return rows[0]

    def check_and_consume_quota(self, user_id: str) -> bool:
        """
        Check if user has quota or credits. If yes, consume 1 and return True.
        """
        profile = self.get_profile(user_id)
        if not profile:
            return False

        usage = profile.get("usage_count", 0)
        limit = profile.get("usage_limit", 3)
        extra = profile.get("extra_credits", 0)

        # 1. Check Monthly Quota
        if usage < limit:
            update_q = (
                "UPDATE profiles SET usage_count = usage_count + 1 WHERE id = :id"
            )
            try:
                self._execute_query(update_q, {"id": user_id})
                return True
            except Exception as e:
                logger.error(f"Failed to update usage: {e}")
                return False

        # 2. Check Extra Credits
        if extra > 0:
            update_q = (
                "UPDATE profiles SET extra_credits = extra_credits - 1 WHERE id = :id"
            )
            try:
                self._execute_query(update_q, {"id": user_id})
                return True
            except Exception as e:
                logger.error(f"Failed to update extra credits: {e}")
                return False

        return False

    def add_credits(self, user_id: str, amount: int):
        """Add one-time credits to a user."""
        query = (
            "UPDATE profiles SET extra_credits = extra_credits + :amount WHERE id = :id"
        )
        try:
            self._execute_query(query, {"id": user_id, "amount": amount})
        except Exception as e:
            logger.error(f"Failed to add credits: {e}")

    def update_subscription(self, creem_customer_id: str, tier: str, period_end: str):
        """Update subscription status from Creem Webhook (by customer id)."""
        limit = 100 if tier == "pro" else 3
        query = """
            UPDATE profiles 
            SET tier = :tier, usage_limit = :limit, usage_count = 0, period_end = :period_end
            WHERE creem_customer_id = :cid
        """
        try:
            self._execute_query(
                query,
                {
                    "tier": tier,
                    "limit": limit,
                    "period_end": period_end,
                    "cid": creem_customer_id,
                },
            )
        except Exception as e:
            logger.error(f"Failed to update subscription: {e}")

    def update_subscription_by_user(self, user_id: str, tier: str, period_end: str):
        """Update subscription status by user_id (for first-time subscriptions)."""
        limit = 100 if tier == "pro" else 3
        query = """
            UPDATE profiles 
            SET tier = :tier, usage_limit = :limit, usage_count = 0, period_end = :period_end
            WHERE id = :uid
        """
        try:
            self._execute_query(
                query,
                {
                    "tier": tier,
                    "limit": limit,
                    "period_end": period_end,
                    "uid": user_id,
                },
            )
        except Exception as e:
            logger.error(f"Failed to update subscription by user: {e}")

    def link_creem_customer(self, user_id: str, creem_customer_id: str):
        """Link a Creem Customer ID to a user."""
        query = "UPDATE profiles SET creem_customer_id = :cid WHERE id = :uid"
        try:
            self._execute_query(query, {"cid": creem_customer_id, "uid": user_id})
        except Exception as e:
            logger.error(f"Failed to link creem customer: {e}")

    # -------------------------------------------------------------------------
    # Payment / Order Methods (Unified)
    # -------------------------------------------------------------------------
    def create_payment_order(
        self,
        user_id: str,
        provider: str,
        amount_fiat: float,
        currency_fiat: str = "USD",
    ) -> Optional[Dict[str, Any]]:
        """Create a new payment order."""
        query = """
            INSERT INTO payment_orders (user_id, provider, amount_fiat, currency_fiat, status)
            VALUES (:uid, :prov, :amt, :curr, 'pending')
            RETURNING *;
        """
        rows = self._execute_query(
            query,
            {
                "uid": user_id,
                "prov": provider,
                "amt": amount_fiat,
                "curr": currency_fiat,
            },
        )
        return rows[0] if rows else None

    def update_payment_order(
        self,
        order_id: str,
        provider_payment_id: Optional[str] = None,
        status: Optional[str] = None,
        amount_crypto: Optional[float] = None,
        currency_crypto: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> None:
        """Update payment order details."""
        fields = []
        params: Dict[str, Any] = {"oid": order_id}

        if provider_payment_id:
            fields.append("provider_payment_id = :pid")
            params["pid"] = provider_payment_id
        if status:
            fields.append("status = :status")
            params["status"] = status
        if amount_crypto is not None:
            fields.append("amount_crypto = :ac")
            params["ac"] = amount_crypto
        if currency_crypto:
            fields.append("currency_crypto = :cc")
            params["cc"] = currency_crypto
        if metadata:
            fields.append("metadata = :meta")
            params["meta"] = json.dumps(metadata)

        if not fields:
            return
        fields.append("updated_at = now()")

        query = f"UPDATE payment_orders SET {', '.join(fields)} WHERE id = :oid"
        try:
            self._execute_query(query, params)
        except Exception as e:
            logger.error(f"Failed to update payment order: {e}")

    def get_payment_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM payment_orders WHERE id = :oid"
        rows = self._execute_query(query, {"oid": order_id})
        return rows[0] if rows else None

    def get_payment_order_by_provider_id(
        self, provider_payment_id: str
    ) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM payment_orders WHERE provider_payment_id = :pid"
        rows = self._execute_query(query, {"pid": provider_payment_id})
        return rows[0] if rows else None

    # -------------------------------------------------------------------------
    # Chat Module Methods
    # -------------------------------------------------------------------------

    def create_chat_thread(
        self, user_id: str, task_id: str, title: str
    ) -> Optional[Dict[str, Any]]:
        """Create a new chat thread."""
        query = """
            INSERT INTO chat_threads (user_id, task_id, title)
            VALUES (:uid, :tid, :title)
            RETURNING *;
        """
        rows = self._execute_query(
            query, {"uid": user_id, "tid": task_id, "title": title}
        )
        return rows[0] if rows else None

    def list_chat_threads(
        self,
        user_id: str,
        task_id: str,
        status_filter: str = "!=deleted",
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """List threads with flexible status filtering."""
        base_query = """
            SELECT * FROM chat_threads
            WHERE user_id = :uid AND task_id = :tid
        """
        params = {"uid": user_id, "tid": task_id, "limit": limit}

        if status_filter == "!=deleted":
            base_query += " AND status != 'deleted'"
        elif status_filter == "active":
            base_query += " AND status = 'active'"
        elif status_filter == "archived":
            base_query += " AND status = 'archived'"
        elif status_filter == "deleted":
            base_query += " AND status = 'deleted'"

        # Sort by updated_at desc (Sidebar order)
        base_query += " ORDER BY updated_at DESC LIMIT :limit"

        return self._execute_query(base_query, params)

    def get_chat_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        """Get a single thread."""
        query = "SELECT * FROM chat_threads WHERE id = :tid"
        rows = self._execute_query(query, {"tid": thread_id})
        return rows[0] if rows else None

    def update_chat_thread(
        self,
        thread_id: str,
        title: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update a thread's title, status, or metadata."""
        fields = []
        params: Dict[str, Any] = {"tid": thread_id}

        if title:
            fields.append("title = :title")
            params["title"] = title
        if status:
            fields.append("status = :status")
            params["status"] = status
        if metadata:
            fields.append("metadata = metadata || :meta")
            params["meta"] = json.dumps(metadata)

        if not fields:
            return self.get_chat_thread(thread_id)

        fields.append("updated_at = now()")
        query = (
            f"UPDATE chat_threads SET {', '.join(fields)} WHERE id = :tid RETURNING *"
        )
        rows = self._execute_query(query, params)
        return rows[0] if rows else None

    def soft_delete_chat_thread(self, thread_id: str):
        """Soft delete a thread."""
        query = "UPDATE chat_threads SET status = 'deleted', updated_at = now() WHERE id = :tid"
        self._execute_query(query, {"tid": thread_id})
