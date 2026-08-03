#!/usr/bin/env python3
"""
Trace LLM calls step-by-step in the cognition workflow.
Supports both interactive (default) and auto-run modes.

Usage:
    python backend/scripts/llm/trace_calls.py           # Interactive mode
    python backend/scripts/llm/trace_calls.py --auto    # Auto-run mode
"""

import asyncio
import time
import os
import sys
import argparse
from datetime import datetime

# Add parent directory to path to import backend modules
# scripts/llm/trace_calls.py -> scripts/llm -> scripts -> backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from utils.env_loader import load_env
load_env()

from config import settings
from services.summarizer import Summarizer

# ANSI colors
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def log_step(step_num: int, name: str, status: str = "START"):
    """Log a step with timestamp and color."""
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    color = {
        "START": Colors.BLUE,
        "SUCCESS": Colors.GREEN,
        "ERROR": Colors.RED
    }.get(status, Colors.YELLOW)
    
    symbol = {
        "START": "▶",
        "SUCCESS": "✓",
        "ERROR": "✗"
    }.get(status, "⏳")

    print(f"{color}{symbol} [{timestamp}] Step {step_num}: {name} - {status}{Colors.RESET}", flush=True)

def log_info(message: str):
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"{Colors.CYAN}  ℹ [{timestamp}] {message}{Colors.RESET}", flush=True)

def log_error(message: str):
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"{Colors.RED}  ✗ [{timestamp}] ERROR: {message}{Colors.RESET}", flush=True)

# Sample transcript
SAMPLE_TRANSCRIPT = """
今天我们来聊一聊人工智能的发展历程。
人工智能最早可以追溯到1950年代，当时图灵提出了著名的图灵测试。
这个测试的核心思想是：如果一台机器能够与人类进行对话，
而人类无法分辨对方是机器还是人，那么这台机器就可以被认为具有智能。
"""

async def run_trace(auto_mode: bool):
    print(f"\n{Colors.BOLD}{'='*60}")
    print(f"LLM Call Trace - {'Auto Mode' if auto_mode else 'Interactive Mode'}")
    print(f"{'='*60}{Colors.RESET}\n")

    # Config info
    print(f"{Colors.YELLOW}Configuration:{Colors.RESET}")
    print(f"  - LLM_PROVIDER: {settings.LLM_PROVIDER}")
    print(f"  - MODEL_ALIAS_FAST: {settings.MODEL_ALIAS_FAST}")
    print(f"  - OPENAI_BASE_URL: {settings.OPENAI_BASE_URL or 'Default'}")
    print()

    summarizer = Summarizer()
    trace_meta = {
        "session_id": "debug-trace",
        "user_id": "debug-user",
        "metadata": {"source": "trace_script"}
    }
    
    # --- STEP 1: Summarize ---
    print(f"\n{Colors.BOLD}--- STEP 1: Summarize ---{Colors.RESET}")
    if not auto_mode:
        input(f"{Colors.YELLOW}Press Enter to execute Step 1...{Colors.RESET}")
    
    log_step(1, "summarize", "START")
    start_time = time.time()
    
    try:
        summary = await summarizer.summarize(
            SAMPLE_TRANSCRIPT,
            target_language="zh",
            trace_metadata=trace_meta,
        )
        elapsed = time.time() - start_time
        log_step(1, "summarize", "SUCCESS")
        log_info(f"Took {elapsed:.2f}s")
        log_info(f"Result Length: {len(summary)} chars")
    except Exception as e:
        log_step(1, "summarize", "ERROR")
        log_error(str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--auto", action="store_true", help="Run without user interaction")
    args = parser.parse_args()
    
    try:
        asyncio.run(run_trace(args.auto))
    except KeyboardInterrupt:
        print("\nAborted.")
