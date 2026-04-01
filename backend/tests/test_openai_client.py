from unittest.mock import patch, AsyncMock, MagicMock

import pytest
import litellm

from utils.openai_client import (
    _resolve_api_key,
    _is_rate_limit_error,
    _is_transient_error,
    _is_retryable_error,
    _compute_wait_seconds,
    create_chat_model,
    RateLimitAwareChatLiteLLM,
)


@patch("utils.openai_client.settings")
@patch("utils.openai_client.RateLimitAwareChatLiteLLM")
def test_create_chat_model_openrouter_fallback(mock_llm_cls, mock_settings):
    """
    Test that create_chat_model injects OpenRouter-specific fallback parameters
    into the LiteLLM initialization when running in 'openrouter' mode.
    """
    mock_settings.LLM_PROVIDER = "openrouter"
    mock_settings.OPENROUTER_BASE_URL = None
    mock_settings.get_temperature.return_value = 0.5

    create_chat_model("google/gemini-pro")

    _, kwargs = mock_llm_cls.call_args

    assert "extra_body" in kwargs, "extra_body should be injected for OpenRouter"
    extra_body = kwargs["extra_body"]

    assert extra_body["models"] == ["openrouter/google/gemini-pro", "openrouter/auto"]
    assert extra_body["route"] == "fallback"


def test_openrouter_requires_openrouter_api_key():
    with patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}, clear=True):
        with pytest.raises(ValueError, match="Set OPENROUTER_API_KEY in the environment"):
            _resolve_api_key("openrouter")


@patch("utils.openai_client.settings")
@patch("utils.openai_client.RateLimitAwareChatLiteLLM")
def test_create_chat_model_uses_openrouter_base_url(mock_llm_cls, mock_settings):
    mock_settings.LLM_PROVIDER = "openrouter"
    mock_settings.OPENROUTER_BASE_URL = "https://openrouter.example/api/v1"
    mock_settings.get_temperature.return_value = 0.5

    create_chat_model("google/gemini-pro")

    _, kwargs = mock_llm_cls.call_args
    assert kwargs["api_base"] == "https://openrouter.example/api/v1"


# ---------------------------------------------------------------------------
# _is_rate_limit_error
# ---------------------------------------------------------------------------

class TestIsRateLimitError:
    def test_litellm_rate_limit_error(self):
        exc = litellm.RateLimitError("rate limited", "openai", "gpt-4")
        assert _is_rate_limit_error(exc) is True

    def test_exception_with_429(self):
        assert _is_rate_limit_error(Exception("Error 429 too many requests")) is True

    def test_exception_with_rate_limit_text(self):
        assert _is_rate_limit_error(Exception("rate limit exceeded")) is True

    def test_connection_error_is_not_rate_limit(self):
        assert _is_rate_limit_error(Exception("Connection error")) is False

    def test_generic_exception(self):
        assert _is_rate_limit_error(Exception("Something else")) is False


# ---------------------------------------------------------------------------
# _is_transient_error
# ---------------------------------------------------------------------------

class TestIsTransientError:
    def test_api_connection_error(self):
        exc = litellm.APIConnectionError("conn failed", "openai", "gpt-4")
        assert _is_transient_error(exc) is True

    def test_service_unavailable_error(self):
        exc = litellm.ServiceUnavailableError("unavailable", "openai", "gpt-4")
        assert _is_transient_error(exc) is True

    def test_internal_server_error_with_connection_msg(self):
        exc = litellm.InternalServerError(
            "OpenAIException - Connection error.", "openai", "gpt-4"
        )
        assert _is_transient_error(exc) is True

    def test_internal_server_error_without_connection_msg(self):
        exc = litellm.InternalServerError("Server overloaded", "openai", "gpt-4")
        assert _is_transient_error(exc) is False

    def test_stdlib_connection_refused(self):
        assert _is_transient_error(ConnectionRefusedError("refused")) is True

    def test_stdlib_connection_reset(self):
        assert _is_transient_error(ConnectionResetError("reset")) is True

    def test_econnreset_in_message(self):
        assert _is_transient_error(Exception("read ECONNRESET")) is True

    def test_rate_limit_is_not_transient(self):
        exc = litellm.RateLimitError("rate limited", "openai", "gpt-4")
        assert _is_transient_error(exc) is False

    def test_generic_exception(self):
        assert _is_transient_error(Exception("bad request")) is False


# ---------------------------------------------------------------------------
# _is_retryable_error (combines both)
# ---------------------------------------------------------------------------

class TestIsRetryableError:
    def test_rate_limit(self):
        exc = litellm.RateLimitError("rate limited", "openai", "gpt-4")
        assert _is_retryable_error(exc) is True

    def test_connection_error(self):
        exc = litellm.APIConnectionError("conn failed", "openai", "gpt-4")
        assert _is_retryable_error(exc) is True

    def test_generic_not_retryable(self):
        assert _is_retryable_error(Exception("bad request")) is False


# ---------------------------------------------------------------------------
# _compute_wait_seconds
# ---------------------------------------------------------------------------

class TestComputeWaitSeconds:
    def test_explicit_wait_in_message(self):
        exc = Exception("Please wait 10s before retrying")
        assert _compute_wait_seconds(exc, 1) == 12.0  # 10 + 2 buffer

    def test_exponential_backoff_attempt_1(self):
        assert _compute_wait_seconds(Exception("error"), 1) == 2.0

    def test_exponential_backoff_attempt_2(self):
        assert _compute_wait_seconds(Exception("error"), 2) == 4.0

    def test_exponential_backoff_attempt_3(self):
        assert _compute_wait_seconds(Exception("error"), 3) == 8.0

    def test_backoff_capped_at_30(self):
        assert _compute_wait_seconds(Exception("error"), 10) == 30.0


# ---------------------------------------------------------------------------
# RateLimitAwareChatLiteLLM retry behaviour
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@patch("utils.openai_client.asyncio.sleep", new_callable=AsyncMock)
async def test_agenerate_retries_on_connection_error(mock_sleep):
    """Connection errors should be retried up to 3 times, then succeed."""
    model = RateLimitAwareChatLiteLLM(model="test-model")

    conn_err = litellm.APIConnectionError("Connection error", "openai", "gpt-4")
    success_result = MagicMock()

    call_count = 0

    async def fake_agenerate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            raise conn_err
        return success_result

    with patch.object(
        RateLimitAwareChatLiteLLM.__bases__[0], "_agenerate", side_effect=fake_agenerate
    ):
        result = await model._agenerate([])

    assert result is success_result
    assert call_count == 3
    assert mock_sleep.await_count == 2


@pytest.mark.asyncio
@patch("utils.openai_client.asyncio.sleep", new_callable=AsyncMock)
async def test_agenerate_raises_after_retries_exhausted(mock_sleep):
    """After 3 retries (4 total calls), the original exception is re-raised."""
    model = RateLimitAwareChatLiteLLM(model="test-model")

    conn_err = litellm.APIConnectionError("Connection error", "openai", "gpt-4")

    with patch.object(
        RateLimitAwareChatLiteLLM.__bases__[0], "_agenerate",
        new_callable=AsyncMock, side_effect=conn_err,
    ):
        with pytest.raises(litellm.APIConnectionError):
            await model._agenerate([])

    assert mock_sleep.await_count == 3


@pytest.mark.asyncio
async def test_astream_no_retry_after_yielding():
    """Mid-stream errors must never be retried — partial output would be inconsistent."""
    model = RateLimitAwareChatLiteLLM(model="test-model")

    chunk = MagicMock()
    conn_err = litellm.APIConnectionError("Connection error", "openai", "gpt-4")

    async def fake_astream(*args, **kwargs):
        yield chunk
        raise conn_err

    with patch.object(
        RateLimitAwareChatLiteLLM.__bases__[0], "_astream", side_effect=fake_astream
    ):
        chunks = []
        with pytest.raises(litellm.APIConnectionError):
            async for c in model._astream([]):
                chunks.append(c)

    assert len(chunks) == 1
    assert chunks[0] is chunk
