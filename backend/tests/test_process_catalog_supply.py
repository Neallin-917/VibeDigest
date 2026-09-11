import importlib.util
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def supply_script():
    worker_module = SimpleNamespace(
        build_worker=AsyncMock(),
        drain_worker=AsyncMock(return_value=2),
        verify_codex_subscription=AsyncMock(),
    )
    profile = object()
    policy = SimpleNamespace(
        resolve_worker_profile=MagicMock(return_value=profile),
        validate_worker_runtime=MagicMock(),
    )
    scope = SimpleNamespace(
        ScopedCatalogSummaryQueue=MagicMock(), read_task_ids=MagicMock()
    )
    modules = {
        "worker": worker_module,
        "utils.env_loader": SimpleNamespace(load_env=MagicMock()),
        "config": SimpleNamespace(
            settings=SimpleNamespace(LLM_RUNTIME="codex_local", LLM_PROVIDER="openrouter")
        ),
        "services.execution_policy": policy,
        "services.catalog_backfill_scope": scope,
    }
    script_path = Path(__file__).resolve().parents[1] / "scripts/tasks/process_catalog_supply.py"
    spec = importlib.util.spec_from_file_location("catalog_supply_script_under_test", script_path)
    module = importlib.util.module_from_spec(spec)
    # The CLI sets environment defaults at import time. Restore all of them and
    # avoid importing the real worker or loading developer credentials.
    with patch.dict(os.environ), patch.dict(sys.modules, modules):
        os.environ.pop("RAILWAY_PROJECT_ID", None)
        spec.loader.exec_module(module)
        yield SimpleNamespace(
            module=module, worker=worker_module, policy=policy, profile=profile, scope=scope
        )


@pytest.mark.asyncio
async def test_preflight_only_verifies_without_constructing_or_draining_worker(supply_script, capsys):
    assert await supply_script.module.run(4, preflight_only=True) == 0

    supply_script.policy.validate_worker_runtime.assert_called_once_with(
        supply_script.profile,
        llm_runtime="codex_local",
        llm_provider="openrouter",
        is_railway=False,
    )
    supply_script.worker.verify_codex_subscription.assert_awaited_once_with()
    supply_script.worker.build_worker.assert_not_called()
    supply_script.worker.drain_worker.assert_not_called()
    supply_script.scope.ScopedCatalogSummaryQueue.assert_not_called()
    assert json.loads(capsys.readouterr().out) == {"preflight": "passed"}


@pytest.mark.asyncio
@pytest.mark.parametrize("failure_stage", ["runtime", "subscription"])
async def test_preflight_failure_propagates_without_accessing_worker(supply_script, capsys, failure_stage):
    failure = RuntimeError("preflight rejected")
    if failure_stage == "runtime":
        supply_script.policy.validate_worker_runtime.side_effect = failure
    else:
        supply_script.worker.verify_codex_subscription.side_effect = failure

    with pytest.raises(RuntimeError, match="preflight rejected"):
        await supply_script.module.run(4, preflight_only=True)

    supply_script.worker.build_worker.assert_not_called()
    supply_script.worker.drain_worker.assert_not_called()
    if failure_stage == "runtime":
        supply_script.worker.verify_codex_subscription.assert_not_called()
    assert capsys.readouterr().out == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("scoped", [False, True])
async def test_normal_batch_builds_and_drains_with_requested_limit(supply_script, capsys, scoped):
    db = object()
    worker = SimpleNamespace(
        profile=SimpleNamespace(name=SimpleNamespace(value="trusted_codex")),
        queue=SimpleNamespace(queue_name="podcast_supply", db=db),
    )
    supply_script.worker.build_worker.return_value = worker
    scoped_queue = SimpleNamespace(queue_name="podcast_supply")
    supply_script.scope.ScopedCatalogSummaryQueue.return_value = scoped_queue
    task_ids = ["00000000-0000-0000-0000-000000000001"] if scoped else None

    assert await supply_script.module.run(3, task_ids) == 0

    supply_script.worker.build_worker.assert_awaited_once_with()
    supply_script.worker.drain_worker.assert_awaited_once_with(worker, max_jobs=3)
    if scoped:
        supply_script.scope.ScopedCatalogSummaryQueue.assert_called_once_with(
            db, task_ids=task_ids, queue_name="podcast_supply"
        )
        assert worker.queue is scoped_queue
    else:
        supply_script.scope.ScopedCatalogSummaryQueue.assert_not_called()
    assert json.loads(capsys.readouterr().out) == {
        "execution_profile": "trusted_codex",
        "queue": "podcast_supply",
        "processed": 2,
    }


def test_cli_preflight_failure_returns_error_status(supply_script, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["process_catalog_supply.py", "--preflight-only"])
    supply_script.worker.verify_codex_subscription.side_effect = RuntimeError("model unavailable")

    assert supply_script.module.main() == 1

    output = capsys.readouterr()
    assert output.out == ""
    assert json.loads(output.err) == {"error": "model unavailable"}
    supply_script.worker.build_worker.assert_not_called()
    supply_script.worker.drain_worker.assert_not_called()
