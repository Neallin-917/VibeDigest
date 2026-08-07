import pytest

from scripts.run_local_codex_chat import MAX_PROMPT_CHARACTERS, parse_request


def test_parse_request_accepts_a_bounded_prompt():
    assert parse_request('{"prompt":"Answer from this source."}') == "Answer from this source."


@pytest.mark.parametrize("payload", ["not json", "{}", '{"prompt":"   "}'])
def test_parse_request_rejects_invalid_payloads(payload: str):
    with pytest.raises(ValueError):
        parse_request(payload)


def test_parse_request_rejects_oversized_prompt():
    with pytest.raises(ValueError, match="safety limit"):
        parse_request('{"prompt":"' + ('x' * (MAX_PROMPT_CHARACTERS + 1)) + '"}')
