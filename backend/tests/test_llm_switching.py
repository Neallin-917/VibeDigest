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
            # Simulate config using an alias
            aliased_model = "ollama/llama3"
            create_chat_model(aliased_model)

            mock_rate_limit_llm.assert_called_with(model=aliased_model, temperature=0.1)

    @patch("utils.model_registry.get_model_registry")
    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_prefix_injection(self, mock_rate_limit_llm, mock_get_registry):
        """Verify model name gets openrouter/ prefix when provider is openrouter"""
        # Mock registry to return no fallbacks to isolate prefix testing
        mock_registry = mock_get_registry.return_value
        mock_registry.get_provider.return_value = {"defaults": {}}

        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "openrouter"):
            create_chat_model("openai/gpt-5.2")

            mock_rate_limit_llm.assert_called_with(
                model="openrouter/openai/gpt-5.2", temperature=ANY
            )

    @patch("utils.model_registry.get_model_registry")
    @patch("utils.openai_client.RateLimitAwareChatLiteLLM")
    def test_openrouter_no_double_prefix(self, mock_rate_limit_llm, mock_get_registry):
        """Verify already-prefixed model is not double-prefixed"""
        # Mock registry to return no fallbacks
        mock_registry = mock_get_registry.return_value
        mock_registry.get_provider.return_value = {"defaults": {}}

        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "test-key"}, clear=False), \
             patch.object(settings, "LLM_PROVIDER", "openrouter"):
            create_chat_model("openrouter/openai/gpt-5.2")

            mock_rate_limit_llm.assert_called_with(
                model="openrouter/openai/gpt-5.2", temperature=ANY
            )
