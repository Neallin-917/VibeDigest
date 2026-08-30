import pytest

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from scripts import run_local_codex_chat as runner

from scripts.run_local_codex_chat import (
    MAX_PROMPT_CHARACTERS,
    LocalChatRequest,
    parse_request,
)


def test_parse_request_accepts_a_bounded_prompt():
    assert parse_request(
        '{"prompt":"Answer from this source.","model":"gpt-test","reasoning_effort":"high"}'
    ) == LocalChatRequest(
        prompt="Answer from this source.",
        model="gpt-test",
        reasoning_effort="high",
    )


@pytest.mark.parametrize(
    "payload",
    [
        "not json",
        "{}",
        '{"prompt":"   ","model":"gpt-test","reasoning_effort":"high"}',
        '{"prompt":"answer","model":"","reasoning_effort":"high"}',
        '{"prompt":"answer","model":"gpt-test","reasoning_effort":"ultra"}',
    ],
)
def test_parse_request_rejects_invalid_payloads(payload: str):
    with pytest.raises(ValueError):
        parse_request(payload)


def test_parse_request_rejects_oversized_prompt():
    with pytest.raises(ValueError, match="safety limit"):
        parse_request(
            '{"prompt":"'
            + ("x" * (MAX_PROMPT_CHARACTERS + 1))
            + '","model":"gpt-test","reasoning_effort":"high"}'
        )


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "http://localhost:1234",
        "http://127.0.0.1:1234/path",
        "http://user:password@127.0.0.1:1234",
        "http://127.0.0.1:1234?token=x",
        "http://127.0.0.1",
        "http://127.0.0.1:1234#fragment",
    ],
)
def test_callback_is_exact_loopback_only(url):
    with pytest.raises(ValueError):
        runner.validate_callback(url, "x" * 64)


def test_isolation_disables_global_tools_and_plugins_without_mutating_config():
    config = {
        "mcp_servers": {"global": {"command": "sensitive"}},
        "plugins": {"other": {"enabled": True}},
    }
    request = runner.LocalChatRequest(
        "prompt",
        "test-model",
        "high",
        callback_url="http://127.0.0.1:1234",
        callback_token="x" * 64,
    )
    isolated = runner.isolated_thread_config(config, request)
    assert isolated["mcp_servers"]["global"] == {"enabled": False}
    assert isolated["plugins"]["other"]["enabled"] is False
    assert isolated["features"]["plugins"] is False
    assert isolated["features"]["shell_tool"] is False
    assert isolated["web_search"] == "disabled"
    assert isolated["mcp_servers"]["vibedigest"]["required"] is True
    assert config["plugins"]["other"]["enabled"] is True


def _event(method, payload):
    return SimpleNamespace(
        method=method, payload=SimpleNamespace(model_dump=lambda **_: payload)
    )


@pytest.fixture
def fake_sdk(monkeypatch):
    state = SimpleNamespace(
        account_type="chatgpt",
        tools=[],
        interrupted=False,
        unregistered=False,
        thread_config=None,
        closed=False,
        events=[
            _event("item/agentMessage/delta", {"delta": "A grounded answer"}),
            _event(
                "thread/tokenUsage/updated",
                {
                    "tokenUsage": {
                        "total": {
                            "inputTokens": 10,
                            "outputTokens": 4,
                            "totalTokens": 14,
                        }
                    }
                },
            ),
            _event(
                "item/completed",
                {"item": {"type": "mcpToolCall", "result": "PRIVATE SOURCE"}},
            ),
            _event("turn/completed", {"turn": {"status": "completed"}}),
        ],
    )

    class Client:
        def __init__(self, config):
            assert config.experimental_api is False

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            state.closed = True

        async def initialize(self):
            pass

        async def account_read(self, params):
            return SimpleNamespace(
                account=SimpleNamespace(root=SimpleNamespace(type=state.account_type))
            )

        async def request(self, method, params, **kwargs):
            if method == "config/read":
                return SimpleNamespace(
                    config=SimpleNamespace(
                        model_dump=lambda: {"mcp_servers": {"other": {}}}
                    )
                )
            if method == "skills/list":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=state.tools, next_cursor=None)

        async def thread_start(self, params):
            state.thread_config = params.config
            return SimpleNamespace(thread=SimpleNamespace(id="thread"))

        async def turn_start(self, *args, **kwargs):
            return SimpleNamespace(turn=SimpleNamespace(id="turn"))

        def register_turn_notifications(self, turn_id):
            pass

        def unregister_turn_notifications(self, turn_id):
            state.unregistered = True

        async def next_turn_notification(self, turn_id):
            item = state.events.pop(0)
            if isinstance(item, BaseException):
                raise item
            return item

        async def turn_interrupt(self, *args):
            state.interrupted = True

    monkeypatch.setattr(runner, "AsyncCodexClient", Client)
    return state


@pytest.mark.asyncio
async def test_official_runner_emits_only_public_text_and_usage(fake_sdk, capsys):
    await runner.run(LocalChatRequest("question", "test-model", "high"))
    output = capsys.readouterr().out
    assert "A grounded answer" in output and "inputTokens" in output
    assert "PRIVATE SOURCE" not in output
    assert fake_sdk.closed and fake_sdk.unregistered


@pytest.mark.asyncio
async def test_official_runner_rejects_non_subscription_auth(fake_sdk):
    fake_sdk.account_type = "apiKey"
    with pytest.raises(RuntimeError, match="subscription"):
        await runner.run(LocalChatRequest("question", "test-model", "high"))
    assert fake_sdk.closed


@pytest.mark.asyncio
async def test_official_runner_fails_closed_on_unrelated_mcp(fake_sdk):
    fake_sdk.tools = [SimpleNamespace(name="other", tools={"dangerous": {}})]
    with pytest.raises(RuntimeError, match="not isolated"):
        await runner.run(LocalChatRequest("question", "test-model", "high"))


@pytest.mark.asyncio
async def test_official_runner_requires_exact_turn_tool_inventory(
    fake_sdk, monkeypatch
):
    monkeypatch.setattr(
        runner, "callback_request", AsyncMock(return_value=[{"name": "read_source"}])
    )
    with pytest.raises(RuntimeError, match="capabilities"):
        await runner.run(
            LocalChatRequest(
                "question",
                "test-model",
                "high",
                callback_url="http://127.0.0.1:1234",
                callback_token="x" * 64,
            )
        )


@pytest.mark.asyncio
async def test_official_runner_cancellation_interrupts_and_closes(fake_sdk):
    fake_sdk.events = [asyncio.CancelledError()]
    with pytest.raises(asyncio.CancelledError):
        await runner.run(LocalChatRequest("question", "test-model", "high"))
    assert fake_sdk.interrupted and fake_sdk.unregistered and fake_sdk.closed


@pytest.mark.asyncio
async def test_official_runner_does_not_claim_success_without_text(fake_sdk):
    fake_sdk.events = [_event("turn/completed", {"turn": {"status": "completed"}})]
    with pytest.raises(RuntimeError, match="no user-facing"):
        await runner.run(LocalChatRequest("question", "test-model", "high"))
