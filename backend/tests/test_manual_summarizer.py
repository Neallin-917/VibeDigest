"""Integration test: real Summarizer calls via the configured LLM provider.

Auto-marked as ``integration`` by conftest.py (filename contains "manual"),
so it is excluded from the default ``make test-backend`` run.

Run manually:
    uv run pytest backend/tests/test_manual_summarizer.py -m "llm_live and eval" -v -s
"""
import sys
from pathlib import Path

import pytest

# Ensure backend root is in path when running this file directly.
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from services.summarizer import Summarizer  # noqa: E402

pytestmark = [pytest.mark.integration, pytest.mark.llm_live, pytest.mark.eval]

_TRANSCRIPT = (
    "This is a short test transcript. "
    "It talks about AI and coding. "
    "It mentions a key point about refactoring."
)


@pytest.fixture(scope="module")
def summarizer() -> Summarizer:
    return Summarizer()


async def test_summarize(summarizer: Summarizer):
    """summarize() should return a non-empty string."""
    result = await summarizer.summarize(_TRANSCRIPT, target_language="en")
    assert result, "summarize() returned empty result"
    assert len(result.strip()) > 0, "summarize() returned blank content"


async def test_optimize_transcript(summarizer: Summarizer):
    """optimize_transcript() should return a non-empty string."""
    result = await summarizer.optimize_transcript(_TRANSCRIPT)
    assert result, "optimize_transcript() returned empty result"
    assert len(result.strip()) > 0, "optimize_transcript() returned blank content"
