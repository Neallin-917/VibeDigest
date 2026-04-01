"""Tests for utils/llm_router.py — simplified model resolution."""

from types import SimpleNamespace
from unittest.mock import MagicMock, AsyncMock, patch

import pytest


class TestResolveModelForIntent:
    def test_smart_intents_return_smart_model(self):
        mock_settings = SimpleNamespace(MODEL_SMART="gpt-5", MODEL_FAST="gpt-5-mini")
        with patch("utils.llm_router.settings", mock_settings):
            from utils.llm_router import resolve_model_for_intent
            for intent in ["chat", "comprehension", "summary"]:
                assert resolve_model_for_intent(intent) == "gpt-5"

    def test_fast_intents_return_fast_model(self):
        mock_settings = SimpleNamespace(MODEL_SMART="gpt-5", MODEL_FAST="gpt-5-mini")
        with patch("utils.llm_router.settings", mock_settings):
            from utils.llm_router import resolve_model_for_intent
            fast_intents = [
                "translation", "guard", "helper",
                "transcript_optimize", "paragraph", "json_repair", "classifier",
            ]
            for intent in fast_intents:
                assert resolve_model_for_intent(intent) == "gpt-5-mini", (
                    f"Intent '{intent}' should resolve to fast model"
                )

    def test_unknown_intent_defaults_to_smart(self):
        mock_settings = SimpleNamespace(MODEL_SMART="gpt-5", MODEL_FAST="gpt-5-mini")
        with patch("utils.llm_router.settings", mock_settings):
            from utils.llm_router import resolve_model_for_intent
            assert resolve_model_for_intent("nonexistent") == "gpt-5"

class TestCreateChatModelForIntent:
    def test_creates_model_with_resolved_intent(self):
        mock_model = MagicMock()
        mock_settings = SimpleNamespace(
            MODEL_SMART="gpt-5", MODEL_FAST="gpt-5-mini",
            DEFAULT_MAX_TOKENS=4000,
        )
        with patch("utils.llm_router.resolve_model_for_intent", return_value="gpt-5-mini"), \
             patch("utils.llm_router.create_chat_model", return_value=mock_model) as mock_create, \
             patch("utils.llm_router.settings", mock_settings):
            from utils.llm_router import create_chat_model_for_intent
            result = create_chat_model_for_intent("translation")

        mock_create.assert_called_once()
        assert result is mock_model

    def test_explicit_model_name_skips_resolve(self):
        mock_model = MagicMock()
        mock_settings = SimpleNamespace(DEFAULT_MAX_TOKENS=4000)
        with patch("utils.llm_router.resolve_model_for_intent") as mock_resolve, \
             patch("utils.llm_router.create_chat_model", return_value=mock_model) as mock_create, \
             patch("utils.llm_router.settings", mock_settings):
            from utils.llm_router import create_chat_model_for_intent
            result = create_chat_model_for_intent("chat", model_name="custom-model")

        mock_resolve.assert_not_called()
        assert mock_create.call_args.kwargs["model_name"] == "custom-model"
        assert result is mock_model


class TestInvokeStructured:
    @pytest.mark.asyncio
    async def test_delegates_to_ainvoke_structured_json(self):
        expected = {"key": "value"}
        with patch("utils.llm_router.ainvoke_structured_json", new_callable=AsyncMock) as mock_ainvoke:
            mock_ainvoke.return_value = expected
            from utils.llm_router import invoke_structured
            result = await invoke_structured(
                llm=MagicMock(), schema=MagicMock(), messages=[],
            )

        assert result == expected
