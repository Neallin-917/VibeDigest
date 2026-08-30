"""Domain workload routing and worker capability policy.

The task's workload is persisted business intent. A worker profile is an
operational capability. Keeping those concepts separate lets runner location
change without rewriting task history or provider-specific business logic.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import StrEnum


USER_QUEUE_NAME = "video_processing"
CATALOG_QUEUE_NAME = "podcast_supply"


class WorkloadKind(StrEnum):
    USER_SUBMISSION = "user_submission"
    CATALOG_SUPPLY = "catalog_supply"


class WorkerProfile(StrEnum):
    HOSTED_API = "hosted_api"
    TRUSTED_CODEX = "trusted_codex"


@dataclass(frozen=True)
class ExecutionProfile:
    name: WorkerProfile
    queue_name: str
    allowed_workloads: frozenset[WorkloadKind]
    required_runtime: str
    requires_chatgpt_auth: bool = False
    trusted_private_only: bool = False


def _configured_queue_name(env_name: str, default: str) -> str:
    return (os.getenv(env_name) or "").strip() or default


def resolve_worker_profile(
    profile: WorkerProfile | str | None = None,
) -> ExecutionProfile:
    raw_profile = profile or os.getenv("WORKER_PROFILE") or WorkerProfile.HOSTED_API
    try:
        name = WorkerProfile(raw_profile)
    except ValueError as exc:
        supported = ", ".join(member.value for member in WorkerProfile)
        raise ValueError(
            f"Unsupported worker profile {raw_profile!r}; expected one of: {supported}"
        ) from exc

    if name is WorkerProfile.TRUSTED_CODEX:
        return ExecutionProfile(
            name=name,
            queue_name=_configured_queue_name(
                "PODCAST_TASK_QUEUE_NAME", CATALOG_QUEUE_NAME
            ),
            allowed_workloads=frozenset({WorkloadKind.CATALOG_SUPPLY}),
            required_runtime="codex_local",
            requires_chatgpt_auth=True,
            trusted_private_only=True,
        )

    return ExecutionProfile(
        name=name,
        queue_name=_configured_queue_name("TASK_QUEUE_NAME", USER_QUEUE_NAME),
        allowed_workloads=frozenset({WorkloadKind.USER_SUBMISSION}),
        required_runtime="api",
    )


def validate_worker_runtime(
    profile: ExecutionProfile,
    *,
    llm_runtime: str,
    llm_provider: str,
    is_railway: bool,
) -> None:
    if llm_runtime != profile.required_runtime:
        raise RuntimeError(
            f"Worker profile {profile.name.value} requires "
            f"LLM_RUNTIME={profile.required_runtime}"
        )
    if profile.name is WorkerProfile.TRUSTED_CODEX and llm_provider != "codex_local":
        raise RuntimeError(
            "Worker profile trusted_codex requires LLM_PROVIDER=codex_local"
        )
    if profile.trusted_private_only and is_railway:
        raise RuntimeError(
            "Worker profile trusted_codex must run on a trusted private runner, not Railway"
        )


def parse_workload_kind(value: object) -> WorkloadKind:
    try:
        return WorkloadKind(str(value))
    except ValueError as exc:
        raise ValueError(f"Unsupported or missing workload kind: {value!r}") from exc


def build_execution_provenance(
    *,
    workload_kind: WorkloadKind | str,
    worker_profile: WorkerProfile | str,
    llm_runtime: str,
    llm_provider: str,
    model: str,
) -> dict[str, str]:
    workload = WorkloadKind(workload_kind)
    profile = WorkerProfile(worker_profile)
    return {
        "workload_kind": workload.value,
        "execution_profile": profile.value,
        "llm_runtime": llm_runtime,
        "llm_provider": llm_provider,
        "model": model,
        "auth_mode": (
            "chatgpt_subscription" if llm_runtime == "codex_local" else "api_key"
        ),
    }


def current_execution_provenance(
    workload_kind: WorkloadKind | str,
) -> dict[str, str]:
    """Describe the active worker route without exposing credentials."""
    from config import settings

    profile = resolve_worker_profile()
    return build_execution_provenance(
        workload_kind=workload_kind,
        worker_profile=profile.name,
        llm_runtime=settings.LLM_RUNTIME,
        llm_provider=settings.LLM_PROVIDER,
        model=settings.MODEL_SMART,
    )
