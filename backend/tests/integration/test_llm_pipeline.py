"""Integration smoke test: verifies OpenRouter API is reachable and returns valid responses.

This test calls the REAL OpenRouter API. It is auto-marked as ``integration``
by conftest.py (files inside tests/integration/ get the mark automatically),
so it is excluded from the default ``make test-backend`` run.

Requirements:
    OPENROUTER_API_KEY  - set in .env.local or as shell env var
    LLM_PROVIDER=openrouter  - set by ``make test-integration`` automatically

Run:
    make test-integration
    # or manually:
    LLM_PROVIDER=openrouter uv run pytest backend/tests/integration/test_llm_pipeline.py -v -s
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
def require_openrouter_key():
    """Skip the entire module if OPENROUTER_API_KEY is not present."""
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY not set — skipping OpenRouter integration tests")


def test_openrouter_provider_is_active():
    """Verify LLM_PROVIDER resolves to 'openrouter' when running integration suite."""
    from config import settings

    assert settings.LLM_PROVIDER == "openrouter", (
        f"Expected LLM_PROVIDER=openrouter, got {settings.LLM_PROVIDER!r}. "
        "Run via: make test-integration  or  LLM_PROVIDER=openrouter uv run pytest ..."
    )


def test_openrouter_model_defaults():
    """Verify MODEL_SMART and MODEL_FAST resolve correctly for openrouter provider."""
    from config import settings

    assert settings.MODEL_SMART, "MODEL_SMART should be configured"
    assert settings.MODEL_FAST, "MODEL_FAST should be configured"
    assert "gemini" in settings.MODEL_SMART or "gpt" in settings.MODEL_SMART, (
        f"Unexpected smart model: {settings.MODEL_SMART}"
    )


def test_openrouter_chat_completion():
    """Smoke test: send a simple prompt to OpenRouter and verify a non-empty response.

    Uses ``openai/gpt-4o-mini`` — cheap and broadly available on OpenRouter.
    """
    from langchain_core.messages import HumanMessage

    from utils.openai_client import create_chat_model

    model_name = "openai/gpt-4o-mini"
    llm = create_chat_model(model_name)

    response = llm.invoke([HumanMessage(content="Reply with exactly one word: OK")])

    assert response is not None, "LLM returned None"
    content = getattr(response, "content", str(response))
    assert content, "LLM returned empty response"
    assert len(content.strip()) > 0, "LLM response is blank after stripping whitespace"
    # A one-word reply should be well under 500 chars
    assert len(content) < 500, (
        f"Response unexpectedly long ({len(content)} chars): {content!r}"
    )
    print(f"\n✓ OpenRouter smoke test passed. Response: {content!r}")
