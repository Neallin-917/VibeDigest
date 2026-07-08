import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


def load_verify_config_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "llm" / "verify_config.py"
    spec = importlib.util.spec_from_file_location("verify_config_script", module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    content = "provider is operational"


class SuccessfulModel:
    async def ainvoke(self, _prompt):
        return FakeResponse()


class FailingModel:
    async def ainvoke(self, _prompt):
        raise RuntimeError("provider unavailable")


@pytest.mark.asyncio
async def test_verify_connection_returns_true_on_success(monkeypatch):
    module = load_verify_config_module()

    monkeypatch.setattr(module, "settings", SimpleNamespace(MODEL_FAST="test-model", LLM_PROVIDER="custom"))
    monkeypatch.setattr(module, "create_chat_model", lambda _model_name: SuccessfulModel())

    assert await module.verify_connection() is True


@pytest.mark.asyncio
async def test_verify_connection_returns_false_on_failure(monkeypatch):
    module = load_verify_config_module()

    monkeypatch.setattr(module, "settings", SimpleNamespace(MODEL_FAST="test-model", LLM_PROVIDER="custom"))
    monkeypatch.setattr(module, "create_chat_model", lambda _model_name: FailingModel())

    assert await module.verify_connection() is False


def test_main_returns_failure_when_connection_check_fails(monkeypatch):
    module = load_verify_config_module()

    monkeypatch.setattr(module, "verify_config", lambda: None)
    monkeypatch.setattr(module, "verify_factory_logic", lambda: None)
    monkeypatch.setattr(module, "verify_connection", AsyncMock(return_value=False))

    assert module.main(["--connect"]) == 1
