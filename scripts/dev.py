#!/usr/bin/env python3
"""Single-terminal Cloud development runner.

Starts the Docker API and worker against the configured Cloud development
database, plus the Next.js development server. All logs are prefixed so the
session can stay in one terminal.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, MutableMapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
COMPOSE_FILE = PROJECT_ROOT / "docker-compose.yml"
COMPOSE_PROJECT_NAME = "vibedigest-dev"
BACKEND_SERVICE = "backend-dev"
WORKER_SERVICE = "worker-dev"
BACKEND_CONTAINER_PORT = 8000
DEFAULT_BACKEND_PORT = 16081
DEFAULT_FRONTEND_PORT = 3000
DEFAULT_SCAN_LIMIT = 50
DEFAULT_HEALTH_TIMEOUT = 90


@dataclass(frozen=True)
class WorkspaceConfig:
    workspace_id: str
    frontend_port: int


@dataclass
class ProcessHandle:
    label: str
    process: subprocess.Popen
    thread: threading.Thread | None


def int_from_env(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None or raw_value.strip() == "":
        return default
    try:
        return int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw_value!r}") from exc


def has_env_override(name: str) -> bool:
    return bool(os.environ.get(name, "").strip())


def load_workspace_config(project_root: Path = PROJECT_ROOT) -> WorkspaceConfig:
    config_path = project_root / ".workspace.json"
    if not config_path.exists():
        return WorkspaceConfig(workspace_id="main", frontend_port=DEFAULT_FRONTEND_PORT)

    with config_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return WorkspaceConfig(
        workspace_id=str(data.get("workspace_id") or "main"),
        frontend_port=int(data.get("frontend_port") or DEFAULT_FRONTEND_PORT),
    )


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def find_available_port(
    start_port: int,
    *,
    limit: int = DEFAULT_SCAN_LIMIT,
    is_available: Callable[[int], bool] = is_port_available,
) -> int:
    for port in range(start_port, start_port + limit):
        if is_available(port):
            return port
    end_port = start_port + limit - 1
    raise RuntimeError(f"No available port found in range {start_port}-{end_port}")


def describe_port_owner(port: int) -> str:
    if not shutil.which("lsof"):
        return "lsof is not available"

    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
        capture_output=True,
        text=True,
        check=False,
    )
    output = result.stdout.strip()
    return output or "no listening process details found"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_dotenv_without_override(env: MutableMapping[str, str], project_root: Path) -> None:
    for env_file in (project_root / ".env.local", project_root / ".env"):
        for key, value in parse_env_file(env_file).items():
            env.setdefault(key, value)


def merge_allowed_origins(existing: str | None, frontend_port: int) -> str:
    candidates = [
        item.strip()
        for item in (existing or "").split(",")
        if item.strip()
    ]
    candidates.extend(
        [
            f"http://localhost:{frontend_port}",
            f"http://127.0.0.1:{frontend_port}",
        ]
    )

    unique: list[str] = []
    seen: set[str] = set()
    for origin in candidates:
        if origin in seen:
            continue
        seen.add(origin)
        unique.append(origin)
    return ",".join(unique)


def build_compose_env(
    *,
    base_env: Mapping[str, str],
    backend_port: int,
    frontend_port: int,
) -> dict[str, str]:
    env = dict(base_env)
    env["COMPOSE_PROJECT_NAME"] = COMPOSE_PROJECT_NAME
    env["BACKEND_HOST_PORT"] = str(backend_port)
    env["FRONTEND_HOST_PORT"] = str(frontend_port)
    env["FRONTEND_URL"] = f"http://localhost:{frontend_port}"
    env["ALLOWED_ORIGINS"] = merge_allowed_origins(env.get("ALLOWED_ORIGINS"), frontend_port)
    return env


def build_frontend_env(
    *,
    base_env: Mapping[str, str],
    project_root: Path,
    frontend_port: int,
    backend_port: int,
    workspace_id: str,
) -> dict[str, str]:
    env = dict(base_env)
    load_dotenv_without_override(env, project_root)
    backend_url = f"http://localhost:{backend_port}"
    env["PORT"] = str(frontend_port)
    env["FRONTEND_URL"] = f"http://localhost:{frontend_port}"
    env["NEXT_PUBLIC_API_URL"] = backend_url
    env["BACKEND_API_URL"] = backend_url
    env["WORKSPACE_ID"] = workspace_id
    return env


def resolve_compose_command() -> list[str]:
    override = os.environ.get("DOCKER_COMPOSE")
    if override:
        return shlex.split(override)

    if shutil.which("docker"):
        result = subprocess.run(
            ["docker", "compose", "version"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return ["docker", "compose"]

    if shutil.which("docker-compose"):
        return ["docker-compose"]

    raise RuntimeError("Docker Compose is not available. Install Docker Engine with Compose support.")


def parse_compose_port(output: str) -> int | None:
    for line in reversed(output.splitlines()):
        match = re.search(r":(\d+)\s*$", line.strip())
        if match:
            return int(match.group(1))
    return None


def get_existing_compose_port(
    *,
    compose_cmd: Sequence[str],
    compose_env: Mapping[str, str],
    service: str,
    container_port: int,
) -> int | None:
    result = subprocess.run(
        [*compose_cmd, "-f", str(COMPOSE_FILE), "port", service, str(container_port)],
        cwd=PROJECT_ROOT,
        env=dict(compose_env),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return parse_compose_port(result.stdout)


def resolve_service_port(
    *,
    name: str,
    requested_port: int,
    existing_port: int | None,
    explicit_override: bool,
    scan_limit: int,
) -> int:
    if existing_port == requested_port:
        return requested_port
    if existing_port is not None and not explicit_override:
        return existing_port

    try:
        return find_available_port(requested_port, limit=scan_limit)
    except RuntimeError as exc:
        print(f"[dev] {name} port scan failed from {requested_port}: {exc}")
        print(f"[dev] Port {requested_port} owner:\n{describe_port_owner(requested_port)}")
        raise


def run_prefixed_command(
    label: str,
    args: Sequence[str],
    *,
    cwd: Path,
    env: Mapping[str, str],
) -> tuple[int, str]:
    print(f"[{label}] $ {' '.join(shlex.quote(arg) for arg in args)}")
    process = subprocess.Popen(
        list(args),
        cwd=cwd,
        env=dict(env),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    lines: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        clean_line = line.rstrip()
        lines.append(clean_line)
        print(f"[{label}] {clean_line}", flush=True)

    return process.wait(), "\n".join(lines)


def pipe_output(label: str, process: subprocess.Popen) -> None:
    if process.stdout is None:
        return
    for line in process.stdout:
        print(f"[{label}] {line.rstrip()}", flush=True)


def start_prefixed_process(
    label: str,
    args: Sequence[str],
    *,
    cwd: Path,
    env: Mapping[str, str],
) -> ProcessHandle:
    process = subprocess.Popen(
        list(args),
        cwd=cwd,
        env=dict(env),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    thread = threading.Thread(target=pipe_output, args=(label, process), daemon=True)
    thread.start()
    return ProcessHandle(label=label, process=process, thread=thread)


def stop_processes(handles: Sequence[ProcessHandle], *, timeout: float = 5.0) -> None:
    for handle in handles:
        if handle.process.poll() is None:
            handle.process.terminate()

    for handle in handles:
        if handle.process.poll() is not None:
            continue
        try:
            handle.process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            handle.process.kill()
            handle.process.wait(timeout=timeout)

    for handle in handles:
        if handle.thread is not None:
            handle.thread.join(timeout=1)


def start_docker_log_tails(
    *,
    compose_cmd: Sequence[str],
    compose_env: Mapping[str, str],
) -> list[ProcessHandle]:
    common_args = [*compose_cmd, "-f", str(COMPOSE_FILE), "logs", "-f", "--no-color", "--no-log-prefix"]
    return [
        start_prefixed_process(
            "backend",
            [*common_args, BACKEND_SERVICE],
            cwd=PROJECT_ROOT,
            env=compose_env,
        ),
        start_prefixed_process(
            "worker",
            [*common_args, WORKER_SERVICE],
            cwd=PROJECT_ROOT,
            env=compose_env,
        ),
    ]


def wait_for_backend_health(backend_port: int, *, timeout: int = DEFAULT_HEALTH_TIMEOUT) -> tuple[bool, str]:
    url = f"http://127.0.0.1:{backend_port}/health"
    deadline = time.monotonic() + timeout
    last_error = "backend did not respond"

    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return True, "ok"
                last_error = f"HTTP {response.status}"
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = str(error)
        time.sleep(1)

    return False, last_error


def print_docker_diagnostics(
    *,
    compose_cmd: Sequence[str],
    compose_env: Mapping[str, str],
) -> None:
    print("[docker] compose ps")
    subprocess.run(
        [*compose_cmd, "-f", str(COMPOSE_FILE), "ps"],
        cwd=PROJECT_ROOT,
        env=dict(compose_env),
        check=False,
    )
    print("[docker] recent API/worker logs")
    subprocess.run(
        [*compose_cmd, "-f", str(COMPOSE_FILE), "logs", "--tail=80", BACKEND_SERVICE, WORKER_SERVICE],
        cwd=PROJECT_ROOT,
        env=dict(compose_env),
        check=False,
    )


def is_port_bind_error(output: str) -> bool:
    lowered = output.lower()
    return (
        "port is already allocated" in lowered
        or "bind for" in lowered
        or "address already in use" in lowered
    )


def start_compose_stack(
    *,
    compose_cmd: Sequence[str],
    compose_env: Mapping[str, str],
) -> tuple[bool, str]:
    code, output = run_prefixed_command(
        "docker",
        [*compose_cmd, "-f", str(COMPOSE_FILE), "up", "--build", "-d", BACKEND_SERVICE, WORKER_SERVICE],
        cwd=PROJECT_ROOT,
        env=compose_env,
    )
    return code == 0, output


def run_dev() -> int:
    workspace = load_workspace_config(PROJECT_ROOT)
    compose_cmd = resolve_compose_command()
    scan_limit = int_from_env("VIBEDIGEST_PORT_SCAN_LIMIT", DEFAULT_SCAN_LIMIT)
    health_timeout = int_from_env("VIBEDIGEST_HEALTH_TIMEOUT", DEFAULT_HEALTH_TIMEOUT)

    base_env = os.environ.copy()
    initial_compose_env = dict(base_env)
    initial_compose_env["COMPOSE_PROJECT_NAME"] = COMPOSE_PROJECT_NAME

    backend_start = int_from_env("BACKEND_HOST_PORT", DEFAULT_BACKEND_PORT)
    frontend_start = int_from_env("FRONTEND_PORT", workspace.frontend_port)

    existing_backend_port = get_existing_compose_port(
        compose_cmd=compose_cmd,
        compose_env=initial_compose_env,
        service=BACKEND_SERVICE,
        container_port=BACKEND_CONTAINER_PORT,
    )
    backend_port = resolve_service_port(
        name="backend",
        requested_port=backend_start,
        existing_port=existing_backend_port,
        explicit_override=has_env_override("BACKEND_HOST_PORT"),
        scan_limit=scan_limit,
    )
    frontend_port = find_available_port(frontend_start, limit=scan_limit)

    compose_env = build_compose_env(
        base_env=base_env,
        backend_port=backend_port,
        frontend_port=frontend_port,
    )

    print("[dev] Starting Docker API and worker against the configured Cloud development database")
    print(f"[dev] Backend:  http://localhost:{backend_port}")
    print(f"[dev] Frontend: http://localhost:{frontend_port}")

    stack_started, compose_output = start_compose_stack(compose_cmd=compose_cmd, compose_env=compose_env)
    if not stack_started and is_port_bind_error(compose_output):
        print("[dev] Docker reported a port bind race. Retrying with the next available backend port.")
        backend_port = find_available_port(backend_port + 1, limit=scan_limit)
        compose_env = build_compose_env(
            base_env=base_env,
            backend_port=backend_port,
            frontend_port=frontend_port,
        )
        stack_started, compose_output = start_compose_stack(compose_cmd=compose_cmd, compose_env=compose_env)

    if not stack_started:
        print("[dev] Docker backend stack failed to start.")
        return 1

    log_handles = start_docker_log_tails(compose_cmd=compose_cmd, compose_env=compose_env)
    health_ok, health_message = wait_for_backend_health(backend_port, timeout=health_timeout)
    if not health_ok:
        print(f"[dev] Backend health check failed: {health_message}")
        print_docker_diagnostics(compose_cmd=compose_cmd, compose_env=compose_env)
        stop_processes(log_handles)
        return 1

    frontend_env = build_frontend_env(
        base_env=base_env,
        project_root=PROJECT_ROOT,
        frontend_port=frontend_port,
        backend_port=backend_port,
        workspace_id=workspace.workspace_id,
    )

    print("[dev] Backend health check passed.")
    print(f"[dev] Open frontend: http://localhost:{frontend_port}")
    print("[dev] Press Ctrl-C to stop frontend and log tails. Docker services stay up.")

    frontend_handle = start_prefixed_process(
        "frontend",
        ["npx", "next", "dev", "-p", str(frontend_port)],
        cwd=FRONTEND_DIR,
        env=frontend_env,
    )
    handles = [*log_handles, frontend_handle]

    try:
        while True:
            for handle in handles:
                exit_code = handle.process.poll()
                if exit_code is None:
                    continue
                print(f"[dev] {handle.label} process exited with code {exit_code}")
                stop_processes([other for other in handles if other is not handle])
                return int(exit_code or 0)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[dev] Stopping frontend and log tails. Docker services stay up.")
        stop_processes(handles)
        return 130


def main() -> None:
    try:
        raise SystemExit(run_dev())
    except RuntimeError as error:
        print(f"[dev] {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
