from unittest.mock import patch
from utils.openai_client import create_chat_model


@patch("utils.openai_client.settings")
@patch("utils.openai_client.RateLimitAwareChatLiteLLM")
def test_create_chat_model_openrouter_fallback(mock_llm_cls, mock_settings):
    """
    Test that create_chat_model injects OpenRouter-specific fallback parameters
    into the LiteLLM initialization when running in 'openrouter' mode.
    """
    mock_settings.LLM_PROVIDER = "openrouter"
    mock_settings.get_temperature.return_value = 0.5

    create_chat_model("google/gemini-pro")

    _, kwargs = mock_llm_cls.call_args

    assert "extra_body" in kwargs, "extra_body should be injected for OpenRouter"
    extra_body = kwargs["extra_body"]

    assert extra_body["models"] == ["openrouter/google/gemini-pro", "openrouter/auto"]
    assert extra_body["route"] == "fallback"
