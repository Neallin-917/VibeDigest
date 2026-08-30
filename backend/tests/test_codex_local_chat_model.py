from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from utils.codex_local_chat_model import (
    CodexLocalChatModel,
    render_messages_as_prompt,
)
from services.summarizer.config import SummarizerConfig


def test_render_messages_as_prompt_preserves_roles():
    prompt = render_messages_as_prompt(
        [SystemMessage(content="Follow the schema."), HumanMessage(content="Summarize.")]
    )

    assert "<SYSTEM>\nFollow the schema.\n</SYSTEM>" in prompt
    assert "<HUMAN>\nSummarize.\n</HUMAN>" in prompt


@pytest.mark.asyncio
async def test_codex_local_model_returns_langchain_ai_message():
    model = CodexLocalChatModel(model_name="local-test-model")

    with patch.object(
        CodexLocalChatModel,
        "_run_codex_turn",
        new=AsyncMock(return_value="Codex answer<STOP>ignored"),
    ) as run_turn:
        result = await model._agenerate(
            [HumanMessage(content="Answer the question")], stop=["<STOP>"]
        )

    assert result.generations[0].message.content == "Codex answer"
    assert "<HUMAN>" in run_turn.await_args.args[0]


@pytest.mark.asyncio
async def test_codex_local_model_times_out():
    model = CodexLocalChatModel(model_name="local-test-model", timeout_seconds=1)

    async def never_returns(_: CodexLocalChatModel, __: str) -> str:
        await __import__("asyncio").sleep(2)
        return "unreachable"

    with patch.object(CodexLocalChatModel, "_run_codex_turn", new=never_returns):
        with pytest.raises(
            TimeoutError, match="Codex local inference timed out after 1 seconds"
        ):
            await model._agenerate([HumanMessage(content="Answer the question")])


def test_summarizer_accepts_codex_local_auth_without_an_api_key(monkeypatch):
    from services.summarizer import config as summarizer_config_module

    monkeypatch.setattr(
        summarizer_config_module.settings, "LLM_RUNTIME", "codex_local"
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    config = SummarizerConfig()

    assert config.api_key is None
    assert config.is_llm_available is True
