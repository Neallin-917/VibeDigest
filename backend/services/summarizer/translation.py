"""
Translation module for summaries.

This module handles translation of summary JSON between languages.
"""
import json
import logging
from typing import Any, Dict, Optional

from config import settings
from prompts import TRANSLATE_JSON_SYSTEM
from utils.text_utils import extract_first_json_object
from utils.language_utils import normalize_lang_code
from utils.trace_utils import build_trace_config

logger = logging.getLogger(__name__)


class SummaryTranslator:
    """
    Handles translation of summary JSON to different languages.
    """

    def __init__(self, config: Any, invoke_with_fallback: Any):
        """
        Initialize the SummaryTranslator.

        Args:
            config: SummarizerConfig instance
            invoke_with_fallback: Async function for LLM invocation with fallback
        """
        self.config = config
        self._ainvoke_with_fallback = invoke_with_fallback

    async def translate_summary_json(
        self, summary_json: str, *, target_language: str, trace_metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Translate a summary JSON to a target language.

        Args:
            summary_json: JSON string of the summary
            target_language: Target language code
            trace_metadata: Optional tracing metadata

        Returns:
            Translated summary JSON string
        """
        if not summary_json:
            return summary_json
        try:
            src_obj = json.loads(summary_json)
        except Exception:
            return summary_json
        if not isinstance(src_obj, dict):
            return summary_json
        src_obj = self._validate_summary_json_v1(
            src_obj, str(src_obj.get("language") or "unknown")
        )
        if not self.config.is_llm_available:
            return json.dumps(src_obj, ensure_ascii=False)

        tgt = normalize_lang_code(target_language)
        language_name = self.config.language_map.get(tgt, tgt)
        system_prompt = TRANSLATE_JSON_SYSTEM.format(
            language_name=language_name, target_language=tgt
        )
        user_prompt = json.dumps(
            {"targetLanguage": tgt, "input": src_obj}, ensure_ascii=False
        )

        trace_config = None
        if trace_metadata:
            trace_config = build_trace_config(
                base=trace_metadata,
                run_name="Translate/Summary",
                stage="translate",
                metadata={"target_language": target_language},
            )

        try:
            response = await self._ainvoke_with_fallback(
                models=self.config.summary_models,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_completion_tokens=max(
                    1200, int(self.config.summary_integrate_max_output_tokens)
                ),
                trace_config=trace_config,
                response_format={"type": "json_object"} if settings.USE_JSON_MODE else None,
            )
            raw = (response.content or "").strip()
            json_text = extract_first_json_object(raw) or raw
            out = json.loads(json_text)
            out = self._validate_summary_json_v1(out, tgt)
            out["language"] = tgt
            return json.dumps(out, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Translation failed: {e}")
            return json.dumps(src_obj, ensure_ascii=False)

    def _validate_summary_json_v1(self, obj: Dict[str, Any], target_language: str) -> Dict[str, Any]:
        """Validate and normalize summary JSON structure."""
        if not isinstance(obj, dict):
            raise ValueError("Summary JSON must be an object")
        version = int(obj.get("version", 2))
        language = target_language
        overview = str(obj.get("overview", "") or "").strip()
        keypoints = obj.get("keypoints", [])
        normalized_kps = []
        if isinstance(keypoints, list):
            for kp in keypoints:
                if not isinstance(kp, dict):
                    continue
                title = str(kp.get("title") or "").strip()
                detail = str(kp.get("detail") or "").strip()
                if not title and not detail:
                    continue
                out: Dict[str, Any] = {
                    "title": title or detail[:48],
                    "detail": detail,
                    "evidence": str(kp.get("evidence") or "").strip(),
                }
                if "startSeconds" in kp:
                    out["startSeconds"] = float(kp["startSeconds"])
                if "endSeconds" in kp:
                    out["endSeconds"] = float(kp["endSeconds"])
                normalized_kps.append(out)
        return {
            "version": version,
            "language": language,
            "overview": overview,
            "keypoints": normalized_kps,
        }
