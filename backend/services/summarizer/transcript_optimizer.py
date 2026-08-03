"""
Transcript optimization module.

This module handles transcript cleaning, formatting, and optimization
using LLM-assisted processing for improved readability.
"""
import logging
import re
from typing import Any, Dict, List, Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings
from prompts import (
    OPTIMIZE_TRANSCRIPT_SYSTEM_ZH,
    OPTIMIZE_TRANSCRIPT_USER_ZH,
    OPTIMIZE_TRANSCRIPT_SYSTEM_EN,
    OPTIMIZE_TRANSCRIPT_USER_EN,
)
from utils.text_utils import (
    ensure_markdown_paragraphs,
    remove_timestamps_and_meta,
    remove_transcript_heading,
    enforce_paragraph_max_chars,
    detect_language,
)
from utils.trace_utils import build_trace_config

logger = logging.getLogger(__name__)


class TranscriptOptimizer:
    """
    Handles transcript optimization and formatting.

    This class provides methods for cleaning raw transcripts,
    optimizing them with LLM assistance, and ensuring proper formatting.
    """

    def __init__(self, config: Any, invoke_with_fallback: Any):
        """
        Initialize the TranscriptOptimizer.

        Args:
            config: SummarizerConfig instance
            invoke_with_fallback: Async function for LLM invocation with fallback
        """
        self.config = config
        self._ainvoke_with_fallback = invoke_with_fallback

    async def optimize_transcript(
        self, raw_transcript: str, trace_metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Optimize a raw transcript for better readability.

        Args:
            raw_transcript: The raw transcript text
            trace_metadata: Optional tracing metadata

        Returns:
            Optimized transcript text
        """
        trace_config = build_trace_config(
            base=trace_metadata,
            run_name="Ingest/Optimize",
            stage="ingest",
            metadata={"text_len": len(raw_transcript)},
        )

        try:
            if not self.config.is_llm_available:
                logger.warning("Text LLM unavailable, returning improved transcript")
                return remove_timestamps_and_meta(raw_transcript)

            preprocessed = remove_timestamps_and_meta(raw_transcript)
            detected_lang_code = detect_language(preprocessed)
            max_chars_per_chunk = 12000

            if len(preprocessed) > max_chars_per_chunk:
                logger.info(f"Text long ({len(preprocessed)}), chunking optimization")
                trace_config["metadata"]["strategy"] = "chunked"
                return await self._format_long_transcript_in_chunks(
                    preprocessed, detected_lang_code, max_chars_per_chunk, trace_config
                )
            else:
                trace_config["metadata"]["strategy"] = "single"
                return await self._format_single_chunk(
                    preprocessed, detected_lang_code, trace_config=trace_config
                )
        except Exception as e:
            logger.error(f"Transcript optimization failed: {e}")
            return raw_transcript

    def fast_clean_transcript(self, raw_transcript: str) -> str:
        """
        Quick cleanup of transcript without LLM processing.

        Args:
            raw_transcript: The raw transcript text

        Returns:
            Cleaned transcript text
        """
        if not raw_transcript:
            return ""
        cleaned = remove_timestamps_and_meta(raw_transcript)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    async def _format_single_chunk(
        self,
        chunk_text: str,
        transcript_language: str = "zh",
        trace_config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Format a single chunk of transcript text."""
        if transcript_language == "zh":
            system_prompt = OPTIMIZE_TRANSCRIPT_SYSTEM_ZH
            prompt = OPTIMIZE_TRANSCRIPT_USER_ZH.format(text=chunk_text)
        else:
            system_prompt = OPTIMIZE_TRANSCRIPT_SYSTEM_EN
            prompt = OPTIMIZE_TRANSCRIPT_USER_EN.format(text=chunk_text)

        try:
            response = await self._ainvoke_with_fallback(
                models=[self.config.transcript_model],
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_completion_tokens=settings.DEFAULT_MAX_TOKENS,
                trace_config=trace_config,
            )
            optimized_text = response.content or ""
            optimized_text = remove_transcript_heading(optimized_text)
            enforced = enforce_paragraph_max_chars(
                optimized_text.strip(), max_chars=400
            )
            return ensure_markdown_paragraphs(enforced)
        except Exception as e:
            logger.error(f"Chunk optimization failed: {e}")
            return self._apply_basic_formatting(chunk_text)

    async def _format_long_transcript_in_chunks(
        self,
        raw_transcript: str,
        transcript_language: str,
        max_chars_per_chunk: int,
        trace_config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Format a long transcript by processing in chunks."""
        parts = re.split(r"([。！？\.!?]+\s*)", raw_transcript)
        sentences = []
        buf = ""
        for i, part in enumerate(parts):
            buf += part
            if i % 2 != 0:
                if buf.strip():
                    sentences.append(buf.strip())
                buf = ""
        if buf.strip():
            sentences.append(buf.strip())

        chunks = []
        cur = ""
        for s in sentences:
            candidate = (cur + " " + s).strip() if cur else s
            if len(candidate) > max_chars_per_chunk and cur:
                chunks.append(cur.strip())
                cur = s
            else:
                cur = candidate
        if cur.strip():
            chunks.append(cur.strip())

        final_chunks = []
        for c in chunks:
            if len(c) <= max_chars_per_chunk:
                final_chunks.append(c)
            else:
                final_chunks.extend(
                    self._smart_split_long_chunk(c, max_chars_per_chunk)
                )

        logger.info(f"Splitting into {len(final_chunks)} chunks for optimization")
        optimized = []
        for i, c in enumerate(final_chunks):
            chunk_with_context = c
            if i > 0:
                prev_tail = final_chunks[i - 1][-100:]
                marker = (
                    f"[上文续：{prev_tail}]"
                    if transcript_language == "zh"
                    else f"[Context continued: {prev_tail}]"
                )
                chunk_with_context = marker + "\n\n" + c
            try:
                chunk_config = None
                if trace_config:
                    chunk_config = build_trace_config(
                        base=trace_config,
                        metadata={"chunk_index": i},
                    )

                oc = await self._format_single_chunk(
                    chunk_with_context, transcript_language, trace_config=chunk_config
                )
                oc = re.sub(
                    r"^\[(上文续|Context continued)：?:?.*?\]\s*", "", oc, flags=re.S
                )
                optimized.append(oc)
            except Exception as e:
                logger.warning(f"Chunk {i + 1} failed optimization: {e}")
                optimized.append(self._apply_basic_formatting(c))

        deduped: List[str] = []
        for i, c in enumerate(optimized):
            cur_txt = c
            if i > 0 and deduped:
                prev = deduped[-1]
                overlap = self._find_overlap_between_texts(prev[-200:], cur_txt[:200])
                if overlap:
                    cur_txt = cur_txt[len(overlap) :].lstrip()
            if cur_txt.strip():
                deduped.append(cur_txt)

        merged = "\n\n".join(deduped)
        merged = remove_transcript_heading(merged)
        enforced = enforce_paragraph_max_chars(merged, max_chars=400)
        return ensure_markdown_paragraphs(enforced)

    def _smart_split_long_chunk(self, text: str, max_chars_per_chunk: int) -> List[str]:
        """Split a long chunk using RecursiveCharacterTextSplitter."""
        splitter = RecursiveCharacterTextSplitter(
            separators=["\n\n", "。", "！", "？", ".", "!", "?", "，", "；", ", ", " "],
            chunk_size=max_chars_per_chunk,
            chunk_overlap=int(max_chars_per_chunk * 0.05),
            length_function=len,
            is_separator_regex=False,
        )
        return splitter.split_text(text)

    def _find_safe_cut_point(self, text: str) -> int:
        """Find a safe point to cut text (at sentence boundary)."""
        p = text.rfind("\n\n")
        if p > 0:
            return p + 2
        last_sentence_end = -1
        for m in re.finditer(r"[。！？\.!?]\s*", text):
            last_sentence_end = m.end()
        if last_sentence_end > 20:
            return last_sentence_end
        return len(text)

    def _find_overlap_between_texts(self, text1: str, text2: str) -> str:
        """Find overlapping text between end of text1 and start of text2."""
        max_len = min(len(text1), len(text2))
        for length in range(max_len, 19, -1):
            if text1[-length:] == text2[:length]:
                cut = self._find_safe_cut_point(text2[:length])
                if cut > 20:
                    return text2[:cut]
                return text1[-length:]
        return ""

    def _apply_basic_formatting(self, text: str) -> str:
        """Apply basic formatting to text without LLM assistance."""
        if not text or not text.strip():
            return text
        parts = re.split(r"([。！？\.!?]+\s*)", text)
        sentences = []
        cur = ""
        for i, part in enumerate(parts):
            cur += part
            if i % 2 != 0:
                if cur.strip():
                    sentences.append(cur.strip())
                cur = ""
        if cur.strip():
            sentences.append(cur.strip())

        paras = []
        cur = ""
        sentence_count = 0
        for s in sentences:
            candidate = (cur + " " + s).strip() if cur else s
            sentence_count += 1
            should_break = False
            if len(candidate) > 400 and cur:
                should_break = True
            elif len(candidate) > 200 and sentence_count >= 3:
                should_break = True
            elif sentence_count >= 6:
                should_break = True

            if should_break:
                paras.append(cur.strip())
                cur = s
                sentence_count = 1
            else:
                cur = candidate
        if cur.strip():
            paras.append(cur.strip())
        return ensure_markdown_paragraphs("\n\n".join(paras))
