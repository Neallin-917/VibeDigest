#!/usr/bin/env python3
"""
Workspace Dev Launcher (V3) - 无文件污染的 Next.js 启动器

功能：
1. 读取 .workspace.json 作为单一事实来源
2. 通过 Git 语义校验工作区身份
3. 检查端口冲突（冲突时自动向上扫描可用端口）
4. 内存级环境变量注入（不修改 .env 文件）
"""

import json
import os
import socket
import subprocess
import sys
from pathlib import Path


def get_git_root() -> Path | None:
    """获取当前 Git 仓库根目录"""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
        )
        return Path(result.stdout.strip())
    except subprocess.CalledProcessError:
        return None


def load_workspace_config(git_root: Path) -> dict:
    """加载 .workspace.json 配置，不存在时自动生成默认配置"""
    config_path = git_root / ".workspace.json"
    if not config_path.exists():
        print(f"⚠️  未找到 {config_path}，自动生成默认配置...")
        default_config = {
            "workspace_id": "main",
            "type": "main",
            "frontend_port": 3000,
            "backend_url": "http://localhost:16081",
        }
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(default_config, f, indent=2, ensure_ascii=False)
        print(f"✅ 已创建默认配置: {config_path}")
        return default_config

    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def check_port_available(port: int) -> tuple[bool, str | None]:
    """
    检查端口是否可用
    返回: (是否可用, 占用进程信息)
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    try:
        sock.bind(("127.0.0.1", port))
        sock.close()
        return True, None
    except OSError:
        sock.close()
        # 尝试获取占用进程信息
        try:
            result = subprocess.run(
                ["lsof", "-i", f":{port}", "-t"],
                capture_output=True,
                text=True,
            )
            pids = result.stdout.strip().split("\n")
            if pids and pids[0]:
                # 获取进程名
                ps_result = subprocess.run(
                    ["ps", "-p", pids[0], "-o", "comm="],
                    capture_output=True,
                    text=True,
                )
                process_name = ps_result.stdout.strip()
                return False, f"PID {pids[0]} ({process_name})"
        except Exception:
            pass
        return False, "未知进程"


def find_available_port(start_port: int, max_attempts: int = 20) -> int:
    """从 start_port 开始向上扫描，返回第一个可用端口"""
    for offset in range(max_attempts):
        port = start_port + offset
        available, _ = check_port_available(port)
        if available:
            return port
    raise RuntimeError(f"在 {start_port}-{start_port + max_attempts - 1} 范围内未找到可用端口")


def main():
    print("🚀 Workspace Dev Launcher (V3)")
    print("=" * 50)

    # 1. Git 语义校验
    git_root = get_git_root()
    if not git_root:
        print("❌ 错误：当前目录不在 Git 仓库中")
        sys.exit(1)

    print(f"📁 Git 根目录: {git_root}")

    # 2. 加载配置
    config = load_workspace_config(git_root)
    workspace_id = config.get("workspace_id", "unknown")
    workspace_type = config.get("type", "unknown")
    frontend_port = config.get("frontend_port", 3000)
    backend_url = config.get("backend_url", "http://localhost:16081")

    print(f"🏷️  Workspace: {workspace_id} ({workspace_type})")
    print(f"🌐 前端端口: {frontend_port}")
    print(f"📡 后端 API: {backend_url}")

    # 3. 端口检查（自动寻找可用端口）
    available, process_info = check_port_available(frontend_port)
    if not available:
        print(f"⚠️  端口 {frontend_port} 已被占用: {process_info}")
        frontend_port = find_available_port(frontend_port + 1)
        print(f"🔄 自动切换到端口 {frontend_port}")

    print(f"✅ 端口 {frontend_port} 可用")

    # 4. 内存级环境注入
    env = os.environ.copy()
    env["PORT"] = str(frontend_port)
    env["NEXT_PUBLIC_API_URL"] = backend_url
    env["WORKSPACE_ID"] = workspace_id

    # 4b. Load root-level .env and .env.local into the child process env.
    # Next.js Turbopack workers don't inherit vars loaded by loadEnvConfig()
    # in next.config.ts, so we must inject them before spawning `next dev`.
    for env_file in [git_root / ".env", git_root / ".env.local"]:
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        key, _, value = line.partition("=")
                        key = key.strip()
                        value = value.strip()
                        # Don't override vars already set in the shell
                        if key not in env:
                            env[key] = value

    # 5. 启动 Next.js
    frontend_dir = git_root / "frontend"
    if not frontend_dir.exists():
        print(f"❌ 错误：未找到 frontend 目录: {frontend_dir}")
        sys.exit(1)

    # 清理残留的 dev lock 文件
    lock_file = frontend_dir / ".next" / "dev" / "lock"
    if lock_file.exists():
        lock_file.unlink()
        print("🧹 已清理残留的 .next/dev/lock")

    print("\n" + "=" * 50)
    print(f"🎯 启动 Next.js (端口 {frontend_port})...")
    print("=" * 50 + "\n")

    try:
        # 使用 npx next dev 确保使用项目本地的 next
        subprocess.run(
            ["npx", "next", "dev", "-p", str(frontend_port)],
            cwd=frontend_dir,
            env=env,
        )
    except KeyboardInterrupt:
        print("\n\n👋 开发服务器已停止")
    except FileNotFoundError:
        print("❌ 错误：未找到 npx 命令，请确保 Node.js 已安装")
        sys.exit(1)


if __name__ == "__main__":
    main()
