"""
Configuration and initialization utilities for the Summarizer.

This module contains configuration-related helpers including model selection,
environment variable parsing, and LLM factory methods.
"""
import os
import logging
from typing import Any, Dict, List, Optional

from config import settings
from utils.env_utils import parse_int_env, parse_bool_env
from utils.language_utils import LANGUAGE_MAP

logger = logging.getLogger(__name__)


def supports_structured_output(model_name: str) -> bool:
    """
    Check if a model supports structured output.
    LiteLLM generally supports structured output for OpenAI-compatible models.
    """
    return True


def read_int_env(
    name: str,
    default: int,
    *,
    min_value: Optional[int] = None,
    max_value: Optional[int] = None,
) -> int:
    """Read an integer environment variable with optional bounds."""
    return parse_int_env(name, default, min_value=min_value, max_value=max_value)


def read_bool_env(name: str, default: bool) -> bool:
    """Read a boolean environment variable."""
    return parse_bool_env(name, default)


def dedupe_models(models: List[str]) -> List[str]:
    """Remove duplicate model names while preserving order."""
    out = []
    seen = set()
    for m in models:
        m = (m or "").strip()
        if m and m not in seen:
            out.append(m)
            seen.add(m)
    return out


def get_llm(
    model: str,
    max_tokens: Optional[int] = None,
    model_kwargs: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    Create an LLM instance using the centralized factory.

    Args:
        model: Model name to use
        max_tokens: Maximum output tokens
        model_kwargs: Additional model keyword arguments

    Returns:
        A LangChain chat model instance
    """
    from utils.llm_router import create_chat_model

    tokens = max_tokens or settings.DEFAULT_MAX_TOKENS
    return create_chat_model(
        model_name=model,
        max_tokens=tokens,
        model_kwargs=model_kwargs or {},
    )


class SummarizerConfig:
    """
    Configuration holder for the Summarizer.

    This class encapsulates all configuration values read from environment
    variables and settings at initialization time.
    """

    def __init__(self):
        from config import settings
        from utils.llm_router import resolve_model_for_intent

        # Mirror the runtime provider contract used by utils.openai_client.
        if settings.LLM_PROVIDER == "openrouter":
            self.api_key = os.getenv("OPENROUTER_API_KEY")
            self.base_url = os.getenv("OPENROUTER_BASE_URL")
        else:
            self.api_key = os.getenv("OPENAI_API_KEY")
            self.base_url = os.getenv("OPENAI_BASE_URL")

        if self.api_key:
            logger.info("Summarizer initialized with configured text LLM provider")
        else:
            logger.warning(
                "API key missing for provider %s, Summarizer will not function correctly",
                settings.LLM_PROVIDER,
            )

        # Model chain configuration
        explicit_summary_model = (os.getenv("OPENAI_SUMMARY_MODEL") or "").strip()
        explicit_fallback_model = (
            os.getenv("OPENAI_SUMMARY_FALLBACK_MODEL") or ""
        ).strip()

        if explicit_summary_model:
            default_summary_chain = [
                explicit_summary_model,
                explicit_fallback_model,
            ] + settings.OPENAI_SUMMARY_MODELS
            default_summary_chain = [m for m in default_summary_chain if m]
        else:
            summary_default = resolve_model_for_intent("summary")
            default_summary_chain = (
                [summary_default] if summary_default else list(settings.OPENAI_SUMMARY_MODELS)
            )
            if explicit_fallback_model:
                default_summary_chain.insert(1, explicit_fallback_model)

        self.summary_models = dedupe_models(default_summary_chain)
        self.transcript_model = (
            os.getenv("OPENAI_TRANSCRIPT_MODEL")
            or resolve_model_for_intent("transcript_optimize")
            or settings.OPENAI_HELPER_MODEL
        )
        self.paragraph_model = (
            os.getenv("OPENAI_PARAGRAPH_MODEL")
            or resolve_model_for_intent("paragraph")
            or settings.OPENAI_HELPER_MODEL
        )

        # Token and character limits
        self.summary_single_max_est_tokens = read_int_env(
            "OPENAI_SUMMARY_SINGLE_MAX_EST_TOKENS",
            16000,
            min_value=3000,
            max_value=120000,
        )
        self.summary_chunk_max_chars = read_int_env(
            "OPENAI_SUMMARY_CHUNK_MAX_CHARS", 9000, min_value=2000, max_value=30000
        )
        self.summary_single_max_output_tokens = read_int_env(
            "OPENAI_SUMMARY_SINGLE_MAX_OUTPUT_TOKENS",
            8192,
            min_value=800,
            max_value=16384,
        )
        self.summary_chunk_max_output_tokens = read_int_env(
            "OPENAI_SUMMARY_CHUNK_MAX_OUTPUT_TOKENS",
            1800,
            min_value=500,
            max_value=6000,
        )
        self.summary_integrate_max_output_tokens = read_int_env(
            "OPENAI_SUMMARY_INTEGRATE_MAX_OUTPUT_TOKENS",
            2800,
            min_value=800,
            max_value=8000,
        )
        self.summary_max_keypoints_per_chunk = read_int_env(
            "OPENAI_SUMMARY_MAX_KEYPOINTS_PER_CHUNK", 10, min_value=1, max_value=24
        )
        self.summary_max_keypoints_final = read_int_env(
            "OPENAI_SUMMARY_MAX_KEYPOINTS_FINAL", 24, min_value=6, max_value=48
        )
        self.summary_max_keypoints_candidates = read_int_env(
            "OPENAI_SUMMARY_MAX_KEYPOINTS_CANDIDATES", 140, min_value=24, max_value=2000
        )

        # Feature flags
        self.enable_json_repair = read_bool_env("OPENAI_SUMMARY_JSON_REPAIR", True)
        self.enable_summary_fallback = read_bool_env("OPENAI_SUMMARY_FALLBACK", True)
        self.use_response_format_json = read_bool_env(
            "OPENAI_USE_RESPONSE_FORMAT_JSON", True
        )

        # Additional models
        self.json_repair_model = (
            (os.getenv("OPENAI_JSON_REPAIR_MODEL") or "").strip()
            or resolve_model_for_intent("json_repair")
            or settings.OPENAI_HELPER_MODEL
        )
        self.classifier_model = (
            (os.getenv("OPENAI_CLASSIFIER_MODEL") or "").strip()
            or resolve_model_for_intent("classifier")
            or settings.OPENAI_HELPER_MODEL
        )

        # Matching threshold
        self.summary_match_threshold = float(
            os.getenv("OPENAI_SUMMARY_MATCH_THRESHOLD", "4.0")
        )

        # Language map reference
        self.language_map = LANGUAGE_MAP
