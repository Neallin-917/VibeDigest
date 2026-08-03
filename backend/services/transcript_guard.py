import logging
import json
import os
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from config import settings
from utils.llm_router import create_chat_model
from utils.llm_router import resolve_model_for_intent
from utils.text_utils import extract_pure_text, count_words_or_units, extract_first_json_object

logger = logging.getLogger(__name__)

class TranscriptValidation(BaseModel):
    is_valid: bool = Field(description="Whether the transcript is reasonably relevant to the video title and not a placeholder.")
    reason: str = Field(description="Brief reason for the validation result.")

class TranscriptGuard:
    """
    AI-powered guard to validate transcripts and detect poor quality or placeholder content.
    """
    
    def __init__(self, model_name: Optional[str] = None):
        self.model_name = (
            model_name
            or resolve_model_for_intent("guard")
            or settings.MODEL_FAST
        )
        self._llm: Optional[Any] = None
        self._llm_json: Optional[Any] = None
        self.fail_closed = (
            str(os.getenv("TRANSCRIPT_GUARD_FAIL_CLOSED", "false")).strip().lower()
            in ("1", "true", "t", "yes", "y", "on")
        )
        self.use_response_format_json = (
            str(os.getenv("OPENAI_USE_RESPONSE_FORMAT_JSON", "true")).strip().lower()
            in ("1", "true", "t", "yes", "y", "on")
        )

    def _get_llm(self, *, use_json: bool = False):
        if use_json:
            if self._llm_json is None:
                self._llm_json = create_chat_model(
                    model_name=self.model_name,
                    temperature=0,
                    model_kwargs={"response_format": {"type": "json_object"}},
                )
            return self._llm_json
        if self._llm is None:
            self._llm = create_chat_model(model_name=self.model_name, temperature=0)
        return self._llm

    async def validate(
        self, 
        transcript: str, 
        video_title: str, 
        video_duration: Optional[float] = None,
        trace_metadata: Optional[Dict] = None
    ) -> bool:
        """
        Validate transcript quality using heuristics and AI.
        Returns True if valid, False if it should be rejected.
        """
        if not transcript:
            return False

        # 1. Heuristic Check: Duration vs Text Length
        # If we have duration, we can check if the transcript is suspiciously short or long for the video.
        # But even without duration, we can check absolute length.
        pure_text = extract_pure_text(transcript)
        word_count = count_words_or_units(pure_text)
        
        if word_count < 20:
            logger.warning(f"Transcript too short ({word_count} words). Rejecting.")
            return False

        if video_duration and video_duration > 60: # If video > 1 min
             # If transcript covers < 5% of video duration (roughly)
             # This is hard to estimate precisely without segment details, 
             # but we can detect if Supadata returned a single 0.1s segment.
             pass

        # 2. AI Semantic Check
        # Sample the transcript (beginning, middle, end) if it's long
        sample_size = 1500
        if len(pure_text) > sample_size * 2:
            sample = f"{pure_text[:sample_size]}\n... [Content Cut] ...\n{pure_text[-sample_size:]}"
        else:
            sample = pure_text

        system_prompt = (
            "You are a transcript quality guard. Your goal is to detect if a transcript is "
            "a generic placeholder, a technical introduction (like NLP intro), or completely "
            "irrelevant to the video title.\n\n"
            "Respond with 'is_valid' as false if:\n"
            "1. The content describes a generic concept (e.g. 'What is NLP') but the title is specific (e.g. 'Claude SDK Workshop').\n"
            "2. The content looks like an AI-generated template or a system error message.\n"
            "3. The content is extremely generic and lacks any specific details from the title."
        )
        if self.use_response_format_json:
            system_prompt += (
                "\n\nReturn ONLY a JSON object with keys: is_valid (boolean), reason (string)."
            )
        
        user_prompt = f"Video Title: {video_title}\n\nTranscript Sample:\n{sample}"

        llm = self._get_llm(use_json=self.use_response_format_json)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        async def _invoke_once() -> TranscriptValidation:
            if self.use_response_format_json:
                raw = await llm.ainvoke(messages)
                raw_text = getattr(raw, "content", None) or str(raw)
                json_text = extract_first_json_object(raw_text) or raw_text
                return TranscriptValidation(**json.loads(json_text))

            if settings.LLM_RUNTIME == "codex_local":
                raise ValueError(
                    "Codex local runtime requires JSON response_format parsing"
                )
            structured_llm = llm.with_structured_output(TranscriptValidation)
            result = await structured_llm.ainvoke(messages)
            if result is None:
                raise ValueError("Structured transcript validation returned None")
            if hasattr(result, "model_dump"):
                return TranscriptValidation(**result.model_dump())
            if hasattr(result, "dict"):
                return TranscriptValidation(**result.dict())
            if isinstance(result, dict):
                return TranscriptValidation(**result)
            if isinstance(result, str):
                return TranscriptValidation(**json.loads(result))
            if isinstance(result, TranscriptValidation):
                return result
            raise ValueError(f"Unexpected validation type: {type(result)!r}")

        last_error: Optional[Exception] = None
        for attempt in range(2):
            try:
                obj = await _invoke_once()
                if not obj.is_valid:
                    logger.warning(f"AI Guard rejected transcript: {obj.reason}")
                    return False
                logger.info("AI Guard validated transcript successfully.")
                return True
            except Exception as e:
                last_error = e
                logger.error(f"AI Guard validation failed (attempt {attempt + 1}/2): {e}")

        logger.error(
            "AI Guard validation failed after retry.",
            exc_info=last_error,
        )
        if self.fail_closed:
            logger.error("Transcript guard set to fail-closed; blocking transcript.")
            return False

        # Default to fail-open to avoid blocking valid content when AI is down
        logger.warning("Transcript guard set to fail-open (default); allowing transcript.")
        return True
