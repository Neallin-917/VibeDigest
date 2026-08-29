import importlib.util
import subprocess
import sys
import stat
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "dev.py"
spec = importlib.util.spec_from_file_location("vibedigest_dev_runner", SCRIPT_PATH)
dev_runner = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = dev_runner
spec.loader.exec_module(dev_runner)


def test_find_available_port_skips_occupied_ports():
    checked: list[int] = []

    def is_available(port: int) -> bool:
        checked.append(port)
        return port == 16083

    assert (
        dev_runner.find_available_port(16081, limit=5, is_available=is_available)
        == 16083
    )
    assert checked == [16081, 16082, 16083]


def test_find_available_port_raises_when_range_is_exhausted():
    def is_available(_port: int) -> bool:
        return False

    try:
        dev_runner.find_available_port(3000, limit=2, is_available=is_available)
    except RuntimeError as error:
        assert "3000-3001" in str(error)
    else:
        raise AssertionError("expected RuntimeError")


def test_build_frontend_env_injects_resolved_backend_url(tmp_path):
    (tmp_path / ".env").write_text("NEXT_PUBLIC_API_URL=http://from-env\nROOT_ONLY=1\n")
    (tmp_path / ".env.local").write_text(
        "BACKEND_API_URL=http://from-local\nLOCAL_ONLY=1\n"
    )

    env = dev_runner.build_frontend_env(
        base_env={"NEXT_PUBLIC_API_URL": "http://from-shell"},
        project_root=tmp_path,
        frontend_port=3001,
        backend_port=16082,
        workspace_id="main",
    )

    assert env["PORT"] == "3001"
    assert env["WORKSPACE_ID"] == "main"
    assert env["NEXT_PUBLIC_API_URL"] == "http://localhost:16082"
    assert env["BACKEND_API_URL"] == "http://localhost:16082"
    assert env["LLM_RUNTIME"] == "codex_local"
    assert env["ROOT_ONLY"] == "1"
    assert env["LOCAL_ONLY"] == "1"


def test_build_frontend_env_preserves_explicit_api_runtime(tmp_path):
    env = dev_runner.build_frontend_env(
        base_env={"LLM_RUNTIME": "api", "LLM_PROVIDER": "openrouter"},
        project_root=tmp_path,
        frontend_port=3001,
        backend_port=16082,
        workspace_id="main",
    )

    assert env["LLM_RUNTIME"] == "api"
    assert env["LLM_PROVIDER"] == "openrouter"


def test_build_compose_env_sets_dynamic_ports_and_frontend_origin():
    env = dev_runner.build_compose_env(
        base_env={"ALLOWED_ORIGINS": "https://example.com"},
        backend_port=16082,
        frontend_port=3001,
    )

    assert env["COMPOSE_PROJECT_NAME"] == "vibedigest-dev"
    assert env["BACKEND_HOST_PORT"] == "16082"
    assert env["FRONTEND_HOST_PORT"] == "3001"
    assert env["FRONTEND_URL"] == "http://localhost:3001"
    assert env["ALLOWED_ORIGINS"] == (
        "https://example.com,http://localhost:3001,http://127.0.0.1:3001"
    )


def test_local_agent_key_is_private_stable_and_shared_across_launchers(tmp_path):
    first = {}
    dev_runner.configure_local_agent(first, tmp_path, 3000)
    key_path = tmp_path / ".agent-service-key"
    assert stat.S_IMODE(key_path.stat().st_mode) == 0o600
    assert len(first["AGENT_INTERNAL_SECRET"]) >= 32
    assert first["AGENT_CONTINUATION_QUEUE"].startswith("agent_answers_local_")
    assert first["AGENT_CONTINUATION_RUNTIME"] == "codex_local"
    second = {"LLM_RUNTIME": "api"}
    dev_runner.configure_local_agent(second, tmp_path, 3001)
    assert second["AGENT_INTERNAL_SECRET"] == first["AGENT_INTERNAL_SECRET"]
    assert second["AGENT_CONTINUATION_QUEUE"] == first["AGENT_CONTINUATION_QUEUE"]
    assert second["AGENT_CONTINUATION_RUNTIME"] == "api"
    assert (
        second["AGENT_CONTINUATION_URL"]
        == "http://host.docker.internal:3001/api/internal/agent/continue"
    )


def test_local_agent_preserves_explicit_secret_and_callback(tmp_path):
    env = {
        "AGENT_INTERNAL_SECRET": "x" * 40,
        "AGENT_CONTINUATION_URL": "https://local.test/api/internal/agent/continue",
    }
    dev_runner.configure_local_agent(env, tmp_path, 3000)
    assert not (tmp_path / ".agent-service-key").exists()
    assert env["AGENT_CONTINUATION_URL"].startswith("https://local.test")


def test_local_agent_rejects_short_secret(tmp_path):
    import pytest

    with pytest.raises(RuntimeError, match="32"):
        dev_runner.configure_local_agent(
            {"AGENT_INTERNAL_SECRET": "short"}, tmp_path, 3000
        )


def test_parse_compose_port_handles_ipv4_and_ipv6_output():
    assert dev_runner.parse_compose_port("0.0.0.0:16081\n") == 16081
    assert dev_runner.parse_compose_port("[::]:15432\n") == 15432
    assert dev_runner.parse_compose_port("") is None


def test_has_env_override_ignores_empty_values(monkeypatch):
    monkeypatch.setenv("BACKEND_HOST_PORT", "")
    assert dev_runner.has_env_override("BACKEND_HOST_PORT") is False

    monkeypatch.setenv("BACKEND_HOST_PORT", "17081")
    assert dev_runner.has_env_override("BACKEND_HOST_PORT") is True


def test_stop_processes_terminates_and_kills_stuck_process():
    class StuckProcess:
        terminated = False
        killed = False

        def poll(self):
            return None

        def terminate(self):
            self.terminated = True

        def wait(self, timeout=None):
            if self.killed:
                return 0
            raise subprocess.TimeoutExpired(cmd="fake", timeout=timeout)

        def kill(self):
            self.killed = True

    process = StuckProcess()
    handle = dev_runner.ProcessHandle(label="fake", process=process, thread=None)

    dev_runner.stop_processes([handle], timeout=0.01)

    assert process.terminated is True
    assert process.killed is True
