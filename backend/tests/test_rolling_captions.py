"""Exercise rolling caption detection through the transcript and segment entry point."""

import pytest

from services.video_processor import VideoProcessor


HEADER = "WEBVTT\nKind: captions\nLanguage: en"
SETTINGS = "align:start position:0%"


def cue(start, end, carry, new, settings=SETTINGS):
    return f"00:00:{start} --> 00:00:{end} {settings}\n{carry or ' '}\n{new or ' '}"


def parse(tmp_path, *cues, header=HEADER):
    path = tmp_path / "captions.vtt"
    path.write_text("\n\n".join([header, *cues]) + "\n", encoding="utf-8")
    return VideoProcessor()._parse_vtt(path)


def test_native_two_line_rolling_cues_with_rtl_alignment(tmp_path):
    # Short extract from the native Arabic VTT. The middle cue repaints the old line.
    md, segments = parse(
        tmp_path,
        cue("00.100", "01.846", "", "مرحبًا<00:00:00.637><c>،</c><00:00:00.771><c> هناك</c>"
            "<00:00:01.175><c> نوع</c><00:00:01.488><c> جديد</c>", "align:start position:100%"),
        cue("01.846", "01.891", "مرحبًا، هناك نوع جديد", "", "align:start position:100%"),
        cue("01.891", "03.459", "مرحبًا، هناك نوع جديد", " من<00:00:02.115><c> وحدات</c>"
            "<00:00:02.608><c> القيمة</c><00:00:03.190><c> يتم</c>", "align:start position:100%"),
        header="WEBVTT\nKind: captions\nLanguage: ar",
    )
    assert segments == [
        {"start": 0.1, "end": 1.891, "text": "مرحبًا، هناك نوع جديد"},
        {"start": 1.891, "end": 3.459, "text": "من وحدات القيمة يتم"},
    ]
    assert md == "[0.10-1.89] مرحبًا، هناك نوع جديد\n\n[1.89-3.46] من وحدات القيمة يتم"


def test_manual_multiline_and_unmarked_carry_are_preserved(tmp_path):
    _, segments = parse(
        tmp_path,
        cue("00.000", "01.000", "First speaker", "Second speaker"),
        cue("01.000", "02.000", "Second speaker", "Repeat it."),
    )
    assert [s["text"] for s in segments] == ["First speaker Second speaker", "Second speaker Repeat it."]


@pytest.mark.parametrize(
    ("settings", "carry"),
    [("align:center position:50%", "Keep me"), (SETTINGS, "Unexpected speaker")],
    ids=["unknown-layout", "broken-carry"],
)
def test_late_unrecognized_cue_falls_back_for_the_whole_file(tmp_path, settings, carry):
    _, segments = parse(
        tmp_path,
        cue("00.000", "01.000", "", "Keep<00:00:00.250><c> me</c>"),
        cue("01.000", "01.050", "Keep me", ""),
        cue("01.050", "03.000", carry, "New words", settings),
    )
    assert segments == [
        {"start": 0.0, "end": 1.0, "text": "Keep me"},
        {"start": 1.0, "end": 1.05, "text": "Keep me"},
        {"start": 1.05, "end": 3.0, "text": carry + " New words"},
    ]


def test_untimed_new_line_and_true_repetition_keep_both_onsets(tmp_path):
    _, segments = parse(
        tmp_path,
        cue("00.000", "01.000", "", "Say<00:00:00.500><c> it</c>"),
        cue("01.000", "01.050", "Say it", ""),
        cue("01.050", "02.000", "Say it", "Say it"),
    )
    assert segments == [
        {"start": 0.0, "end": 1.05, "text": "Say it"},
        {"start": 1.05, "end": 2.0, "text": "Say it"},
    ]


@pytest.mark.parametrize("carry", ["", "Stay here"], ids=["empty-frame", "long-display-hold"])
def test_unspoken_time_stays_out_of_segments(tmp_path, carry):
    _, segments = parse(
        tmp_path,
        cue("00.000", "01.000", "", "Stay<00:00:00.500><c> here</c>"),
        cue("01.000", "01.050", "Stay here", ""),
        cue("01.050", "08.000", carry, ""),
        cue("08.000", "09.000", carry, "Words resume"),
    )
    assert segments == [
        {"start": 0.0, "end": 1.05, "text": "Stay here"},
        {"start": 8.0, "end": 9.0, "text": "Words resume"},
    ]


def test_unrecognized_inline_markup_preserves_legacy_multiline_text(tmp_path):
    _, segments = parse(
        tmp_path,
        cue("00.000", "01.000", "", "Keep<00:00:00.250><c> me</c>"),
        cue("01.000", "01.050", "Keep me", ""),
        cue("01.050", "03.000", "Keep me", "<v Speaker>New words</v>"),
    )
    assert segments[-1] == {"start": 1.05, "end": 3.0, "text": "Keep me New words"}
