"""Offline checks for the database-free trusted Codex preflight."""

import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from services import codex_preflight


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def preflight_settings(monkeypatch):
    settings = SimpleNamespace(
        LLM_RUNTIME="codex_local",
        LLM_PROVIDER="codex_local",
        CODEX_LOCAL_BINARY=None,
        MODEL_SMART="test-smart",
        MODEL_FAST="test-fast",
    )
    monkeypatch.setattr(codex_preflight, "settings", settings)
    monkeypatch.setenv("WORKER_PROFILE", "trusted_codex")
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    return settings


@pytest.fixture
def sdk():
    client = SimpleNamespace(
        account=AsyncMock(return_value=SimpleNamespace(account=SimpleNamespace(
            root=SimpleNamespace(type="chatgpt", plan_type="plus"),
        ))),
        models=AsyncMock(return_value=SimpleNamespace(data=[
            SimpleNamespace(id="unrelated-smart-id", model="test-smart"),
            SimpleNamespace(id="unrelated-fast-id", model="test-fast"),
        ])),
    )
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=context), client


async def test_preflight_checks_both_configured_aliases(preflight_settings, sdk):
    factory, client = sdk
    result = await codex_preflight.preflight_podcast_supply(codex_factory=factory)
    assert result == {
        "execution_profile": "trusted_codex",
        "llm_runtime": "codex_local",
        "llm_provider": "codex_local",
        "auth_mode": "chatgpt_subscription",
        "plan": "plus",
        "smart": "test-smart",
        "fast": "test-fast",
        "status": "passed",
    }
    client.account.assert_awaited_once_with(refresh_token=False)
    client.models.assert_awaited_once_with(include_hidden=True)


@pytest.mark.parametrize("missing", ["smart", "fast"])
async def test_preflight_rejects_missing_model(preflight_settings, sdk, missing):
    factory, client = sdk
    client.models.return_value.data = [SimpleNamespace(
        model="test-fast" if missing == "smart" else "test-smart",
    )]
    with pytest.raises(RuntimeError, match=f"{missing}=test-{missing}"):
        await codex_preflight.preflight_podcast_supply(codex_factory=factory)


@pytest.mark.parametrize("account", [None, SimpleNamespace(type="apiKey")])
async def test_preflight_requires_chatgpt_login(preflight_settings, sdk, account):
    factory, client = sdk
    client.account.return_value = SimpleNamespace(account=SimpleNamespace(root=account))
    with pytest.raises(RuntimeError, match="ChatGPT subscription login"):
        await codex_preflight.preflight_podcast_supply(codex_factory=factory)
    client.models.assert_not_awaited()


@pytest.mark.parametrize("failure", ["profile", "runtime", "provider", "railway"])
async def test_preflight_rejects_invalid_execution_before_sdk(
    preflight_settings, sdk, monkeypatch, failure,
):
    factory, _ = sdk
    if failure == "profile":
        monkeypatch.setenv("WORKER_PROFILE", "hosted_api")
    elif failure == "runtime":
        preflight_settings.LLM_RUNTIME = "api"
    elif failure == "provider":
        preflight_settings.LLM_PROVIDER = "openrouter"
    else:
        monkeypatch.setenv("RAILWAY_PROJECT_ID", "test-project")
    with pytest.raises(RuntimeError):
        await codex_preflight.preflight_podcast_supply(codex_factory=factory)
    factory.assert_not_called()


def run_isolated_cli(*, sdk_failure=False, railway=False, config_env=None):
    """Execute the real CLI in a fresh interpreter, with no app/test imports."""
    harness = textwrap.dedent("""
        import importlib.abc
        import os
        import runpy
        import socket
        import sys
        from types import ModuleType, SimpleNamespace

        forbidden = {
            'worker', 'dependencies', 'db_client', 'services.task_queue',
            'services.catalog_backfill_scope',
        }
        class BlockDataPlane(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if any(fullname == name or fullname.startswith(name + '.')
                       for name in forbidden):
                    raise AssertionError('Forbidden data-plane import: ' + fullname)
        sys.meta_path.insert(0, BlockDataPlane())
        def block_network(*args, **kwargs):
            raise AssertionError('Preflight attempted network access')
        socket.socket.connect = block_network
        socket.socket.connect_ex = block_network
        socket.create_connection = block_network
        socket.getaddrinfo = block_network

        loader = ModuleType('utils.env_loader')
        loader.load_env = lambda: None
        sys.modules['utils.env_loader'] = loader

        sdk = ModuleType('openai_codex')
        class FakeCodex:
            def __init__(self, config):
                pass
            async def __aenter__(self):
                if os.environ.get('TEST_SDK_FAILURE') == '1':
                    raise RuntimeError('SDK unavailable')
                return self
            async def __aexit__(self, *args):
                return False
            async def account(self, *, refresh_token):
                assert refresh_token is False
                return SimpleNamespace(account=SimpleNamespace(root=SimpleNamespace(
                    type='chatgpt', plan_type='plus', email='private@example.test',
                )))
            async def models(self, *, include_hidden):
                assert include_hidden is True
                return SimpleNamespace(data=[
                    SimpleNamespace(model='test-smart'),
                    SimpleNamespace(model='test-fast'),
                ])
        sdk.AsyncCodex = FakeCodex
        sdk.CodexConfig = lambda **kwargs: SimpleNamespace(**kwargs)
        sys.modules['openai_codex'] = sdk
        assert not any(key.startswith(('DATABASE_', 'SUPABASE_')) for key in os.environ)
        if os.environ.get('TEST_CONFIG_ONLY') == '1':
            import json
            sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(sys.argv[1]))))
            try:
                import config
            except Exception as exc:
                print(json.dumps({'error': str(exc)}), file=sys.stderr)
                raise SystemExit(1)
            raise SystemExit(0)
        runpy.run_path(sys.argv[1], run_name='__main__')
    """)
    env = {
        "PATH": os.defpath,
        "MODEL_ALIAS_SMART": "test-smart",
        "MODEL_ALIAS_FAST": "test-fast",
        "TEST_SDK_FAILURE": "1" if sdk_failure else "0",
        "LOG_LEVEL": "ERROR",
    }
    if railway:
        env["RAILWAY_PROJECT_ID"] = "test-project"
    if config_env is not None:
        env.update(config_env)
        env["TEST_CONFIG_ONLY"] = "1"
    return subprocess.run(
        [sys.executable, "-c", harness,
         str(ROOT / "backend/scripts/tasks/preflight_catalog_supply.py")],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=20,
    )


def test_cli_succeeds_without_database_credentials_imports_or_connections():
    result = run_isolated_cli()
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["status"] == "passed"
    assert report["smart"] == "test-smart"
    assert report["fast"] == "test-fast"
    assert report["execution_profile"] == "trusted_codex"
    assert "private@example.test" not in result.stdout + result.stderr
    assert "email" not in report


def test_cli_sdk_failure_returns_nonzero_json():
    result = run_isolated_cli(sdk_failure=True)
    assert result.returncode == 1
    assert json.loads(result.stderr)["error"] == "SDK unavailable"


def test_cli_rejects_railway():
    result = run_isolated_cli(railway=True)
    assert result.returncode == 1
    assert "trusted private runner" in json.loads(result.stderr)["error"]


@pytest.mark.parametrize("profile,runtime,error", [
    ("hosted_api", "codex_local", "WORKER_PROFILE=trusted_codex"),
    ("trusted_codex", "api", "LLM_RUNTIME=codex_local"),
    ("trusted_codex", "invalid", "LLM_RUNTIME must be"),
])
def test_preflight_config_role_does_not_bypass_profile_validation(profile, runtime, error):
    result = run_isolated_cli(config_env={
        "VIBEDIGEST_PROCESS_ROLE": "podcast_preflight",
        "WORKER_PROFILE": profile,
        "LLM_RUNTIME": runtime,
    })
    assert result.returncode == 1
    assert error in json.loads(result.stderr)["error"]


def test_application_config_still_requires_database_credentials():
    result = run_isolated_cli(config_env={
        "VIBEDIGEST_PROCESS_ROLE": "application",
        "WORKER_PROFILE": "trusted_codex",
        "LLM_RUNTIME": "codex_local",
    })
    assert result.returncode == 1
    assert "DATABASE_URL" in json.loads(result.stderr)["error"]


def test_make_preflight_only_launches_standalone_cli():
    result = subprocess.run(
        ["make", "--dry-run", "preflight-podcast-supply"],
        cwd=ROOT, capture_output=True, text=True, check=True, timeout=10,
    )
    assert result.stdout.strip() == (
        "uv run python backend/scripts/tasks/preflight_catalog_supply.py"
    )
