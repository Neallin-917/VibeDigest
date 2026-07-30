"""
Text processing utilities for the Summarizer.

This module handles text chunking, token estimation, and paragraph organization.
"""
import logging
import re
from typing import Any, List

from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings
from prompts import (
    ORGANIZE_PARAGRAPHS_SYSTEM,
    ORGANIZE_PARAGRAPHS_USER,
    ORGANIZE_CHUNK_SYSTEM,
    ORGANIZE_CHUNK_USER,
)
from utils.text_utils import extract_pure_text
from utils.env_utils import parse_int_env

logger = logging.getLogger(__name__)


class TextProcessor:
    """
    Handles text processing operations for the Summarizer.

    This includes token estimation, text chunking, and paragraph organization.
    """

    def __init__(self, config: Any, invoke_with_fallback: Any):
        """
        Initialize the TextProcessor.

        Args:
            config: SummarizerConfig instance
            invoke_with_fallback: Async function for LLM invocation with fallback
        """
        self.config = config
        self._ainvoke_with_fallback = invoke_with_fallback

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate the number of tokens in a text.

        Uses heuristics for Chinese and English text, plus overhead for
        formatting and system prompts.

        Args:
            text: The text to estimate tokens for

        Returns:
            Estimated token count
        """
        chinese_chars = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
        english_words = len(
            [word for word in text.split() if word.isascii() and word.isalpha()]
        )
        base_tokens = chinese_chars * 1.5 + english_words * 1.3
        format_overhead = len(text) * 0.15
        system_prompt_overhead = parse_int_env(
            "OPENAI_TOKEN_ESTIMATE_OVERHEAD", 2500, min_value=0, max_value=20000
        )
        return int(base_tokens + format_overhead + system_prompt_overhead)

    def split_into_chunks(self, text: str, max_tokens: int) -> List[str]:
        """
        Split text into chunks based on token limits.

        Args:
            text: The text to split
            max_tokens: Maximum tokens per chunk

        Returns:
            List of text chunks
        """
        pure_text = extract_pure_text(text)

        splitter = RecursiveCharacterTextSplitter(
            separators=["\n\n", "\n", "。", "！", "？", ".", "!", "?", " "],
            chunk_size=max_tokens,
            chunk_overlap=int(max_tokens * 0.05),
            length_function=self.estimate_tokens,
            is_separator_regex=False,
        )
        return splitter.split_text(pure_text)

    async def final_paragraph_organization(
        self, text: str, lang_instruction: str
    ) -> str:
        """
        Organize text into well-structured paragraphs.

        Args:
            text: The text to organize
            lang_instruction: Language instruction for the LLM

        Returns:
            Organized text
        """
        try:
            estimated_tokens = self.estimate_tokens(text)
            if estimated_tokens > 3000:
                return await self._organize_long_text_paragraphs(text, lang_instruction)

            system_prompt = ORGANIZE_PARAGRAPHS_SYSTEM.format(
                lang_instruction=lang_instruction
            )
            user_prompt = ORGANIZE_PARAGRAPHS_USER.format(
                lang_instruction=lang_instruction, text=text
            )

            response = await self._ainvoke_with_fallback(
                models=[self.config.paragraph_model],
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_completion_tokens=settings.DEFAULT_MAX_TOKENS,
            )
            return self._validate_paragraph_lengths(response.content)
        except Exception as e:
            logger.error(f"Final paragraph organization failed: {e}")
            return self._basic_paragraph_fallback(text)

    async def _organize_long_text_paragraphs(
        self, text: str, lang_instruction: str
    ) -> str:
        """Organize long text by processing in chunks."""
        try:
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            organized_chunks = []
            current_chunk: List[str] = []
            current_tokens = 0
            max_chunk_tokens = 2500

            for para in paragraphs:
                para_tokens = self.estimate_tokens(para)
                if current_tokens + para_tokens > max_chunk_tokens and current_chunk:
                    chunk_text = "\n\n".join(current_chunk)
                    organized_chunks.append(
                        await self._organize_single_chunk(chunk_text, lang_instruction)
                    )
                    current_chunk = [para]
                    current_tokens = para_tokens
                else:
                    current_chunk.append(para)
                    current_tokens += para_tokens
            if current_chunk:
                chunk_text = "\n\n".join(current_chunk)
                organized_chunks.append(
                    await self._organize_single_chunk(chunk_text, lang_instruction)
                )

            return "\n\n".join(organized_chunks)
        except Exception as e:
            logger.error(f"Long text organization failed: {e}")
            return self._basic_paragraph_fallback(text)

    async def _organize_single_chunk(self, text: str, lang_instruction: str) -> str:
        """Organize a single chunk of text."""
        system_prompt = ORGANIZE_CHUNK_SYSTEM.format(lang_instruction=lang_instruction)
        user_prompt = ORGANIZE_CHUNK_USER.format(
            lang_instruction=lang_instruction, text=text
        )
        response = await self._ainvoke_with_fallback(
            models=[self.config.paragraph_model],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_completion_tokens=1200,
        )
        return response.content

    def _validate_paragraph_lengths(self, text: str) -> str:
        """Validate and fix paragraph lengths."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        validated = []
        for para in paragraphs:
            if len(para.split()) > 300:
                validated.extend(self._split_long_paragraph(para))
            else:
                validated.append(para)
        return "\n\n".join(validated)

    def _split_long_paragraph(self, paragraph: str) -> List[str]:
        """Split a long paragraph into smaller ones."""
        parts = re.split(r"([.!?。！？]\s+)", paragraph)
        sentences = []
        for i in range(0, len(parts) - 1, 2):
            sentences.append(parts[i] + parts[i + 1])
        if len(parts) % 2 != 0 and parts[-1].strip():
            sentences.append(parts[-1])

        split = []
        cur_para: List[str] = []
        cur_len = 0
        for s in sentences:
            slen = len(s.split())
            if cur_len + slen > 200 and cur_para:
                split.append(" ".join(cur_para))
                cur_para = [s]
                cur_len = slen
            else:
                cur_para.append(s)
                cur_len += slen
        if cur_para:
            split.append(" ".join(cur_para))
        return split

    def _basic_paragraph_fallback(self, text: str) -> str:
        """Basic paragraph organization without LLM assistance."""
        text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        basic = []
        for para in paragraphs:
            wc = len(para.split())
            if wc > 250:
                basic.extend(self._split_long_paragraph(para))
            elif wc < 30 and basic:
                last = basic[-1]
                if len(last.split()) + wc <= 200:
                    basic[-1] = last + " " + para
                else:
                    basic.append(para)
            else:
                basic.append(para)
        return "\n\n".join(basic)
