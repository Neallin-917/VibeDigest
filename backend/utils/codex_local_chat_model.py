"""LangChain adapter for trusted local Codex inference.

The adapter deliberately creates an ephemeral, read-only Codex thread per
request. It is used by trusted local development and the bounded internal
catalog-supply worker. Hosted product services keep using an HTTP provider,
while CI continues to use mocks and replay fixtures.
"""

from __future__ import annotations

import asyncio
from typing import Any, ClassVar

from langchain_core.callbacks.manager import (
    AsyncCallbackManagerForLLMRun,
    CallbackManagerForLLMRun,
)
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult


def _message_text(message: BaseMessage) -> str:
    """Render LangChain message content without assuming a provider format."""
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return str(content)


def render_messages_as_prompt(messages: list[BaseMessage]) -> str:
    """Preserve message roles when passing a conversation to Codex."""
    rendered = []
    for message in messages:
        role = getattr(message, "type", "message").upper()
        rendered.append(f"<{role}>\n{_message_text(message)}\n</{role}>")
    return "\n\n".join(rendered)


def _apply_stop_sequences(text: str, stop: list[str] | None) -> str:
    if not stop:
        return text
    positions = [text.find(sequence) for sequence in stop if sequence]
    positions = [position for position in positions if position >= 0]
    return text[: min(positions)] if positions else text


class CodexLocalChatModel(BaseChatModel):
    """A minimal chat-model port backed by the local Codex app-server."""

    model_name: str
    temperature: float = 0.1
    max_tokens: int = 4000
    timeout_seconds: int = 120
    max_concurrency: int = 1
    codex_binary: str | None = None
    working_directory: str | None = None
    disable_streaming: bool = True

    _semaphore: ClassVar[asyncio.Semaphore | None] = None
    _semaphore_limit: ClassVar[int | None] = None

    @property
    def _llm_type(self) -> str:
        return "codex_local"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {
            "model_name": self.model_name,
            "runtime": "codex_local",
            "max_tokens": self.max_tokens,
        }

    @classmethod
    def _get_semaphore(cls, limit: int) -> asyncio.Semaphore:
        if cls._semaphore is None or cls._semaphore_limit != limit:
            cls._semaphore = asyncio.Semaphore(limit)
            cls._semaphore_limit = limit
        return cls._semaphore

    async def _run_codex_turn(self, prompt: str) -> str:
        """Run one ephemeral, least-privilege Codex turn."""
        from openai_codex import ApprovalMode, AsyncCodex, CodexConfig, Sandbox

        config = CodexConfig(codex_bin=self.codex_binary)
        async with AsyncCodex(config) as codex:
            thread = await codex.thread_start(
                approval_mode=ApprovalMode.deny_all,
                cwd=self.working_directory,
                developer_instructions=(
                    "You are a local VibeDigest inference runner. Answer only from "
                    "the supplied conversation. Do not read files, run commands, use "
                    "MCP tools, browse the web, or take actions outside this response. "
                    "Return only the requested final content."
                ),
                ephemeral=True,
                model=self.model_name,
                sandbox=Sandbox.read_only,
            )
            result = await thread.run(prompt, sandbox=Sandbox.read_only)

        if not result.final_response:
            raise RuntimeError("Codex local runner returned no final response")
        return result.final_response

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **_: Any,
    ) -> ChatResult:
        del run_manager
        prompt = render_messages_as_prompt(messages)
        semaphore = self._get_semaphore(self.max_concurrency)
        async with semaphore:
            try:
                response_text = await asyncio.wait_for(
                    self._run_codex_turn(prompt), timeout=self.timeout_seconds
                )
            except TimeoutError as exc:
                raise TimeoutError(
                    "Codex local inference timed out after "
                    f"{self.timeout_seconds} seconds"
                ) from exc

        response_text = _apply_stop_sequences(response_text, stop)
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=response_text))]
        )

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        del run_manager
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(self._agenerate(messages, stop=stop, **kwargs))
        raise RuntimeError(
            "Use ainvoke() with CodexLocalChatModel from an active event loop"
        )
