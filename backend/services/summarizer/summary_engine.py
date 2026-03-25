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
from utils.text_utils import extract_first_json_object
from utils.language_utils import normalize_lang_code
from utils.trace_utils import build_trace_config

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
        """Invoke LLM and parse response as JSON, with retry/repair for malformed outputs."""
        raw = await llm.ainvoke(messages, config=config)
        raw_text = self._extract_raw_text(raw)

        try:
            return self._parse_schema_json(raw_text, schema)
        except Exception as first_error:
            logger.warning(
                "Initial structured parse failed for %s, retrying once: %s",
                getattr(schema, "__name__", "schema"),
                first_error,
            )

            retry_text = await self._retry_for_valid_json(
                llm, schema, messages, raw_text, first_error, config
            )
            if retry_text is not None:
                try:
                    return self._parse_schema_json(retry_text, schema)
                except Exception as retry_error:
                    logger.warning(
                        "Retry structured parse failed for %s, attempting repair: %s",
                        getattr(schema, "__name__", "schema"),
                        retry_error,
                    )
                    first_error = retry_error

            if self.config.enable_json_repair:
                repaired_text = await self._repair_json_to_schema(
                    source_text=retry_text or raw_text,
                    schema=schema,
                    config=config,
                )
                return self._parse_schema_json(repaired_text, schema)

            raise first_error

    def _extract_raw_text(self, raw: Any) -> str:
        raw_text = ""
        if hasattr(raw, "content") and raw.content:
            raw_text = raw.content
        elif hasattr(raw, "additional_kwargs"):
            kwargs = raw.additional_kwargs or {}
            if "parsed" in kwargs and kwargs["parsed"]:
                raw_text = json.dumps(kwargs["parsed"])
            elif "tool_calls" in kwargs and kwargs["tool_calls"]:
                first_call = kwargs["tool_calls"][0]
                if isinstance(first_call, dict) and "function" in first_call:
                    raw_text = json.dumps(first_call["function"].get("arguments", {}))

        if not raw_text:
            raw_text = str(raw)

        logger.info(f"[_invoke_and_parse_json] raw_text ({len(raw_text)} chars): {raw_text[:500]}...")
        return raw_text

    def _parse_schema_json(self, raw_text: str, schema: Any) -> Dict[str, Any]:
        json_text = extract_first_json_object(raw_text)
        if not json_text:
            raise ValueError(f"No JSON object found in response: {raw_text[:500]}")

        logger.info(f"[_invoke_and_parse_json] json_text: {json_text[:300]}...")

        try:
            obj = json.loads(json_text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}. Text: {json_text[:300]}")

        if obj == {}:
            raise ValueError(
                f"LLM returned empty JSON object for {getattr(schema, '__name__', 'schema')}"
            )

        parsed = schema(**obj)
        if hasattr(parsed, "model_dump"):
            return parsed.model_dump()
        return parsed.dict()

    async def _retry_for_valid_json(
        self,
        llm: Any,
        schema: Any,
        messages: List[Any],
        raw_text: str,
        error: Exception,
        config: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        retry_prompt = HumanMessage(
            content=(
                "Your previous response could not be parsed into the required JSON schema. "
                "Return ONLY one valid JSON object, no markdown, no explanation.\n\n"
                f"Schema JSON Schema:\n{schema_json}\n\n"
                f"Validation error:\n{error}\n\n"
                f"Previous response:\n{raw_text[:4000]}"
            )
        )
        retry_raw = await llm.ainvoke(messages + [retry_prompt], config=config)
        return self._extract_raw_text(retry_raw)

    async def _repair_json_to_schema(
        self,
        source_text: str,
        schema: Any,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        repair_llm = get_llm(
            self.config.json_repair_model,
            max_tokens=self.config.summary_single_max_output_tokens,
        )
        repair_messages = [
            SystemMessage(
                content=(
                    "You are a strict JSON repair tool. "
                    "Return ONLY one valid JSON object matching the provided JSON Schema. "
                    "Do not use markdown or code fences. "
                    "If the input is malformed or incomplete, salvage faithfully without inventing facts.\n\n"
                    f"JSON Schema:\n{schema_json}"
                )
            ),
            HumanMessage(content=f"Repair this into valid JSON:\n\n{source_text[:12000]}"),
        ]
        repair_raw = await repair_llm.ainvoke(repair_messages, config=config)
        repaired_text = self._extract_raw_text(repair_raw)
        logger.info(
            "[_repair_json_to_schema] repaired_text (%s chars): %s...",
            len(repaired_text),
            repaired_text[:500],
        )
        return repaired_text
