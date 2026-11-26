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


def validated_point(evidence, segments, *, source_timed=True):
    summary = build_valid_summary(version=5)
    summary["keypoints"][0].update(evidence=evidence, startSeconds=999)
    raw = json.dumps({"source_timed": source_timed, "segments": segments})
    return parse_summary_payload_v4(summary, timed_transcript=raw)["keypoints"][0]


def test_source_anchor_uses_only_unique_caption_time_including_zero():
    phrase = "One speaker explained the storage cost."
    segments = [{"start": 0, "end": 8, "text": phrase}]
    assert validated_point(phrase, segments)["startSeconds"] == 0

    segments.append({"start": 12.5, "end": 20, "text": phrase})
    assert "startSeconds" not in validated_point(phrase, segments)


@pytest.mark.parametrize(
    ("second_start", "evidence", "expected"),
    [
        (4, "three old servers saved thirty percent.", 2.5),
        (5, "three old servers saved thirty percent.", None),
        (3, "three old servers saved thirty percent.", None),
        (5, "three old servers | saved thirty percent.", None),
        (4, "three old servers saved thirty percent!", None),
    ],
    ids=["adjacent", "time-gap", "overlap", "literal-pipe-across-gap", "different-punctuation"],
)
def test_source_anchor_requires_a_contiguous_full_passage(second_start, evidence, expected):
    point = validated_point(evidence, [
        {"start": 2.5, "end": 4, "text": "In our lab three old servers"},
        {"start": second_start, "end": 12, "text": "saved thirty percent."},
    ])
    assert point.get("startSeconds") == expected


@pytest.mark.parametrize("timed", [False, "true"])
def test_untrusted_timing_cannot_validate_a_model_provided_anchor(timed):
    quote = "A complete matching passage with six words."
    segment = {"start": 3, "end": 8, "text": quote}
    assert "startSeconds" not in validated_point(quote, [segment], source_timed=timed)


def test_cjk_source_anchor_finds_an_unspaced_phrase_inside_a_caption():
    quote = "这段话有明确来源"
    segment = {"start": 31.5, "end": 40, "text": "发言人说，这段话有明确来源，请核对。"}
    assert validated_point(quote, [segment])["startSeconds"] == 31.5


def test_unmatched_numbers_and_symbols_cannot_reuse_another_claims_time():
    segment = {"start": 15, "end": 21, "text": "We paid $25 per seat every month."}
    for evidence in ("We paid €25 per seat every month.", "We paid $52 per seat every month."):
        assert "startSeconds" not in validated_point(evidence, [segment])


@pytest.mark.parametrize("raw", [None, "Transcript only", '{"segments": []}'])
def test_model_supplied_time_is_ignored_without_trustworthy_captions(raw):
    summary = build_valid_summary(version=5)
    summary["keypoints"][0]["startSeconds"] = 600
    parsed = parse_summary_payload_v4(summary, timed_transcript=raw)
    assert "startSeconds" not in parsed["keypoints"][0]
