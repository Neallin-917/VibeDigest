import logging
from typing import Any, Dict, List, Optional, Tuple

from utils.text_utils import (
    WHITESPACE_GLOBAL_REGEX,
    count_words_or_units,
    ends_with_sentence,
    find_early_punctuation_split,
    find_late_punctuation_split,
)
from utils.language_utils import is_cjk_language

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Transcript readability formatting (sentence merging + safeguards)
# ---------------------------------------------------------------------------

# Hard safeguards so we never return a single, video-length "sentence" when
# captions don't include punctuation (common with auto-generated transcripts).
MAX_SENTENCE_DURATION_SECONDS = 24.0  # keep chunks short for navigation
MAX_SENTENCE_WORDS = 80
MAX_SEGMENTS_PER_SENTENCE = 20


def _split_long_sentence_segments(segments: List[Any]) -> List[Dict[str, Any]]:
    """
    Split an over-long sentence (represented by a list of OpenAI segment objects) into bounded chunks.
    Chunks are split on segment boundaries to preserve timestamps.
    """
    chunks: List[Dict[str, Any]] = []
    chunk_segments: List[Any] = []
    chunk_units = 0
    chunk_duration = 0.0
    chunk_start: Optional[float] = None

    def push_chunk() -> None:
        nonlocal chunk_segments, chunk_units, chunk_duration, chunk_start
        if not chunk_segments:
            return
        text = " ".join([(getattr(s, "text", "") or "").strip() for s in chunk_segments]).strip()
        text = WHITESPACE_GLOBAL_REGEX.sub(" ", text).strip()
        start = chunk_start if chunk_start is not None else float(getattr(chunk_segments[0], "start", 0.0) or 0.0)
        end = float(getattr(chunk_segments[-1], "end", start) or start)
        chunks.append({"start": start, "end": end, "segments": list(chunk_segments), "text": text})
        chunk_segments = []
        chunk_units = 0
        chunk_duration = 0.0
        chunk_start = None

    for seg in segments:
        seg_text = (getattr(seg, "text", "") or "").strip()
        seg_units = count_words_or_units(seg_text)
        seg_start = float(getattr(seg, "start", 0.0) or 0.0)
        seg_end = float(getattr(seg, "end", seg_start) or seg_start)
        seg_duration = max(seg_end - seg_start, 0.0)

        next_duration = chunk_duration + seg_duration
        next_units = chunk_units + seg_units
        next_seg_count = len(chunk_segments) + 1

        exceeds_duration = bool(chunk_segments) and next_duration > MAX_SENTENCE_DURATION_SECONDS
        exceeds_units = bool(chunk_segments) and next_units > MAX_SENTENCE_WORDS
        exceeds_segments = bool(chunk_segments) and next_seg_count > MAX_SEGMENTS_PER_SENTENCE

        if exceeds_duration or exceeds_units or exceeds_segments:
            push_chunk()

        if chunk_start is None:
            chunk_start = seg_start
        chunk_segments.append(seg)
        chunk_units += seg_units
        chunk_duration += seg_duration

    push_chunk()
    return chunks


def _merge_segments_into_sentences(all_segments: List[Any]) -> List[Dict[str, Any]]:
    """
    Merge OpenAI Whisper segments into sentence-like chunks for better readability.
    Returns list of dicts: {start, end, text, segments}
    """
    if not all_segments:
        return []

    merged: List[Dict[str, Any]] = []
    current_text_parts: List[str] = []
    current_segments: List[Any] = []
    carryover_text = ""
    sentence_start: Optional[float] = None

    def flush_sentence() -> None:
        nonlocal current_text_parts, current_segments, sentence_start
        if not current_text_parts and not current_segments:
            return
        text = " ".join([p for p in current_text_parts if p]).strip()
        text = WHITESPACE_GLOBAL_REGEX.sub(" ", text).strip()
        if not text:
            current_text_parts = []
            current_segments = []
            sentence_start = None
            return
        start = sentence_start if sentence_start is not None else float(getattr(current_segments[0], "start", 0.0) or 0.0)
        end = float(getattr(current_segments[-1], "end", start) or start)
        # Safety net: split extreme sentences by boundaries
        chunks = _split_long_sentence_segments(current_segments)
        if len(chunks) <= 1:
            merged.append({"start": start, "end": end, "text": text, "segments": list(current_segments)})
        else:
            for c in chunks:
                if c["text"]:
                    merged.append(c)
        current_text_parts = []
        current_segments = []
        sentence_start = None

    for seg in all_segments:
        text = (getattr(seg, "text", "") or "").strip()
        if carryover_text:
            text = (carryover_text + " " + text).strip()
            carryover_text = ""

        # Skip empty segments, but keep timing continuity by including seg if we're in a sentence
        if not text:
            if current_text_parts:
                current_segments.append(seg)
            continue

        # Early punctuation: ". You should" should attach to previous sentence
        early_split_pos = find_early_punctuation_split(text)
        if early_split_pos > 0 and current_text_parts:
            before = text[:early_split_pos].strip()
            after = text[early_split_pos:].strip()
            if before:
                current_text_parts.append(before)
            current_segments.append(seg)
            flush_sentence()
            if not after:
                continue
            text = after

        # Late punctuation: split when punctuation appears near end (so trailing 1-2 words carry to next sentence)
        late_split_pos = find_late_punctuation_split(text)
        if late_split_pos > 0:
            before = text[:late_split_pos].strip()
            after = text[late_split_pos:].strip()
            if sentence_start is None:
                sentence_start = float(getattr(seg, "start", 0.0) or 0.0)
            if before:
                current_text_parts.append(before)
            current_segments.append(seg)
            flush_sentence()
            if after:
                carryover_text = after
            continue

        # Add segment to current sentence
        if sentence_start is None:
            sentence_start = float(getattr(seg, "start", 0.0) or 0.0)
        current_text_parts.append(text)
        current_segments.append(seg)

        if ends_with_sentence(text):
            flush_sentence()

    # Remaining
    if current_text_parts:
        flush_sentence()
    if carryover_text.strip():
        merged.append({
            "start": float(getattr(all_segments[-1], "start", 0.0) or 0.0),
            "end": float(getattr(all_segments[-1], "end", 0.0) or 0.0),
            "text": carryover_text.strip(),
            "segments": [all_segments[-1]]
        })
    return merged


def _group_sentences_into_paragraphs(sentences: List[Dict[str, Any]], max_chars: int = 550, gap_seconds: float = 2.0) -> List[Dict[str, Any]]:
    """
    Group sentence chunks into paragraphs based on time gaps and character budget.
    Returns list of dicts: {start, end, text}
    """
    if not sentences:
        return []
    paragraphs: List[Dict[str, Any]] = []
    cur_start = sentences[0]["start"]
    cur_end = sentences[0]["end"]
    cur_parts: List[str] = []

    def push_para() -> None:
        nonlocal cur_start, cur_end, cur_parts
        txt = " ".join(cur_parts).strip()
        txt = WHITESPACE_GLOBAL_REGEX.sub(" ", txt).strip()
        if txt:
            paragraphs.append({"start": cur_start, "end": cur_end, "text": txt})
        cur_parts = []

    for s in sentences:
        gap = float(s["start"]) - float(cur_end)
        candidate = (" ".join(cur_parts + [s["text"]])).strip()
        if cur_parts and (gap > gap_seconds or len(candidate) > max_chars):
            push_para()
            cur_start = s["start"]
            cur_end = s["end"]
            cur_parts = [s["text"]]
        else:
            if not cur_parts:
                cur_start = s["start"]
            cur_parts.append(s["text"])
            cur_end = s["end"]

    push_para()
    return paragraphs


def _paragraph_limits_for_language(lang: str) -> Tuple[int, float]:
    """
    Tuned readability limits:
    - CJK: shorter paragraphs feel much more readable on screen
    - Non-CJK: can be longer
    Returns: (max_chars, max_duration_seconds)
    """
    if is_cjk_language(lang):
        return 260, 28.0
    return 520, 36.0


def _group_sentences_into_paragraphs_v2(
    sentences: List[Dict[str, Any]],
    *,
    max_chars: int,
    gap_seconds: float,
    max_duration_seconds: float,
) -> List[Dict[str, Any]]:
    """
    Improved paragraph grouping with an additional max-duration bound.
    This avoids giant paragraphs for continuous speech with low gaps.
    """
    if not sentences:
        return []
    paragraphs: List[Dict[str, Any]] = []
    cur_start = float(sentences[0]["start"])
    cur_end = float(sentences[0]["end"])
    cur_parts: List[str] = []

    def push_para() -> None:
        nonlocal cur_start, cur_end, cur_parts
        txt = " ".join(cur_parts).strip()
        txt = WHITESPACE_GLOBAL_REGEX.sub(" ", txt).strip()
        if txt:
            paragraphs.append({"start": cur_start, "end": cur_end, "text": txt})
        cur_parts = []

    for s in sentences:
        s_start = float(s["start"])
        s_end = float(s["end"])
        gap = s_start - cur_end
        candidate = (" ".join(cur_parts + [s["text"]])).strip()
        # next_end = s_end
        next_duration = s_end - cur_start

        should_split = False
        if cur_parts and gap > gap_seconds:
            should_split = True
        elif cur_parts and len(candidate) > max_chars:
            should_split = True
        elif cur_parts and next_duration > max_duration_seconds:
            should_split = True

        if should_split:
            push_para()
            cur_start = s_start
            cur_end = s_end
            cur_parts = [s["text"]]
        else:
            if not cur_parts:
                cur_start = s_start
            cur_parts.append(s["text"])
            cur_end = s_end

    push_para()
    return paragraphs


def _serialize_raw_segments(all_segments: List[Any]) -> List[Dict[str, Any]]:
    """
    Convert OpenAI segment objects into JSON-serializable dicts.
    We intentionally store a minimal, stable shape for future re-formatting:
    {start, end, duration, text}
    """
    raw: List[Dict[str, Any]] = []
    for seg in all_segments or []:
        start = float(getattr(seg, "start", 0.0) or 0.0)
        end = float(getattr(seg, "end", start) or start)
        text = (getattr(seg, "text", "") or "").strip()
        raw.append({
            "start": start,
            "end": end,
            "duration": max(end - start, 0.0),
            "text": text,
        })
    return raw


def format_time(seconds: float) -> str:
    """
    Convert seconds to MM:SS or HH:MM:SS.
    """
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    seconds = seconds % 60

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes:02d}:{seconds:02d}"


def format_markdown_from_raw_segments(raw_segments: List[Dict[str, Any]], detected_language: str = "unknown") -> str:
    """
    Public helper: format transcript markdown from stored raw segments (JSON).
    This enables re-formatting without re-transcribing.
    """
    transcript_lines: List[str] = []

    # Convert raw dicts to a lightweight object-like interface expected by the merge logic.
    class _Seg:
        __slots__ = ("start", "end", "text")
        def __init__(self, start: float, end: float, text: str):
            self.start = start
            self.end = end
            self.text = text

    all_segments = []
    for s in raw_segments or []:
        try:
            start = float(s.get("start", 0.0) or 0.0)
            end = float(s.get("end", start) or start)
            text = str(s.get("text", "") or "")
            all_segments.append(_Seg(start, end, text))
        except Exception:
            continue

    sentences = _merge_segments_into_sentences(all_segments)
    max_chars, max_dur = _paragraph_limits_for_language(detected_language)
    paragraphs = _group_sentences_into_paragraphs_v2(
        sentences,
        max_chars=max_chars,
        gap_seconds=2.0,
        max_duration_seconds=max_dur,
    )
    for para in paragraphs:
        start_time = format_time(float(para["start"]))
        transcript_lines.append(f"**[{start_time}]**")
        transcript_lines.append("")
        transcript_lines.append(para["text"])
        transcript_lines.append("")

    return "\n".join(transcript_lines)
