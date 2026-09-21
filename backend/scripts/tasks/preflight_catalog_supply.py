#!/usr/bin/env python3
"""Validate the trusted catalog runner without importing the worker or data plane."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[2]
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


def main() -> int:
    try:
        from utils.env_loader import load_env

        load_env()
        # Match the purpose-specific batch entry point before config is imported.
        os.environ["WORKER_PROFILE"] = "trusted_codex"
        os.environ["LLM_RUNTIME"] = "codex_local"
        os.environ["VIBEDIGEST_PROCESS_ROLE"] = "podcast_preflight"

        from services.codex_preflight import preflight_podcast_supply

        from config import settings

        result = asyncio.run(
            asyncio.wait_for(
                preflight_podcast_supply(),
                timeout=settings.CODEX_LOCAL_TIMEOUT_SECONDS,
            )
        )
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception as exc:
        print(
            json.dumps({"error": str(exc) or type(exc).__name__}, sort_keys=True),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
