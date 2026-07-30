import json
import os
import logging
from typing import List, Optional
from pydantic import BaseModel, Field
from config import settings
from langchain_core.messages import SystemMessage, HumanMessage

from prompts import COMPREHENSION_BRIEF_SYSTEM, COMPREHENSION_BRIEF_USER
from utils.text_utils import get_language_name, extract_first_json_object, parse_bool_env
from utils.llm_router import ainvoke_structured_json
from utils.trace_utils import build_trace_config

logger = logging.getLogger(__name__)

class InsightItem(BaseModel):
    title: str = Field(..., description="Crisp insight headline")
    new_perspective: str = Field(..., description="What new perspective this adds. Can use newlines (\\n) for structured explanation.")
    why_it_matters: str = Field(..., description="Exactly why this changes how the user thinks (1-2 lines)")

class TargetAudience(BaseModel):
    who_benefits: List[str] = Field(..., min_length=1, description="List of people who specifically benefit from this content")
    who_wont: List[str] = Field(..., min_length=1, description="List of people who this is NOT for")

class ComprehensionBriefResponse(BaseModel):
    core_intent: str = Field(..., description="WHAT THIS IS REALLY ABOUT: 1 sentence state the core problem / intent, not topics. Can use newlines (\\n) for logical grouping.")
    core_position: str = Field(..., description="SPEAKER’S CORE POSITION: 1 sentence judgment or stance worth remembering. Can use newlines (\\n) for emphasis.")
    key_insights: List[InsightItem] = Field(..., min_length=3, max_length=5, description="KEY INSIGHTS: 3–5 items adding new perspective.")
    what_to_ignore: List[str] = Field(..., min_length=1, description="WHAT CAN BE IGNORED: List of low-signal sections, PR, filler, repetition.")
    target_audience: TargetAudience = Field(..., description="WHO THIS IS FOR / NOT FOR")
    reusable_takeaway: str = Field(..., description="REUSABLE TAKEAWAY: One transferable output (framework/checklist/etc). Support multiple lines (\\n) for better readability.")

class ComprehensionAgent:
    """Comprehension Agent: Focuses on deep understanding and user absorption."""

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        # Higher-level reasoning models prioritized for deep comprehension (Learning Tab)
        self.comprehension_models = settings.OPENAI_COMPREHENSION_MODELS
        self.use_response_format_json = parse_bool_env("OPENAI_USE_RESPONSE_FORMAT_JSON", True)

    def _get_llm(self, model_name: str, max_tokens: Optional[int] = None):
        from utils.llm_router import create_chat_model

        # Use centralized default if max_tokens not provided
        tokens = max_tokens or settings.DEFAULT_MAX_TOKENS
        
        return create_chat_model(
            model_name=model_name,
            # temperature handled by factory
            max_tokens=tokens
        )

    async def generate_comprehension_brief(
        self, 
        transcript: str, 
        target_language: str = "zh",
        trace_config: Optional[dict] = None
    ) -> str:
        """Generates a structured comprehension brief focusing on absorption."""
        # Significantly expanded to 200k chars (~50k-100k tokens) 
        # to leverage high-end models' long context reasoning window.
        max_chars = 200000 
        if len(transcript) > max_chars:
            # If still too long, we take the beginning and ending to preserve context.
            logger.info(f"Transcript too long ({len(transcript)} chars), using tail-head truncation.")
            half = max_chars // 2
            transcript = transcript[:half] + "\n... [Intermediate content skipped to preserve reasoning over start and end] ...\n" + transcript[-half:]

        # Get the descriptive language name based on project-wide LANGUAGE_MAP
        language_name = get_language_name(target_language)
        
        system_prompt = COMPREHENSION_BRIEF_SYSTEM.format(language_name=language_name)
        user_prompt = COMPREHENSION_BRIEF_USER.format(transcript=transcript, language_name=language_name)

        last_exception = None
        for model in self.comprehension_models:
            try:
                llm = self._get_llm(model)
                
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_prompt)
                ]
                
                lc_config = {}
                if trace_config:
                    lc_config = build_trace_config(
                        base=trace_config,
                        run_name="Cognition/Comprehension",
                        stage="cognition",
                    )

                if self.use_response_format_json:
                    obj = await self._invoke_with_retry_and_repair(
                        llm=llm,
                        schema=ComprehensionBriefResponse,
                        messages=messages,
                        config=lc_config,
                    )
                else:
                    obj = await ainvoke_structured_json(
                        llm,
                        ComprehensionBriefResponse,
                        messages,
                        config=lc_config,
                    )
                return json.dumps(obj, ensure_ascii=False)
            except Exception as e:
                last_exception = e
                logger.warning(f"Comprehension Brief with model {model} failed: {e}")
                continue
        
        error = last_exception or Exception("All models failed for Comprehension Brief")
        logger.error(f"Comprehension Brief failed: {error}")
        raise error

    async def _invoke_with_retry_and_repair(
        self,
        llm,
        schema,
        messages,
        config: Optional[dict] = None,
    ) -> dict:
        raw = await llm.ainvoke(messages, config=config)
        raw_text = self._extract_raw_text(raw)

        try:
            return self._parse_schema_json(raw_text, schema)
        except Exception as first_error:
            logger.warning(
                "Comprehension structured parse failed for %s, retrying once: %s",
                getattr(schema, "__name__", "schema"),
                first_error,
            )

            retry_text = await self._retry_for_valid_json(
                llm=llm,
                schema=schema,
                messages=messages,
                raw_text=raw_text,
                error=first_error,
                config=config,
            )
            if retry_text is not None:
                try:
                    return self._parse_schema_json(retry_text, schema)
                except Exception as retry_error:
                    logger.warning(
                        "Comprehension retry parse failed for %s, attempting repair: %s",
                        getattr(schema, "__name__", "schema"),
                        retry_error,
                    )
                    first_error = retry_error

            repaired_text = await self._repair_json_to_schema(
                source_text=retry_text or raw_text,
                schema=schema,
                config=config,
            )
            try:
                return self._parse_schema_json(repaired_text, schema)
            except Exception as repair_error:
                raise repair_error from first_error

    def _extract_raw_text(self, raw) -> str:
        raw_text = getattr(raw, "content", None) or str(raw)
        logger.info("[comprehension] raw_text (%s chars): %s...", len(raw_text), raw_text[:500])
        return raw_text

    def _parse_schema_json(self, raw_text: str, schema) -> dict:
        json_text = extract_first_json_object(raw_text) or raw_text
        obj_raw = json.loads(json_text)
        if obj_raw == {}:
            raise ValueError(
                f"LLM returned empty JSON object for {getattr(schema, '__name__', 'schema')}"
            )
        parsed = schema(**obj_raw)
        if hasattr(parsed, "model_dump"):
            return parsed.model_dump()
        return parsed.dict()

    async def _retry_for_valid_json(
        self,
        llm,
        schema,
        messages,
        raw_text: str,
        error: Exception,
        config: Optional[dict] = None,
    ) -> str:
        retry_prompt = HumanMessage(
            content=(
                "Your previous response could not be parsed into the required JSON schema. "
                "Return ONLY one valid JSON object, no markdown, no explanation.\n\n"
                f"Schema JSON Schema:\n{json.dumps(schema.model_json_schema(), ensure_ascii=False)}\n\n"
                f"Validation error:\n{error}\n\n"
                f"Previous response:\n{raw_text[:4000]}"
            )
        )
        retry_raw = await llm.ainvoke(messages + [retry_prompt], config=config)
        return self._extract_raw_text(retry_raw)

    async def _repair_json_to_schema(
        self,
        source_text: str,
        schema,
        config: Optional[dict] = None,
    ) -> str:
        repair_llm = self._get_llm(settings.OPENAI_HELPER_MODEL)
        repair_messages = [
            SystemMessage(
                content=(
                    "You are a strict JSON repair tool. Return ONLY one valid JSON object matching the provided JSON Schema. "
                    "No markdown, no code fences. If the source is malformed or incomplete, salvage faithfully without inventing facts.\n\n"
                    f"JSON Schema:\n{json.dumps(schema.model_json_schema(), ensure_ascii=False)}"
                )
            ),
            HumanMessage(content=f"Repair this into valid JSON:\n\n{source_text[:12000]}"),
        ]
        repair_raw = await repair_llm.ainvoke(repair_messages, config=config)
        repaired_text = self._extract_raw_text(repair_raw)
        logger.info("[comprehension] repaired_text (%s chars): %s...", len(repaired_text), repaired_text[:500])
        return repaired_text
