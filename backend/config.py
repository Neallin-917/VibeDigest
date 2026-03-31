import os
import logging
from typing import Dict, Optional
from pydantic import BaseModel

from utils.logging import configure_logging
from utils.env_utils import parse_bool_env

configure_logging()


class PriceConfig(BaseModel):
    id: str
    amount: float
    name: str
    credits: int = 0
    mode: str = "payment"  # 'payment' or 'subscription'


class Settings:
    # Services
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # Creem Payment
    CREEM_API_KEY: str = os.getenv("CREEM_API_KEY", "")
    CREEM_WEBHOOK_SECRET: str = os.getenv("CREEM_WEBHOOK_SECRET", "")
    CREEM_API_BASE: str = os.getenv(
        "CREEM_API_BASE", "https://api.creem.io"
    )  # Use https://test-api.creem.io for test mode

    # Coinbase
    COINBASE_API_KEY: str = os.getenv("COINBASE_API_KEY", "")
    COINBASE_WEBHOOK_SECRET: str = os.getenv("COINBASE_WEBHOOK_SECRET", "")

    # LangSmith
    LANGCHAIN_TRACING_V2: str = os.getenv("LANGCHAIN_TRACING_V2", "false")
    LANGCHAIN_API_KEY: str = (
        os.getenv("LANGCHAIN_API_KEY") or os.getenv("LANGSMITH_API_KEY") or ""
    )
    LANGCHAIN_PROJECT: str = (
        os.getenv("LANGCHAIN_PROJECT") or os.getenv("LANGSMITH_PROJECT") or "default"
    )

    # Monitoring
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

    # Database
    POSTGRES_URI: str = os.getenv(
        "POSTGRES_URI", "postgresql://postgres:password@postgres:5432/langgraph"
    )

    # Models
    # Chat Agent Model
    MOCK_MODE: bool = parse_bool_env("MOCK_MODE", False)

    # Cognition Rate Limiting (Local/Dev)
    # Default to FALSE (parallel) for production performance.
    # Set COGNITION_SEQUENTIAL=true for debugging or rate-limited environments.
    COGNITION_SEQUENTIAL: bool = parse_bool_env("COGNITION_SEQUENTIAL", False)
    COGNITION_DELAY: float = float(os.getenv("COGNITION_DELAY") or "0.0")

    # LLM Configuration
    LLM_PROVIDER: str = (os.getenv("LLM_PROVIDER") or "openrouter").lower()
    OPENAI_BASE_URL: Optional[str] = os.getenv("OPENAI_BASE_URL")
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    OPENROUTER_BASE_URL: Optional[str] = os.getenv("OPENROUTER_BASE_URL")

    # Audio Configuration (Transcription)
    # Allows separating transcription provider (e.g. Official OpenAI) from generation provider (e.g. Local LLM)
    OPENAI_AUDIO_BASE_URL: Optional[str] = os.getenv("OPENAI_AUDIO_BASE_URL")
    OPENAI_AUDIO_API_KEY: Optional[str] = os.getenv("OPENAI_AUDIO_API_KEY")

    MODEL_ALIAS_SMART: Optional[str] = os.getenv("MODEL_ALIAS_SMART")
    MODEL_ALIAS_FAST: Optional[str] = os.getenv("MODEL_ALIAS_FAST")

    # Provider → (smart, fast) defaults — single source of truth for model names
    _PROVIDER_DEFAULTS: Dict[str, tuple] = {
        "openrouter": ("google/gemini-3-pro-preview", "google/gemini-3-flash-preview"),
        "openai": ("gpt-5", "gpt-5-mini"),
        "custom": ("gemini-3-pro", "gemini-3-flash"),
    }

    def _get_provider_defaults(self) -> tuple[str, str]:
        defaults = self._PROVIDER_DEFAULTS.get(self.LLM_PROVIDER)
        if defaults is None:
            raise ValueError(
                "Unsupported provider: "
                f"'{self.LLM_PROVIDER}'. Expected one of: {', '.join(self._PROVIDER_DEFAULTS)}."
            )
        return defaults

    @property
    def MODEL_SMART(self) -> str:
        if self.MODEL_ALIAS_SMART:
            return self.MODEL_ALIAS_SMART
        return self._get_provider_defaults()[0]

    @property
    def MODEL_FAST(self) -> str:
        if self.MODEL_ALIAS_FAST:
            return self.MODEL_ALIAS_FAST
        return self._get_provider_defaults()[1]

    # Internal aliases still used by existing services
    @property
    def OPENAI_COMPREHENSION_MODELS(self) -> list[str]: return [self.MODEL_SMART]
    @property
    def OPENAI_SUMMARY_MODELS(self) -> list[str]: return [self.MODEL_SMART]
    @property
    def OPENAI_TRANSLATION_MODEL(self) -> str: return self.MODEL_FAST
    @property
    def OPENAI_HELPER_MODEL(self) -> str: return self.MODEL_FAST

    # --- LLM Generation Defaults ---
    DEFAULT_TEMPERATURE: float = 0.1  # Default for most tasks
    REASONING_TEMPERATURE: float = 1.0  # Default for reasoning models (gpt-5/o1)

    # Token Limits (Sensible Defaults)
    DEFAULT_MAX_TOKENS: int = 4000
    SHORT_TASK_MAX_TOKENS: int = 1000
    LONG_TASK_MAX_TOKENS: int = 16000

    # Feature Flags
    USE_JSON_MODE: bool = True  # Global flag to enable JSON mode where applicable

    def get_temperature(self, model_name: Optional[str]) -> float:
        """
        Smart routing for temperature.
        Reasoning models (Smart tier) often require temp=1.0.
        Utility models (Fast tier) usually prefer low temp for stability.
        """
        if not model_name:
            return self.DEFAULT_TEMPERATURE

        # If it's the Smart model, or explicitly an o1/gpt-5 variant
        if (
            model_name == self.MODEL_SMART
            or "gpt-5" in model_name
            or "o1-" in model_name
            or "gpt-4o" == model_name
            or ("gemini" in model_name and "flash" not in model_name)
        ):
            return self.REASONING_TEMPERATURE
        return self.DEFAULT_TEMPERATURE

    # Transcription Models
    # Defaulting to whisper-1 for now, but ready to switch to gpt-4o-transcribe
    OPENAI_TRANSCRIPTION_MODEL: str = os.getenv(
        "OPENAI_TRANSCRIPTION_MODEL", "whisper-1"
    )

    # Summary Strategy
    # 'v4_dynamic' - Two-phase dynamic summary with content-aware section generation (default)
    SUMMARY_STRATEGY: str = os.getenv("SUMMARY_STRATEGY", "v4_dynamic")

    def __init__(self):
        # Log strategy on init to confirm loading
        logging.info(f"Config Loaded. SUMMARY_STRATEGY='{self.SUMMARY_STRATEGY}'")
        self._fix_docker_host_for_local_dev()

    def _fix_docker_host_for_local_dev(self):
        """
        Developer Experience Improvement:
        If running locally (not in Docker) but config points to 'host.docker.internal',
        automatically swap it to '127.0.0.1' so scripts/tests work out of the box.
        """
        if (
            not self.OPENAI_BASE_URL
            or "host.docker.internal" not in self.OPENAI_BASE_URL
        ):
            return

        # Detection: Check if we are inside a Docker container
        # 1. Check for /.dockerenv file
        # 2. Check /proc/1/cgroup for 'docker' (Linux only)
        is_docker = os.path.exists("/.dockerenv")
        if not is_docker and os.path.exists("/proc/1/cgroup"):
            try:
                with open("/proc/1/cgroup", "rt") as f:
                    if "docker" in f.read():
                        is_docker = True
            except Exception:
                pass

        if not is_docker:
            # We are likely running on the host machine (Mac/Linux/Windows)
            original = self.OPENAI_BASE_URL
            self.OPENAI_BASE_URL = self.OPENAI_BASE_URL.replace(
                "host.docker.internal", "127.0.0.1"
            )
            logging.warning(
                f"[DevDX] Detected local execution. Swapped OpenAI Base URL: "
                f"'{original}' -> '{self.OPENAI_BASE_URL}'"
            )

    # Pricing / Plans (Creem Product IDs)
    PRICES: Dict[str, PriceConfig] = {
        "CREDIT_PACK": PriceConfig(
            id="prod_5VVI5ldN9dtI7tbHaST5OB",
            amount=5.00,
            name="50 Credits Top-up (One-time)",
            credits=50,
            mode="payment",
        ),
        "PRO_MONTHLY": PriceConfig(
            id="prod_5XoWWMZN6ptDexocrwyqT0",
            amount=9.90,
            name="Pro Plan (1 Month)",
            mode="subscription",
        ),
        "PRO_ANNUAL": PriceConfig(
            id="prod_1pLnYf7AwktcAhRhkjiJTh",
            amount=99.00,
            name="Pro Plan (1 Year)",
            mode="subscription",
        ),
    }

    # Progress Constants
    class Progress:
        CREATED = 0
        PROCESSING_START = 10
        FETCHING_TRANSCRIPT = 20
        DOWNLOADING = 30
        TRANSCRIBING = 40
        SUMMARIZING_SOURCE = 60  # Implicit in code often
        COMPLETED = 100

    @classmethod
    def get_price_by_id(cls, price_id: str) -> Optional[PriceConfig]:
        for price in cls.PRICES.values():
            if price.id == price_id:
                return price
        return None


settings = Settings()
