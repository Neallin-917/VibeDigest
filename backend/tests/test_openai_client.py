from unittest.mock import patch

import pytest

from utils.openai_client import _resolve_api_key, create_chat_model


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
