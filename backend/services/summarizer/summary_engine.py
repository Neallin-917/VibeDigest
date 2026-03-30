"""
Core summary generation engine.

This module handles the V4 dynamic two-phase summary generation:
- Phase 1: Analyze content and plan which sections to generate
- Phase 2: Generate full summary with planned sections
"""
import json
import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import SystemMessage, HumanMessage

from prompts import (
    AVAILABLE_SECTION_TYPES,
    SUMMARY_V4_PHASE1_SYSTEM,
    SUMMARY_V4_PHASE1_USER,
    SUMMARY_V4_PHASE2_SYSTEM,
    SUMMARY_V4_PHASE2_USER,
    SECTION_INSTRUCTION_TEMPLATES,
)
from services.summarizer.models import SummaryResponseV4, ContentPlan
from services.summarizer.config import get_llm
from utils.language_utils import normalize_lang_code
from utils.trace_utils import build_trace_config
from utils.llm_router import invoke_structured

logger = logging.getLogger(__name__)


class SummaryEngine:
    """
    Core engine for generating V4 dynamic summaries.

    Uses a two-phase approach:
    - Phase 1: Analyze content and plan which sections to generate
    - Phase 2: Generate full summary with planned sections
    """

    def __init__(
        self,
        config: Any,
        invoke_with_fallback: Any,
        text_processor: Any,
        classifier: Any,
    ):
        """
        Initialize the SummaryEngine.

        Args:
            config: SummarizerConfig instance
            invoke_with_fallback: Async function for LLM invocation with fallback
            text_processor: TextProcessor instance for chunking
            classifier: ContentClassifier instance (kept for compatibility)
        """
        self.config = config
        self._ainvoke_with_fallback = invoke_with_fallback
        self.text_processor = text_processor
        self.classifier = classifier

    async def summarize(
        self,
        transcript: str,
        target_language: str = "en",
        video_title: Optional[str] = None,
        existing_classification: Optional[Dict[str, Any]] = None,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generate a V4 dynamic summary of the transcript.

        Args:
            transcript: The transcript text to summarize
            target_language: Target language code
            video_title: Optional video title (unused in V4)
            existing_classification: Optional pre-computed classification (unused in V4)
            trace_metadata: Optional tracing metadata

        Returns:
            JSON string containing the V4 summary with dynamic sections
        """
        if not self.config.api_key:
            raise RuntimeError("OpenAI API unavailable for summary generation")

        target_language = normalize_lang_code(target_language)

        return await self._summarize_v4_dynamic(
            transcript,
            target_language,
            trace_metadata=trace_metadata,
        )

    async def _summarize_v4_dynamic(
        self,
        transcript: str,
        target_language: str,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """V4 Two-phase dynamic summary using structured output."""
        language_name = self.config.language_map.get(target_language, "English")

        # Phase 1: Analyze content and plan sections
        transcript_sample = transcript[:2000] if len(transcript) > 2000 else transcript

        phase1_system = SUMMARY_V4_PHASE1_SYSTEM.format(
            available_sections=AVAILABLE_SECTION_TYPES
        )
        phase1_user = SUMMARY_V4_PHASE1_USER.format(transcript_sample=transcript_sample)

        lc_config_p1 = build_trace_config(
            base=trace_metadata,
            run_name="Cognition/Summarize/Plan",
            stage="cognition",
            metadata={"phase": "planning"},
        )

        phase1_model = self.config.summary_models[0]
        llm_p1 = get_llm(phase1_model, max_tokens=5000)
        messages_p1 = [
            SystemMessage(content=phase1_system),
            HumanMessage(content=phase1_user),
        ]

        plan_dict = await self._invoke_and_parse_json(llm_p1, ContentPlan, messages_p1, lc_config_p1)

        planned_sections = plan_dict.get("planned_sections", ["quotes", "insights"])[:5]
        logger.info(f"V4 Phase 1 plan: {planned_sections} (confidence: {plan_dict.get('confidence', 'N/A')})")

        # Build section instructions
        section_instructions = "\n".join([
            SECTION_INSTRUCTION_TEMPLATES.get(s, f"{s.upper()} section: Extract relevant {s}.")
            for s in planned_sections
        ])

        # Phase 2: Generate summary with planned sections
        phase2_system = SUMMARY_V4_PHASE2_SYSTEM.format(
            language_name=language_name,
            target_language=target_language,
            content_form=plan_dict.get("content_form", "casual"),
            info_structure=plan_dict.get("info_structure", "thematic"),
            cognitive_goal=plan_dict.get("cognitive_goal", "digest"),
            planned_sections=", ".join(planned_sections),
            section_instructions=section_instructions,
        )
        phase2_user = SUMMARY_V4_PHASE2_USER.format(
            content_form=plan_dict.get("content_form", "casual"),
            info_structure=plan_dict.get("info_structure", "thematic"),
            cognitive_goal=plan_dict.get("cognitive_goal", "digest"),
            planned_sections=", ".join(planned_sections),
            transcript=transcript,
        )

        lc_config_p2 = build_trace_config(
            base=trace_metadata,
            run_name="Cognition/Summarize/Generate",
            stage="cognition",
            metadata={
                "phase": "generation",
                "planned_sections": planned_sections,
            },
        )

        llm_p2 = get_llm(
            self.config.summary_models[0],
            max_tokens=self.config.summary_single_max_output_tokens
        )
        messages_p2 = [
            SystemMessage(content=phase2_system),
            HumanMessage(content=phase2_user),
        ]

        summary_dict = await self._invoke_and_parse_json(llm_p2, SummaryResponseV4, messages_p2, lc_config_p2)

        # Ensure version and language are set correctly
        summary_dict["version"] = 4
        summary_dict["language"] = target_language

        # Add content_type if not present
        if "content_type" not in summary_dict or not summary_dict["content_type"]:
            summary_dict["content_type"] = {
                "content_form": plan_dict.get("content_form", "casual"),
                "info_structure": plan_dict.get("info_structure", "thematic"),
                "cognitive_goal": plan_dict.get("cognitive_goal", "digest"),
                "confidence": plan_dict.get("confidence", 0.8),
            }

        return json.dumps(summary_dict, ensure_ascii=False)

    async def _invoke_and_parse_json(
        self,
        llm: Any,
        schema: Any,
        messages: List[Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Invoke LLM and parse response as structured JSON.

        Uses the centralized invoke_structured utility which handles
        JSON extraction and Pydantic validation in a single pass.
        """
        return await invoke_structured(llm, schema, messages, config=config)
