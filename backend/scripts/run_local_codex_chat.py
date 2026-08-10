"""Run one constrained local Codex turn for the development chat bridge."""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from openai_codex import ApprovalMode, AsyncCodex, CodexConfig, Sandbox


MAX_PROMPT_CHARACTERS = 80_000

DEVELOPER_INSTRUCTIONS = """You are the local VibeDigest follow-up assistant.
Answer only from the source context and conversation supplied by the caller.
Do not read files, run commands, use tools, browse the web, or take actions.
If the source does not establish an answer, say so plainly.
Return only the user-facing answer in the conversation language."""


def parse_request(raw: str) -> str:
    try:
        payload: Any = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Request body must be valid JSON.") from exc

    prompt = payload.get("prompt") if isinstance(payload, dict) else None
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Request must contain a non-empty prompt.")
    if len(prompt) > MAX_PROMPT_CHARACTERS:
        raise ValueError("Prompt exceeds the local safety limit.")
    return prompt


async def run(prompt: str) -> str:
    working_directory = Path(tempfile.gettempdir()) / "vibedigest-codex-local"
    working_directory.mkdir(mode=0o700, exist_ok=True)

    async with AsyncCodex(CodexConfig()) as codex:
        thread = await codex.thread_start(
            approval_mode=ApprovalMode.deny_all,
            cwd=str(working_directory),
            developer_instructions=DEVELOPER_INSTRUCTIONS,
            ephemeral=True,
            sandbox=Sandbox.read_only,
        )
        result = await thread.run(prompt, sandbox=Sandbox.read_only)

    if not result.final_response:
        raise RuntimeError("Codex local runner returned no final response.")
    return result.final_response


def main() -> int:
    try:
        prompt = parse_request(sys.stdin.read())
        response = asyncio.run(run(prompt))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1

    print(json.dumps({"text": response}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
