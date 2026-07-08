#!/usr/bin/env python3
"""Read-only deployment and local-ops audit for VibeDigest."""

from __future__ import annotations

import json
import shutil
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HTTP_USER_AGENT = "VibeDigest-OpsAudit/1.0"
ENV_KEYS = {
    "BACKEND_API_URL",
    "BACKEND_ORIGIN_URL",
    "DATABASE_URL",
    "FRONTEND_URL",
    "LANGCHAIN_TRACING_V2",
    "LANGSMITH_TRACING",
    "MODEL_ALIAS_FAST",
    "MODEL_ALIAS_SMART",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENROUTER_API_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_URL",
}
SENSITIVE_KEY_PARTS = ("KEY", "SECRET", "TOKEN", "PASSWORD", "DSN")
PUBLIC_API_HOST = "api.vibedigest.io"
RAILWAY_SERVICE_HOST_SUFFIX = ".up.railway.app"


@dataclass(frozen=True)
class CommandResult:
    command: str
    exit_code: int | None
    output: str


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


def redact_env_value(key: str, value: str) -> str:
    if not value:
        return "<empty>"

    if key == "DATABASE_URL":
        try:
            parsed = urlparse(value)
            host = parsed.hostname or ""
            port = f":{parsed.port}" if parsed.port else ""
            return f"{parsed.scheme}://***@{host}{port}{parsed.path}"
        except ValueError:
            return "<redacted:set>"

    if any(part in key for part in SENSITIVE_KEY_PARTS):
        return "<redacted:set>"

    return value


def build_env_snapshot(paths: list[Path]) -> dict[str, dict[str, str]]:
    snapshot: dict[str, dict[str, str]] = {}
    for path in paths:
        selected = {
            key: redact_env_value(key, value)
            for key, value in parse_env_file(path).items()
            if key in ENV_KEYS
        }
        if selected:
            snapshot[str(path)] = selected
    return snapshot


def merge_selected_env_values(paths: list[Path]) -> dict[str, str]:
    values: dict[str, str] = {}
    for path in paths:
        values.update({k: v for k, v in parse_env_file(path).items() if k in ENV_KEYS})
    return values


def hostname(value: str) -> str:
    try:
        return (urlparse(value).hostname or "").lower()
    except ValueError:
        return ""


def describe_backend_url_roles(values: dict[str, str]) -> list[str]:
    public_url = values.get("NEXT_PUBLIC_API_URL") or values.get("BACKEND_API_URL", "")
    backend_api_url = values.get("BACKEND_API_URL", "")
    origin_url = values.get("BACKEND_ORIGIN_URL", "")
    server_url = origin_url or backend_api_url

    lines = [
        f"public API URL: {redact_env_value('NEXT_PUBLIC_API_URL', public_url)}",
        f"server backend URL: {redact_env_value('BACKEND_ORIGIN_URL', server_url)}",
    ]

    public_host = hostname(public_url)
    server_host = hostname(server_url)

    if public_host == PUBLIC_API_HOST:
        lines.append("public API role: OK canonical api.vibedigest.io")
    elif public_host:
        lines.append(f"public API role: CHECK expected {PUBLIC_API_HOST}")
    else:
        lines.append("public API role: MISSING")

    if server_host.endswith(RAILWAY_SERVICE_HOST_SUFFIX):
        lines.append("server backend role: OK Railway origin")
    elif server_host == PUBLIC_API_HOST:
        lines.append(
            "server backend role: WARN set BACKEND_ORIGIN_URL to the Railway service domain; "
            "server-to-server calls should not depend on the public Cloudflare API domain"
        )
    elif server_host in {"localhost", "127.0.0.1"}:
        lines.append("server backend role: OK local development")
    elif server_host:
        lines.append("server backend role: CHECK non-standard origin")
    else:
        lines.append("server backend role: MISSING")

    return lines


def run_command(args: list[str], timeout: float = 5.0) -> CommandResult:
    if not shutil.which(args[0]):
        return CommandResult(" ".join(args), None, "not installed")

    try:
        result = subprocess.run(
            args,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(" ".join(args), None, "timed out")

    output = "\n".join(
        line
        for line in (result.stdout + result.stderr).strip().splitlines()
        if line.strip()
    )
    return CommandResult(" ".join(args), result.returncode, output or "(no output)")


def http_status(url: str, timeout: float = 10.0) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": HTTP_USER_AGENT},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return f"{response.status} {response.geturl()}"
    except urllib.error.HTTPError as error:
        return f"{error.code} {error.geturl()}"
    except urllib.error.URLError as error:
        return f"ERROR {error.reason}"
    except TimeoutError:
        return "ERROR timed out"


def dig_short(record_type: str, name: str) -> str:
    result = run_command(["dig", "+short", record_type, name], timeout=5)
    if result.exit_code != 0:
        return result.output.splitlines()[0] if result.output else "error"
    return ", ".join(result.output.splitlines()) if result.output != "(no output)" else "(none)"


def read_workspace_backend_url() -> str:
    workspace_path = PROJECT_ROOT / ".workspace.json"
    if not workspace_path.exists():
        return "http://localhost:16081"

    try:
        data = json.loads(workspace_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return "http://localhost:16081"

    return str(data.get("backend_url") or "http://localhost:16081")


def print_section(title: str) -> None:
    print(f"\n## {title}")


def main() -> int:
    print("# VibeDigest Ops Audit")
    print("Read-only checks. Secret values are redacted.")

    print_section("Git")
    print(run_command(["git", "status", "--short", "--branch"]).output)

    print_section("Selected Environment")
    env_paths = [
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / ".env.local",
        PROJECT_ROOT / "frontend" / ".env",
        PROJECT_ROOT / "frontend" / ".env.local",
    ]
    snapshot = build_env_snapshot(
        env_paths
    )
    for file_name, values in snapshot.items():
        print(f"[{Path(file_name).relative_to(PROJECT_ROOT)}]")
        for key, value in values.items():
            print(f"{key}={value}")

    print_section("Backend URL Roles")
    for line in describe_backend_url_roles(merge_selected_env_values(env_paths)):
        print(line)

    print_section("Local Runtime")
    backend_url = read_workspace_backend_url()
    backend_health_url = backend_url.rstrip("/") + "/health"
    print(f"backend health: {http_status(backend_health_url)}")
    print(f"frontend local: {http_status('http://127.0.0.1:3000/en', timeout=2)}")

    print_section("Public DNS and HTTP")
    for record_type, name in [
        ("NS", "vibedigest.io"),
        ("A", "vibedigest.io"),
        ("CNAME", "www.vibedigest.io"),
        ("A", "api.vibedigest.io"),
        ("CNAME", "api.vibedigest.io"),
    ]:
        print(f"{record_type} {name}: {dig_short(record_type, name)}")
    print(f"https://vibedigest.io: {http_status('https://vibedigest.io')}")
    print(f"https://api.vibedigest.io/health: {http_status('https://api.vibedigest.io/health')}")
    print(
        "https://www.vibedigest.io/api/health/backend-origin: "
        f"{http_status('https://www.vibedigest.io/api/health/backend-origin')}"
    )

    print_section("Local Tool Access")
    checks = [
        ["railway", "status"],
        ["supabase", "projects", "list"],
        ["cloudflared", "tunnel", "list"],
    ]
    for args in checks:
        result = run_command(args, timeout=8)
        first_line = result.output.splitlines()[0] if result.output else "(no output)"
        print(f"{result.command}: exit={result.exit_code} {first_line}")

    print_section("Repository Deployment Files")
    for relative_path in [
        ".vercel/project.json",
        "railway.toml",
        "docker-compose.prod.yml",
        "supabase/migrations",
    ]:
        path = PROJECT_ROOT / relative_path
        print(f"{relative_path}: {'present' if path.exists() else 'missing'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
