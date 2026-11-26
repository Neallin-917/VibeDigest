"""Read YouTube's two-line rolling display when its entire layout can be verified."""
import html
import re

STAMP = r"\d{2}:\d{2}:\d{2}\.\d{3}"
CUE = re.compile(rf"({STAMP}) --> ({STAMP}) align:start position:(?:0|100)%")
WORD_TIME = re.compile(rf"<{STAMP}>")
INLINE = re.compile(rf"<{STAMP}>|</?c>")


def _milliseconds(stamp: str) -> int:
    hours, minutes, seconds, milliseconds = map(int, re.split(r"[:.]", stamp))
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds


def parse_rolling_captions(content: str) -> list[dict]:
    # A manual two-line caption can contain two independent lines. Recognize this
    # machine-generated format only with both timed words and verified carryover.
    blocks = content.rstrip("\n").split("\n\n")
    if not blocks or not blocks[0].startswith("WEBVTT\nKind: captions\n"):
        return []
    segments = []
    previous_text = ""
    previous_end = 0
    spoken_end = 0
    saw_refresh = False
    saw_word_time = False
    for block in blocks[1:]:
        lines = block.splitlines()
        if len(lines) != 3 or not (cue := CUE.fullmatch(lines[0])):
            return []
        start, end = map(_milliseconds, cue.groups())
        if start < previous_end or end <= start:
            return []
        text_lines = [INLINE.sub("", line).strip() for line in lines[1:]]
        if any(re.search(r"<[^>]*>", line) for line in text_lines):
            return []
        carry, new = map(html.unescape, text_lines)
        if carry and carry != previous_text:
            return []
        saw_refresh |= bool(carry and not new)
        saw_word_time |= bool(WORD_TIME.search(lines[2]))
        if new:
            segments.append({"start": start / 1000, "end": end / 1000, "text": new})
            previous_text = new
            spoken_end = end
        elif (
            carry
            and start == previous_end
            and end - spoken_end <= 100
            and segments[-1]["end"] == start / 1000
        ):
            # A brief display-only refresh bridges consecutive updates. Longer
            # holds or empty frames retain their time gap.
            segments[-1]["end"] = end / 1000
        elif not carry:
            previous_text = ""
        previous_end = end
    return segments if saw_refresh and saw_word_time else []
