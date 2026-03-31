import os
import logging
import re
import asyncio
from typing import Optional, Any, List, AsyncIterator
from urllib.parse import urlparse

from config import settings
from langchain_community.chat_models import ChatLiteLLM
from langchain_core.outputs import ChatGenerationChunk

logger = logging.getLogger(__name__)

from openai import OpenAI, AsyncOpenAI

# ---------------------------------------------------------------------------
# Placeholder API key values that are acceptable in CI / mock mode.
# These should trigger a warning but NOT a hard failure so that unit tests
# which mock LLM calls continue to work without real credentials.
# ---------------------------------------------------------------------------
_PLACEHOLDER_KEY_PATTERNS: tuple[str, ...] = (
    "dummy-key",
    "sk-no-key-required",
    "sk-dummy",
    "fake",
    "test-key",
    "placeholder",
)

_SUPPORTED_TEXT_PROVIDERS: tuple[str, ...] = ("openrouter", "openai", "custom")


def _ensure_supported_provider(provider: str) -> None:
    if provider not in _SUPPORTED_TEXT_PROVIDERS:
        raise ValueError(
            f"Unsupported provider: '{provider}'. "
            f"Expected one of: {', '.join(_SUPPORTED_TEXT_PROVIDERS)}."
        )


def _validate_base_url(provider: str, base_url: Optional[str]) -> None:
    if not base_url:
        return

    parsed = urlparse(base_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(
            f"Invalid base URL for provider '{provider}': '{base_url}'. Must be a valid URL."
        )


def _resolve_api_key(provider: str) -> Optional[str]:
    """
    Resolve the API key for a given provider and validate it at call-time.

    Returns the key string, or ``None`` if no key is configured.

    Side-effects:
        - Raises ``ValueError`` when no key is present at all (hard fail-fast).
        - Logs a WARNING when a placeholder key is detected (soft warning so
          CI mock tests are not broken).
    """
    _ensure_supported_provider(provider)

    if provider == "openrouter":
        key = os.getenv("OPENROUTER_API_KEY")
        required_env = "OPENROUTER_API_KEY"
    else:
        key = os.getenv("OPENAI_API_KEY")
        required_env = "OPENAI_API_KEY"

    if not key:
        raise ValueError(
            f"No API key configured for provider '{provider}'. "
            f"Set {required_env} in the environment."
        )

    lower_key = key.lower()
    if any(pattern in lower_key for pattern in _PLACEHOLDER_KEY_PATTERNS):
        logger.warning(
            f"[openai_client] Placeholder API key detected for provider '{provider}'. "
            "LLM calls will fail unless MOCK_MODE is active or the model is mocked."
        )

    return key


def _validate_text_provider_config(provider: str) -> None:
    _ensure_supported_provider(provider)
    base_url = settings.OPENROUTER_BASE_URL if provider == "openrouter" else settings.OPENAI_BASE_URL
    _validate_base_url(provider, base_url)
    _resolve_api_key(provider)


def _is_rate_limit_error(exc: Exception) -> bool:
    """
    Return True when *exc* represents a rate-limit / too-many-requests condition.

    Checks both the litellm exception hierarchy (preferred) and a regex fallback
    against the string representation for compatibility with older litellm versions.
    """
    try:
        import litellm
        if isinstance(exc, litellm.RateLimitError):
            return True
    except (ImportError, AttributeError, TypeError):
        pass

    # Regex fallback: covers "rate limit", "429", "too many requests", etc.
    return bool(re.search(r"rate.?limit|429|too many requests", str(exc), re.IGNORECASE))


def _compute_wait_seconds(exc: Exception, attempt: int) -> float:
    """
    Determine how long to wait before the next retry.

    Uses the explicit wait duration from the API response when available,
    otherwise falls back to exponential backoff capped at 30 s.
    """
    explicit_match = re.search(r"wait (\d+)s", str(exc), re.IGNORECASE)
    if explicit_match:
        return float(explicit_match.group(1)) + 2  # +2 s buffer

    # Exponential backoff: 2, 4, 8, 16, 30 (capped)
    return min(2 ** attempt, 30)


class RateLimitAwareChatLiteLLM(ChatLiteLLM):
    """
    Custom wrapper around ChatLiteLLM that detects rate-limit errors and
    automatically retries with the appropriate wait time.

    Detection strategy (in order):
    1. ``litellm.RateLimitError`` isinstance check (accurate, version-dependent)
    2. Regex match on the exception message (broad fallback)
    """

    async def _astream(
        self,
        messages: List[Any],
        stop: Optional[List[str]] = None,
        run_manager: Optional[Any] = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        max_retries = 3
        current_attempt = 0

        while True:
            yielded_any = False
            try:
                async for chunk in super()._astream(
                    messages, stop, run_manager, **kwargs
                ):
                    yield chunk
                    yielded_any = True
                return
            except Exception as e:
                # Never retry mid-stream — partial output would be inconsistent.
                if yielded_any:
                    raise e

                current_attempt += 1

                if _is_rate_limit_error(e) and current_attempt <= max_retries:
                    wait_seconds = _compute_wait_seconds(e, current_attempt)
                    logger.warning(
                        f"Rate limit hit (stream). Waiting {wait_seconds:.1f}s. "
                        f"Retrying ({current_attempt}/{max_retries})…"
                    )
                    await asyncio.sleep(wait_seconds)
                    continue

                raise e

    async def _agenerate(
        self,
        messages: List[Any],
        stop: Optional[List[str]] = None,
        run_manager: Optional[Any] = None,
        **kwargs: Any,
    ) -> Any:
        max_retries = 3
        current_attempt = 0

        while True:
            try:
                return await super()._agenerate(messages, stop, run_manager, **kwargs)
            except Exception as e:
                current_attempt += 1

                if _is_rate_limit_error(e) and current_attempt <= max_retries:
                    wait_seconds = _compute_wait_seconds(e, current_attempt)
                    logger.warning(
                        f"Rate limit hit (generate). Waiting {wait_seconds:.1f}s. "
                        f"Retrying ({current_attempt}/{max_retries})…"
                    )
                    await asyncio.sleep(wait_seconds)
                    continue

                raise e


def get_openai_client(base_url: Optional[str] = None) -> Any:
    """Factory to get an OpenAI client (Synchronous)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set in environment.")
        return None

    final_base_url = base_url or os.getenv("OPENAI_BASE_URL")
    _validate_base_url("openai", final_base_url)

    if final_base_url:
        return OpenAI(api_key=api_key, base_url=final_base_url)
    return OpenAI(api_key=api_key)


def get_async_openai_client(base_url: Optional[str] = None) -> Any:
    """Factory to get an Async OpenAI client."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set in environment.")
        return None

    final_base_url = base_url or os.getenv("OPENAI_BASE_URL")
    _validate_base_url("openai", final_base_url)

    if final_base_url:
        return AsyncOpenAI(api_key=api_key, base_url=final_base_url)
    return AsyncOpenAI(api_key=api_key)


def get_async_audio_client(base_url: Optional[str] = None) -> Any:
    """
    Factory to get an Async OpenAI client specifically for Audio/Transcription.
    Prioritizes OPENAI_AUDIO_* env vars to allow separating Audio from Text generation.
    """
    # 1. Resolve API Key
    api_key = os.getenv("OPENAI_AUDIO_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY (or OPENAI_AUDIO_API_KEY) not set.")
        return None

    # 2. Resolve Base URL
    # If caller provided explicit base_url, use it.
    # Else check OPENAI_AUDIO_BASE_URL.
    audio_base_url = base_url or os.getenv("OPENAI_AUDIO_BASE_URL")

    final_base_url = None

    if audio_base_url:
        # User explicitly configured Audio URL -> Use it
        final_base_url = audio_base_url
    elif os.getenv("OPENAI_AUDIO_API_KEY"):
        # User provided specific Audio Key but NO Audio URL -> Implies Official Endpoint
        # We IGNORE global OPENAI_BASE_URL in this case to prevent leaking to local LLM
        final_base_url = None
    else:
        # No specific Audio config -> Fallback to global OPENAI_BASE_URL (Legacy behavior)
        final_base_url = os.getenv("OPENAI_BASE_URL")

    _validate_base_url("audio", final_base_url)

    if final_base_url:
        return AsyncOpenAI(api_key=api_key, base_url=final_base_url)
    return AsyncOpenAI(api_key=api_key)


# Factory for LangChain Chat Models
def create_chat_model(
    model_name: str, temperature: Optional[float] = None, **kwargs: Any
) -> Any:
    """
    Creates a LangChain Chat Model using LiteLLM.
    Unified factory for all providers.
    """
    import litellm

    # Validate API key at model-creation time so failures are caught early
    # (fail-fast) rather than at first LLM call mid-pipeline.
    # Skip validation in MOCK_MODE to keep CI tests hermetic.
    if not settings.MOCK_MODE:
        _validate_text_provider_config(settings.LLM_PROVIDER)

    # Resolve temperature if not provided
    if temperature is None:
        temperature = settings.get_temperature(model_name)

    litellm.drop_params = True  # Fix for gpt-5 or other provider unsupported params

    # Logic for Custom (OpenAI-compatible) providers:
    # If the provider is 'custom', we need to tell LiteLLM to use the 'openai' adapter,
    # but keep the model name as-is so it matches the proxy's expectation.
    if settings.LLM_PROVIDER == "custom" and "/" not in model_name:
        kwargs.setdefault("custom_llm_provider", "openai")
        # Ensure base_url is passed if using custom provider
        if settings.OPENAI_BASE_URL:
            kwargs.setdefault("api_base", settings.OPENAI_BASE_URL)
    elif settings.LLM_PROVIDER == "openrouter":
        # LiteLLM native OpenRouter support: prefix model with "openrouter/"
        if not model_name.startswith("openrouter/"):
            model_name = f"openrouter/{model_name}"

        if settings.OPENROUTER_BASE_URL:
            kwargs.setdefault("api_base", settings.OPENROUTER_BASE_URL)

        # OpenRouter fallback routing
        extra_body = kwargs.get("extra_body", {})
        extra_body["models"] = [model_name, "openrouter/auto"]
        extra_body["route"] = "fallback"
        kwargs["extra_body"] = extra_body

    # Use our RateLimitAware wrapper
    return RateLimitAwareChatLiteLLM(
        model=model_name, temperature=temperature, **kwargs
    )


async def ainvoke_structured_json(
    llm: Any,
    schema: Any,
    messages: List[Any],
    *,
    config: Optional[dict] = None,
) -> dict:
    """
    Invoke a structured-output LLM, with graceful fallback to parsing JSON text
    when tool-calling is not supported or returns None.

    This is a shared utility to avoid code duplication across services.

    Args:
        llm: The LangChain chat model instance
        schema: A Pydantic model class for structured output
        messages: List of LangChain message objects
        config: Optional LangChain config dict for tracing

    Returns:
        A dictionary representation of the parsed schema

    Raises:
        ValueError: If the result cannot be parsed into the expected format
        json.JSONDecodeError: If JSON parsing fails
    """
    import json
    import logging
    from utils.text_utils import extract_first_json_object

    logger = logging.getLogger(__name__)

    raw = await llm.ainvoke(messages, config=config)

    logger.debug(f"[ainvoke_structured_json] raw type: {type(raw)}")
    logger.debug(
        f"[ainvoke_structured_json] raw.content: {getattr(raw, 'content', 'N/A')!r}"
    )
    if hasattr(raw, "additional_kwargs"):
        logger.debug(
            f"[ainvoke_structured_json] raw.additional_kwargs: {raw.additional_kwargs}"
        )

    raw_text = _extract_text_from_response(raw)
    logger.debug(
        f"[ainvoke_structured_json] extracted raw_text: {raw_text[:500] if raw_text else 'EMPTY'}..."
    )

    if not raw_text or raw_text == "{}":
        raise ValueError(f"LLM returned empty response. Raw: {raw}")

    json_text = extract_first_json_object(raw_text) or raw_text
    obj = json.loads(json_text)
    parsed = schema(**obj)

    if hasattr(parsed, "model_dump"):
        return parsed.model_dump()
    return parsed.dict()


def _extract_text_from_response(raw) -> str:
    """Extract text content from LangChain response, handling various response formats."""
    import json
    import logging

    logger = logging.getLogger(__name__)

    if hasattr(raw, "content") and raw.content:
        logger.info(f"[_extract_text] Found content: {raw.content[:200]}...")
        return raw.content

    if hasattr(raw, "additional_kwargs"):
        kwargs = raw.additional_kwargs or {}
        logger.info(f"[_extract_text] additional_kwargs keys: {list(kwargs.keys())}")
        if "parsed" in kwargs and kwargs["parsed"]:
            result = json.dumps(kwargs["parsed"])
            logger.info(f"[_extract_text] Found parsed: {result[:200]}...")
            return result
        if "tool_calls" in kwargs and kwargs["tool_calls"]:
            first_call = kwargs["tool_calls"][0]
            if isinstance(first_call, dict) and "function" in first_call:
                result = json.dumps(first_call["function"].get("arguments", {}))
                logger.info(f"[_extract_text] Found tool_calls: {result[:200]}...")
                return result

    fallback = str(raw)
    logger.warning(f"[_extract_text] Using fallback str(raw): {fallback[:300]}...")
    return fallback
