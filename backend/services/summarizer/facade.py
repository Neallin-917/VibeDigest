"""
Summarizer facade - thin wrapper that coordinates all summarizer modules.

This module provides the main Summarizer class that delegates to specialized
modules for different functionality areas.
"""
import json
import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage

from services.summarizer.config import SummarizerConfig, get_llm
from services.summarizer.transcript_optimizer import TranscriptOptimizer
from services.summarizer.text_processor import TextProcessor
from services.summarizer.summary_engine import SummaryEngine
from services.summarizer.keypoint_matcher import KeypointMatcher
from services.summarizer.translation import SummaryTranslator
from utils.language_utils import normalize_lang_code

logger = logging.getLogger(__name__)


class Summarizer:
    """
    Text Summarizer using LiteLLM (Unified) for multi-language summaries.

    This is a facade class that coordinates multiple specialized modules:
    - TranscriptOptimizer: Transcript cleaning and formatting
    - TextProcessor: Chunking and paragraph organization
    - SummaryEngine: Core summarization logic
    - KeypointMatcher: Timestamp injection
    - SummaryTranslator: Translation between languages
    """

    def __init__(self):
        """Initialize the Summarizer with all sub-modules."""
        self.config = SummarizerConfig()

        # Initialize sub-modules
        self._transcript_optimizer = TranscriptOptimizer(
            self.config, self._ainvoke_with_fallback
        )
        self._text_processor = TextProcessor(
            self.config, self._ainvoke_with_fallback
        )
        self._summary_engine = SummaryEngine(
            self.config,
            self._ainvoke_with_fallback,
            self._text_processor,
        )
        self._keypoint_matcher = KeypointMatcher(self.config)
        self._translator = SummaryTranslator(
            self.config, self._ainvoke_with_fallback
        )

        # Expose some config properties for backward compatibility
        self.api_key = self.config.api_key
        self.base_url = self.config.base_url
        self.summary_models = self.config.summary_models
        self.language_map = self.config.language_map

    async def _ainvoke_with_fallback(
        self,
        models: List[str],
        messages: List[Dict[str, str]],
        trace_config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Invoke LLM with fallback through multiple models.

        Args:
            models: List of model names to try in order
            messages: List of message dicts with 'role' and 'content'
            trace_config: Optional tracing configuration
            **kwargs: Additional arguments

        Returns:
            LLM response

        Raises:
            Exception: If all models fail
        """
        lc_messages: List[BaseMessage] = []
        for m in messages:
            if m["role"] == "system":
                lc_messages.append(SystemMessage(content=m["content"]))
            elif m["role"] == "user":
                lc_messages.append(HumanMessage(content=m["content"]))
            else:
                lc_messages.append(HumanMessage(content=m["content"]))

        trace_config = trace_config or {}
        run_name = trace_config.get("run_name") or trace_config.get("name") or "LLM Call"
        lc_config = {
            "run_name": run_name,
            "metadata": trace_config.get("metadata", {}),
            **{
                k: v
                for k, v in trace_config.items()
                if k not in ("name", "run_name", "metadata")
            },
        }

        model_kwargs = kwargs.get("model_kwargs", {}) or {}
        if "response_format" in kwargs:
            model_kwargs["response_format"] = kwargs.pop("response_format")

        max_tokens = kwargs.get("max_completion_tokens")

        last_exception = None
        for model in models:
            try:
                llm = get_llm(model, max_tokens=max_tokens, model_kwargs=model_kwargs)
                response = await llm.ainvoke(lc_messages, config=lc_config)
                return response
            except Exception as e:
                logger.warning(f"Model {model} failed: {e}")
                last_exception = e
                continue

        raise last_exception or Exception("All models failed")

    # -------------------------------------------------------------------------
    # Public API - Delegates to sub-modules
    # -------------------------------------------------------------------------

    async def optimize_transcript(
        self, raw_transcript: str, trace_metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Optimize a raw transcript for better readability."""
        return await self._transcript_optimizer.optimize_transcript(
            raw_transcript, trace_metadata
        )

    def fast_clean_transcript(self, raw_transcript: str) -> str:
        """Quick cleanup of transcript without LLM processing."""
        return self._transcript_optimizer.fast_clean_transcript(raw_transcript)

    async def summarize(
        self,
        transcript: str,
        target_language: str = "zh",
        video_title: Optional[str] = None,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate a summary of the transcript."""
        return await self._summary_engine.summarize(
            transcript,
            target_language,
            video_title,
            trace_metadata,
        )

    async def summarize_in_language_with_anchors(
        self,
        transcript: str,
        *,
        summary_language: str,
        video_title: Optional[str] = None,
        script_raw_json: Optional[str] = None,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate summary with timestamp anchors for keypoints."""
        base = await self.summarize(
            transcript,
            summary_language,
            video_title,
            trace_metadata=trace_metadata,
        )
        raw_info_lang, segments = self._keypoint_matcher.parse_script_raw_payload(
            script_raw_json
        )
        if not segments:
            return base
        try:
            obj = json.loads(base)
            if isinstance(obj, dict):
                lang_code = (
                    normalize_lang_code(raw_info_lang).split("-")[0]
                    if raw_info_lang != "unknown"
                    else "en"
                )
                obj = self._keypoint_matcher.inject_keypoint_timestamps(
                    obj, segments, lang=lang_code
                )
                return json.dumps(obj, ensure_ascii=False)
            return base
        except Exception:
            return base

    async def translate_summary_json(
        self, summary_json: str, *, target_language: str, trace_metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Translate a summary JSON to a target language."""
        return await self._translator.translate_summary_json(
            summary_json, target_language=target_language, trace_metadata=trace_metadata
        )

    # -------------------------------------------------------------------------
    # Legacy methods for backward compatibility
    # -------------------------------------------------------------------------

    def _estimate_tokens(self, text: str) -> int:
        """Estimate tokens in text."""
        return self._text_processor.estimate_tokens(text)

    def _normalize_lang_code(self, lang: Optional[str]) -> str:
        """Normalize a language code."""
        return normalize_lang_code(lang)

    def _extract_first_json_object(self, text: str) -> Optional[str]:
        """Extract first JSON object from text."""
        from utils.text_utils import extract_first_json_object
        return extract_first_json_object(text)

    def _fallback_summary_json_v1(self, transcript: str, target_language: str) -> str:
        """Generate a basic fallback summary without LLM."""
        return self._summary_engine._fallback_summary_json_v1(transcript, target_language)

    def _apply_basic_formatting(self, text: str) -> str:
        """Apply basic formatting to text without LLM assistance."""
        return self._transcript_optimizer._apply_basic_formatting(text)

    def _smart_split_long_chunk(self, text: str, max_chars_per_chunk: int) -> List[str]:
        """Split a long chunk using RecursiveCharacterTextSplitter."""
        return self._transcript_optimizer._smart_split_long_chunk(text, max_chars_per_chunk)

    def _get_llm(self, model: str, max_tokens: Optional[int] = None, model_kwargs: Optional[Dict[str, Any]] = None) -> Any:
        """Get LLM instance for a model."""
        return get_llm(model, max_tokens, model_kwargs)

    @property
    def use_response_format_json(self) -> bool:
        """Whether to use JSON response format."""
        return self.config.use_response_format_json

    @use_response_format_json.setter
    def use_response_format_json(self, value: bool) -> None:
        """Set whether to use JSON response format."""
        self.config.use_response_format_json = value
