import os
from pathlib import Path

from loguru import logger

from utils.logging import configure_logging
from utils.env_loader import load_env

# Load environment variables before other local imports.
# Priority: shell env > .env.local > .env (shell vars are never overridden)
load_env()

configure_logging()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from api.routes import system, tasks, webhooks, payments

# Skip Sentry initialisation during pytest runs to avoid polluting the project
# with test noise and to keep unit tests hermetic.
if settings.SENTRY_DSN and not os.getenv("PYTEST_CURRENT_TEST"):
    from utils.sentry_config import init_sentry
    init_sentry(settings.SENTRY_DSN)

app = FastAPI(title="VibeDigest API (v2)", version="2.0.0")

@app.on_event("startup")
async def startup_event():
    # Fail-fast: require SUPABASE_JWT_SECRET in production
    dev_bypass = os.getenv("DEV_AUTH_BYPASS", "").strip().lower() in {"1", "true", "yes"}
    if not settings.MOCK_MODE and not dev_bypass and not settings.SUPABASE_JWT_SECRET:
        raise RuntimeError(
            "SUPABASE_JWT_SECRET is required when MOCK_MODE and DEV_AUTH_BYPASS are disabled. "
            "Set it to your Supabase project's JWT secret (Settings → API → JWT Secret)."
        )

    logger.info(">>> VibeDigest Backend Starting <<<")
    logger.info(f"LLM Provider:  {settings.LLM_PROVIDER}")
    logger.info(f"Smart Model:   {settings.MODEL_SMART} (Temp: {settings.REASONING_TEMPERATURE})")
    logger.info(f"Fast Model:    {settings.MODEL_FAST} (Temp: {settings.DEFAULT_TEMPERATURE})")
    logger.info(f"OpenAI Base:   {settings.OPENAI_BASE_URL or 'Default'}")
    logger.info(f"JWT Secret:    {'configured' if settings.SUPABASE_JWT_SECRET else 'MISSING'}")
    logger.info(">>> --------------------------- <<<")

# CORS Configuration
# Default to production and localhost
DEFAULT_ORIGINS = [
    "https://vibedigest.io",
    "https://www.vibedigest.io",
    "http://localhost:3000",
]
# Allow override via env (comma-separated), fallback to defaults if not set.
env_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [
    o.strip() for o in env_origins.split(",") if o.strip()
] or DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from utils.timing_middleware import TimingMiddleware
app.add_middleware(TimingMiddleware)

# Project Paths
PROJECT_ROOT = Path(__file__).parent.parent
TEMP_DIR = PROJECT_ROOT / "temp"
TEMP_DIR.mkdir(exist_ok=True)

# Include Routers
app.include_router(system.router, tags=["System"])
app.include_router(tasks.router, prefix="/api", tags=["Tasks"])
app.include_router(payments.router, prefix="/api", tags=["Payments"])
app.include_router(webhooks.router, prefix="/api/webhook", tags=["Webhooks"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "16080")))
