import json

import pytest

from services.summarizer.validation import parse_summary_payload_v4


def build_valid_summary(**overrides):
    base = {
        "version": 4,
        "language": "en",
        "tl_dr": "Short take.",
        "overview": "Detailed overview.",
        "keypoints": [
            {
                "title": "Point A",
                "detail": "Important detail.",
                "evidence": "Quoted support.",
            }
        ],
    }
    base.update(overrides)
    return base


def test_parse_summary_payload_v4_accepts_valid_v4():
    parsed = parse_summary_payload_v4(json.dumps(build_valid_summary()))

    assert parsed["version"] == 4
    assert parsed["language"] == "en"


def test_parse_summary_payload_v4_accepts_valid_v5_ui_blocks():
    parsed = parse_summary_payload_v4(
        json.dumps(
            build_valid_summary(
                version=5,
                ui_blocks=[
                    {
                        "kind": "bar_chart",
                        "id": "chart-1",
                        "title": "Verified values",
                        "unit": "items",
                        "values": [
                            {"label": "A", "value": 2, "evidence": "A says two."},
                            {"label": "B", "value": 4, "evidence": "B says four."},
                            {"label": "C", "value": 6, "evidence": "C says six."},
                        ],
                    }
                ],
            )
        )
    )

    assert parsed["version"] == 5
    assert parsed["ui_blocks"][0]["kind"] == "bar_chart"


def test_parse_summary_payload_v4_discards_invalid_v5_ui_blocks():
    parsed = parse_summary_payload_v4(
        json.dumps(
            build_valid_summary(
                version=5,
                ui_blocks=[
                    {
                        "kind": "bar_chart",
                        "id": "chart-1",
                        "title": "Invalid values",
                        "unit": "items",
                        "values": [{"label": "A", "value": 2, "evidence": "A says two."}],
                    }
                ],
            )
        )
    )

    assert parsed["ui_blocks"] == []


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"language": "en", "overview": "ok", "keypoints": [{"title": "t", "detail": "d", "evidence": "e"}]}, "version"),
        ({"version": 3, "language": "en", "overview": "ok", "keypoints": [{"title": "t", "detail": "d", "evidence": "e"}]}, "V4"),
        ({"version": 4, "language": "en", "overview": " ", "keypoints": [{"title": "t", "detail": "d", "evidence": "e"}]}, "overview"),
        ({"version": 4, "language": "en", "overview": "ok", "keypoints": []}, "keypoints"),
        ({"version": 4, "language": "en", "overview": "ok", "keypoints": [{"title": "t", "detail": "d", "evidence": " "}]}, "evidence"),
    ],
)
def test_parse_summary_payload_v4_rejects_invalid_payloads(payload, message):
    with pytest.raises(ValueError, match=message):
        parse_summary_payload_v4(json.dumps(payload))
