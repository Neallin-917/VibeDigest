import pytest

from services.execution_policy import (
    CATALOG_QUEUE_NAME,
    USER_QUEUE_NAME,
    WorkerProfile,
    WorkloadKind,
    build_execution_provenance,
    resolve_worker_profile,
    validate_worker_runtime,
)


def test_hosted_worker_is_locked_to_user_submission_queue():
    profile = resolve_worker_profile(WorkerProfile.HOSTED_API)

    assert profile.queue_name == USER_QUEUE_NAME
    assert profile.allowed_workloads == frozenset({WorkloadKind.USER_SUBMISSION})
    assert profile.required_runtime == "api"


def test_trusted_codex_worker_is_locked_to_catalog_supply_queue():
    profile = resolve_worker_profile(WorkerProfile.TRUSTED_CODEX)

    assert profile.queue_name == CATALOG_QUEUE_NAME
    assert profile.allowed_workloads == frozenset({WorkloadKind.CATALOG_SUPPLY})
    assert profile.required_runtime == "codex_local"
    assert profile.requires_chatgpt_auth is True


def test_unknown_worker_profile_is_rejected():
    with pytest.raises(ValueError, match="Unsupported worker profile"):
        resolve_worker_profile("shared-everything")


def test_trusted_codex_profile_rejects_api_runtime():
    profile = resolve_worker_profile(WorkerProfile.TRUSTED_CODEX)

    with pytest.raises(RuntimeError, match="requires LLM_RUNTIME=codex_local"):
        validate_worker_runtime(
            profile,
            llm_runtime="api",
            llm_provider="openrouter",
            is_railway=False,
        )


def test_trusted_codex_profile_is_rejected_on_railway():
    profile = resolve_worker_profile(WorkerProfile.TRUSTED_CODEX)

    with pytest.raises(RuntimeError, match="trusted private runner"):
        validate_worker_runtime(
            profile,
            llm_runtime="codex_local",
            llm_provider="codex_local",
            is_railway=True,
        )


def test_execution_provenance_records_actual_route_without_credentials():
    provenance = build_execution_provenance(
        workload_kind=WorkloadKind.CATALOG_SUPPLY,
        worker_profile=WorkerProfile.TRUSTED_CODEX,
        llm_runtime="codex_local",
        llm_provider="codex_local",
        model="gpt-test",
    )

    assert provenance == {
        "workload_kind": "catalog_supply",
        "execution_profile": "trusted_codex",
        "llm_runtime": "codex_local",
        "llm_provider": "codex_local",
        "model": "gpt-test",
        "auth_mode": "chatgpt_subscription",
    }
