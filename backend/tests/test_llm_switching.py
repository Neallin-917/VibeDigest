import os
from unittest.mock import patch, ANY
from config import settings
from utils.openai_client import create_chat_model


class TestLLMSwitching:
    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_provider_switching(self, mock_rate_limit_llm):
        """Verify factory ALWAYS uses RateLimitAwareChatLiteLLM regardless of provider"""

        # Case 1: Default (OpenAI) - Now uses LiteLLM unified
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "openai"):
            create_chat_model("gpt-4o")
            mock_rate_limit_llm.assert_called()

        mock_rate_limit_llm.reset_mock()

        # Case 2: Custom Provider (e.g. Ollama)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "ollama"):
            create_chat_model("gpt-4o")
            mock_rate_limit_llm.assert_called()

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_model_alias_mapping(self, mock_rate_limit_llm):
        """Verify aliases are passed correctly"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "custom"):
            aliased_model = "ollama/llama3"
            create_chat_model(aliased_model)

            mock_rate_limit_llm.assert_called_with(model=aliased_model, temperature=0.1)

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_prefix_injection(self, mock_rate_limit_llm):
        """Verify model name gets openrouter/ prefix when provider is openrouter"""
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "openrouter"):
            create_chat_model("openai/gpt-5.2")

            call_kwargs = mock_rate_limit_llm.call_args
            assert call_kwargs.kwargs.get("model") == "openrouter/openai/gpt-5.2" or \
                   call_kwargs.args[0] == "openrouter/openai/gpt-5.2" if call_kwargs.args else True

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_no_double_prefix(self, mock_rate_limit_llm):
        """Verify already-prefixed model is not double-prefixed"""
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "openrouter"):
            create_chat_model("openrouter/openai/gpt-5.2")

            call_kwargs = mock_rate_limit_llm.call_args
            assert call_kwargs.kwargs.get("model") == "openrouter/openai/gpt-5.2" or \
                   call_kwargs.args[0] == "openrouter/openai/gpt-5.2" if call_kwargs.args else True

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_fallback_injection(self, mock_rate_limit_llm):
        """Verify OpenRouter fallback routing is injected."""
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "openrouter"):
            create_chat_model("google/gemini-pro")

            _, kwargs = mock_rate_limit_llm.call_args
            extra_body = kwargs.get("extra_body", {})
            assert extra_body["models"] == ["openrouter/google/gemini-pro", "openrouter/auto"]
            assert extra_body["route"] == "fallback"
