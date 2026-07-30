import os
from pathlib import Path

from loguru import logger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from utils.env_loader import load_env
from utils.logging import configure_logging
from utils.timing_middleware import TimingMiddleware

# Load environment variables before other local imports.
# Priority: shell env > .env.local > .env (shell vars are never overridden)
load_env()

configure_logging()

from config import settings  # noqa: E402
from api.routes import payments, system, tasks, webhooks  # noqa: E402

# Skip Sentry initialisation during pytest runs to avoid polluting the project
# with test noise and to keep unit tests hermetic.
if settings.SENTRY_DSN and not os.getenv("PYTEST_CURRENT_TEST"):
    from utils.sentry_config import init_sentry
    init_sentry(settings.SENTRY_DSN)

app = FastAPI(title="VibeDigest API (v2)", version="2.0.0")

@app.on_event("startup")
async def startup_event():
    # Required env vars are validated in config.py Settings._validate_required_env()
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

app.add_middleware(TimingMiddleware)

# Runtime paths must remain writable by the non-root container user. The
# production image copies the backend directly into /app, so walking to the
# parent of this module would incorrectly resolve to the filesystem root.
PROJECT_ROOT = Path(__file__).resolve().parent
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
