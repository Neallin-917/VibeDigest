from services.output_intent import build_output_intent, resolve_output_intent


def test_explicit_instruction_overrides_ui_locale():
    intent = build_output_intent(
        "Summarize this English video in Chinese, preserving original quotes.",
        "en",
    )

    assert intent["target_locale"] == "zh"
    assert intent["locale_source"] == "explicit_instruction"
    assert intent["preserve_source_terms"] is True


def test_ui_locale_is_used_when_request_has_no_explicit_language():
    intent = build_output_intent("https://www.youtube.com/watch?v=abc", "zh-CN")

    assert intent["target_locale"] == "zh"
    assert intent["locale_source"] == "ui_locale"


def test_source_language_is_resolved_only_after_ingestion():
    intent = build_output_intent("https://www.youtube.com/watch?v=abc", None)

    assert intent["target_locale"] is None
    assert intent["locale_source"] == "source_language"

    resolved = resolve_output_intent(intent, "en-US")
    assert resolved["target_locale"] == "en"
    assert resolved["locale_source"] == "source_language"


def test_intent_captures_depth_and_audience_without_affecting_locale():
    intent = build_output_intent(
        "用中文写一份详细的投资分析师简报", "en"
    )

    assert intent["target_locale"] == "zh"
    assert intent["depth"] == "detailed"
    assert intent["audience"] == "investment_analyst"


def test_unsupported_requested_or_source_language_falls_back_to_supported_output():
    explicit = build_output_intent("Summarize this in Japanese.", "en")
    assert explicit["target_locale"] == "en"
    assert explicit["locale_source"] == "ui_locale"

    resolved = resolve_output_intent({"target_locale": None}, "ja-JP")
    assert resolved["target_locale"] == "en"
    assert resolved["locale_source"] == "default_locale"

    unsupported_ui = build_output_intent("https://example.com/video", "ja-JP")
    assert unsupported_ui["target_locale"] == "en"
    assert unsupported_ui["locale_source"] == "default_locale"


def test_historical_japanese_output_intent_falls_back_to_default_locale():
    resolved = resolve_output_intent(
        {"target_locale": "ja", "locale_source": "explicit_instruction"},
        "ja-JP",
    )

    assert resolved["target_locale"] == "en"
    assert resolved["locale_source"] == "default_locale"
