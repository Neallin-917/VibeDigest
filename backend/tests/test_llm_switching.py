import os
from unittest.mock import patch
import pytest
from config import settings
from utils.codex_local_chat_model import CodexLocalChatModel
from utils.openai_client import create_chat_model


class TestLLMSwitching:
    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_provider_switching(self, mock_rate_limit_llm):
        """Verify factory ALWAYS uses RateLimitAwareChatLiteLLM regardless of provider"""

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "OPENAI_BASE_URL", "http://localhost:8317/v1"), \
             patch.object(settings, "_llm_provider_override", None):
            create_chat_model("gpt-4o")
            mock_rate_limit_llm.assert_called()

        mock_rate_limit_llm.reset_mock()

        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "OPENAI_BASE_URL", None), \
             patch.object(settings, "_llm_provider_override", None):
            create_chat_model("google/gemini-pro")
            mock_rate_limit_llm.assert_called()

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_model_alias_mapping(self, mock_rate_limit_llm):
        """Verify aliases are passed correctly"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "OPENAI_BASE_URL", "http://localhost:8317/v1"), \
             patch.object(settings, "_llm_provider_override", None):
            aliased_model = "ollama/llama3"
            create_chat_model(aliased_model)

            mock_rate_limit_llm.assert_called_with(model=aliased_model, temperature=0.1)

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_prefix_injection(self, mock_rate_limit_llm):
        """Verify model name gets openrouter/ prefix when provider is openrouter"""
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "OPENAI_BASE_URL", None), \
             patch.object(settings, "_llm_provider_override", None):
            create_chat_model("openai/gpt-5.2")

            call_kwargs = mock_rate_limit_llm.call_args
            assert call_kwargs.kwargs.get("model") == "openrouter/openai/gpt-5.2" or \
                   call_kwargs.args[0] == "openrouter/openai/gpt-5.2" if call_kwargs.args else True

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_no_double_prefix(self, mock_rate_limit_llm):
        """Verify already-prefixed model is not double-prefixed"""
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "OPENAI_BASE_URL", None), \
             patch.object(settings, "_llm_provider_override", None):
            create_chat_model("openrouter/openai/gpt-5.2")

            call_kwargs = mock_rate_limit_llm.call_args
            assert call_kwargs.kwargs.get("model") == "openrouter/openai/gpt-5.2" or \
                   call_kwargs.args[0] == "openrouter/openai/gpt-5.2" if call_kwargs.args else True

    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_keeps_the_configured_model_without_cross_model_fallback(self, mock_rate_limit_llm):
        """OpenRouter requests must not silently fall back to a different model."""
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "OPENAI_BASE_URL", None), \
             patch.object(settings, "_llm_provider_override", None):
            create_chat_model("google/gemini-pro")

            _, kwargs = mock_rate_limit_llm.call_args
            assert "extra_body" not in kwargs

    def test_unsupported_provider_raises(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "_llm_provider_override", "ollama"), \
             patch.object(settings, "MOCK_MODE", False):
            with pytest.raises(ValueError, match="Unsupported provider"):
                create_chat_model("llama3")

    def test_codex_local_runtime_uses_the_local_runner_without_api_key(self):
        with patch.object(settings, "LLM_RUNTIME", "codex_local"), \
             patch.object(settings, "CODEX_LOCAL_TIMEOUT_SECONDS", 90), \
             patch.object(settings, "CODEX_LOCAL_MAX_CONCURRENCY", 1), \
             patch.object(settings, "CODEX_LOCAL_BINARY", None), \
             patch.object(settings, "CODEX_LOCAL_WORKDIR", None):
            model = create_chat_model("gpt-5.6-luna")

        assert isinstance(model, CodexLocalChatModel)
        assert model.model_name == "gpt-5.6-luna"
