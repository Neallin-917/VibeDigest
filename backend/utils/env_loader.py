"""
Centralized environment variable loader.
Priority (highest to lowest): shell env > .env.local > .env
"""
from pathlib import Path
from dotenv import load_dotenv


def load_env():
    """
    Load environment variables from project root.
    Call this at the top of scripts before importing config.

    Shell environment variables always win — dotenv files never override
    values already set in the process environment. This allows Makefile
    targets (e.g. OPENAI_BASE_URL= make test-integration) to
    control behaviour without touching .env.local.
    """
    # Find project root (parent of backend/)
    current_file = Path(__file__).resolve()
    backend_dir = current_file.parent.parent
    project_root = backend_dir.parent

    env_production = project_root / ".env"
    env_local = project_root / ".env.local"

    # Load .env.local first (higher priority than .env),
    # but override=False so pre-existing shell vars are never overwritten.
    if env_local.exists():
        load_dotenv(dotenv_path=env_local, override=False)
    if env_production.exists():
        load_dotenv(dotenv_path=env_production, override=False)

    # Fallback: try legacy backend/.env if new files don't exist
    legacy_env = backend_dir / ".env"
    if not env_production.exists() and not env_local.exists() and legacy_env.exists():
        load_dotenv(dotenv_path=legacy_env, override=False)
