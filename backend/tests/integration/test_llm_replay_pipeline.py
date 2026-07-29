import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest
from langchain_core.messages import HumanMessage

from config import settings
from tests.support.llm_replay import serve_llm_replay
from utils.openai_client import create_chat_model


pytestmark = pytest.mark.integration

CASSETTE = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "llm"
    / "chat_completion_ok.json"
)


def test_custom_provider_contract_replays_without_paid_api(monkeypatch):
    with serve_llm_replay(CASSETTE) as replay:
        monkeypatch.setenv("OPENAI_API_KEY", "sk-no-key-required")
        monkeypatch.setattr(settings, "_llm_provider_override", None)
        monkeypatch.setattr(settings, "OPENAI_BASE_URL", replay.base_url)
        monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-no-key-required")
        monkeypatch.setattr(settings, "MODEL_ALIAS_FAST", "replay-fast")

        llm = create_chat_model(settings.MODEL_FAST)
        response = llm.invoke(
            [HumanMessage(content="Reply with exactly one word: OK")]
        )

    assert response.content == "OK"
    assert len(replay.requests) == 1
    assert replay.requests[0]["model"] == "replay-fast"


def test_replay_rejects_unrecorded_requests():
    with serve_llm_replay(CASSETTE) as replay:
        request = Request(
            f"{replay.base_url}/chat/completions",
            data=json.dumps(
                {
                    "model": "replay-fast",
                    "messages": [{"role": "user", "content": "Not in cassette"}],
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(HTTPError) as error:
            urlopen(request, timeout=2)

    assert error.value.code == 409
    assert len(replay.requests) == 1
