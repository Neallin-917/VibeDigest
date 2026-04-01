"""Integration smoke test: verifies a custom OpenAI-compatible endpoint is reachable.

This test calls the REAL custom endpoint configured by ``OPENAI_BASE_URL``.
It is auto-marked as ``integration`` by conftest.py, so it is excluded from
the default ``make test-backend`` run.

Requirements:
    OPENAI_BASE_URL - set to a reachable OpenAI-compatible API root
    OPENAI_API_KEY  - set for that endpoint

Run:
    OPENROUTER_API_KEY= OPENAI_BASE_URL=http://localhost:8317/v1 uv run pytest backend/tests/integration/test_custom_llm_pipeline.py -v -s
"""
import os
import sys
from pathlib import Path

import pytest

# Ensure backend root is in path when running this file directly.
backend_root = Path(__file__).resolve().parents[2]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))


@pytest.fixture(autouse=True)
def require_custom_provider_env():
    if not os.getenv("OPENAI_BASE_URL"):
        pytest.skip("OPENAI_BASE_URL not set — skipping custom provider integration tests")
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set — skipping custom provider integration tests")


def test_custom_provider_is_active():
    from config import settings

    assert settings.LLM_PROVIDER == "custom", (
        f"Expected provider=custom, got {settings.LLM_PROVIDER!r}. "
        "Run this test only when OPENAI_BASE_URL is set."
    )


def test_custom_model_defaults_or_aliases_resolve():
    from config import settings

    assert settings.MODEL_SMART, "MODEL_SMART should be configured"
    assert settings.MODEL_FAST, "MODEL_FAST should be configured"


def test_custom_chat_completion():
    from langchain_core.messages import HumanMessage

    from config import settings
    from utils.openai_client import create_chat_model

    llm = create_chat_model(settings.MODEL_FAST)
    response = llm.invoke([HumanMessage(content="Reply with exactly one word: OK")])

    assert response is not None, "LLM returned None"
    content = getattr(response, "content", str(response))
    assert content, "LLM returned empty response"
    assert len(content.strip()) > 0, "LLM response is blank after stripping whitespace"
    assert len(content) < 500, (
        f"Response unexpectedly long ({len(content)} chars): {content!r}"
    )
    print(f"\n✓ Custom provider smoke test passed. Response: {content!r}")
