"""Codex account/model checks without worker, database or queue dependencies."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

from services.execution_policy import resolve_worker_profile, validate_worker_runtime

from config import settings


async def verify_codex_subscription(
    *,
    codex_factory: Callable[..., Any] | None = None,
) -> str:
    """Fail startup unless the local Codex session is ChatGPT-managed."""
    from openai_codex import AsyncCodex, CodexConfig

    factory = codex_factory or AsyncCodex
    config = CodexConfig(codex_bin=settings.CODEX_LOCAL_BINARY)
    async with factory(config) as codex:
        response = await codex.account(refresh_token=False)

    return _chatgpt_plan(response)


def _chatgpt_plan(response: Any) -> str:
    account_container = getattr(response, "account", None)
    account = getattr(account_container, "root", account_container)
    if account is None or getattr(account, "type", None) != "chatgpt":
        raise RuntimeError(
            "trusted_codex worker requires an existing ChatGPT subscription login"
        )

    plan = getattr(account, "plan_type", "unknown")
    return str(getattr(plan, "value", plan))


async def preflight_podcast_supply(
    *,
    codex_factory: Callable[..., Any] | None = None,
) -> dict[str, str]:
    """Read account and model catalog only; never create a thread or run inference."""
    from openai_codex import AsyncCodex, CodexConfig

    profile = resolve_worker_profile()
    if not profile.requires_chatgpt_auth:
        raise RuntimeError("Podcast preflight requires WORKER_PROFILE=trusted_codex")
    validate_worker_runtime(
        profile,
        llm_runtime=settings.LLM_RUNTIME,
        llm_provider=settings.LLM_PROVIDER,
        is_railway=bool(os.getenv("RAILWAY_PROJECT_ID")),
    )
    models = {"smart": settings.MODEL_SMART, "fast": settings.MODEL_FAST}
    factory = codex_factory or AsyncCodex
    async with factory(CodexConfig(codex_bin=settings.CODEX_LOCAL_BINARY)) as codex:
        plan = _chatgpt_plan(await codex.account(refresh_token=False))
        catalog = await codex.models(include_hidden=True)
    available = {entry.model for entry in catalog.data}
    missing = [
        f"{tier}={model}" for tier, model in models.items() if model not in available
    ]
    if missing:
        raise RuntimeError(
            "Codex model catalog does not list configured models: " + ", ".join(missing)
        )
    return {
        "execution_profile": profile.name.value,
        "llm_runtime": settings.LLM_RUNTIME,
        "llm_provider": settings.LLM_PROVIDER,
        "auth_mode": "chatgpt_subscription",
        "plan": plan,
        **models,
        "status": "passed",
    }
