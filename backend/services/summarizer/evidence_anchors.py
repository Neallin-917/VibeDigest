"""Locate an entire evidence passage in uniquely matching, source-timed captions."""
import json
import re
import unicodedata
from bisect import bisect_right


def _words(text: str) -> list[str]:
    folded = unicodedata.normalize("NFKC", text).casefold()
    # Han and kana are commonly written without spaces. Keep their character boundaries.
    folded = re.sub(r"([\u3040-\u30ff\u3400-\u9fff])", r" \1 ", folded)
    return re.findall(r"[^\W_]+|[^\s]", folded.replace("’", "'"))


def add_source_anchors(points: list[dict], raw: str) -> None:
    try:
        transcript = json.loads(raw)
    except (TypeError, ValueError):
        return
    if not isinstance(transcript, dict) or transcript.get("source_timed") is not True:
        return
    segments = transcript.get("segments")
    if not isinstance(segments, list) or not segments:
        return

    # Each offset identifies the leading space before a caption's first word.
    parts = []
    offsets = []
    starts = []
    offset = 0
    previous_end = None
    for segment in segments:
        if not isinstance(segment, dict) or not isinstance(segment.get("text"), str):
            return
        start = segment.get("start")
        if type(start) not in (int, float) or not 0 <= start <= 2**53 - 1:
            return
        if starts and start < starts[-1]:
            return
        words = _words(segment["text"])
        if words:
            # Match across cues only when their boundaries meet.
            if parts and (previous_end is None or start != previous_end):
                parts.append(" \n")
                offset += 2
            part = " " + " ".join(words)
            offsets.append(offset)
            starts.append(start)
            parts.append(part)
            offset += len(part)
            end = segment.get("end")
            previous_end = end if type(end) in (int, float) and start <= end <= 2**53 - 1 else None

    text = "".join(parts) + " "
    for point in points:
        words = _words(point["evidence"])
        if sum(word.isalnum() for word in words) < 6:
            continue
        phrase = " " + " ".join(words) + " "
        match = text.find(phrase)
        if match >= 0 and text.find(phrase, match + 1) < 0:
            point["startSeconds"] = starts[bisect_right(offsets, match) - 1]
