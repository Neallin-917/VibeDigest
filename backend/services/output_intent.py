"""Deterministic output-intent parsing and resolution.

The language model is free to use the persisted request when composing a
summary, but queue ownership, task identity, and the initial output locale
must be decided without a provider call.  Keeping this small parser at the API
boundary makes those product controls testable and credit-free.
"""

from __future__ import annotations

import re
from typing import Any, Mapping

from utils.language_utils import normalize_lang_code


_EXPLICIT_LANGUAGE_PATTERNS: tuple[tuple[str, tuple[re.Pattern[str], ...]], ...] = (
    (
        "zh",
        (
            re.compile(r"(?:用|以|翻译成|总结成|输出为|生成).{0,12}(?:中文|汉语|普通话)"),
            re.compile(r"(?:in|into)\s+(?:simplified\s+)?chinese", re.I),
            re.compile(r"chinese\s+(?:summary|output|brief)", re.I),
        ),
    ),
    (
        "en",
        (
            re.compile(r"(?:用|以|翻译成|总结成|输出为|生成).{0,12}(?:英文|英语)"),
            re.compile(r"(?:in|into)\s+english", re.I),
            re.compile(r"english\s+(?:summary|output|brief)", re.I),
        ),
    ),
)

_SUPPORTED_OUTPUT_LOCALES = {"en", "zh"}


def _explicit_locale(request_text: str) -> str | None:
    for locale, patterns in _EXPLICIT_LANGUAGE_PATTERNS:
        if any(pattern.search(request_text) for pattern in patterns):
            return locale
    return None


def build_output_intent(
    request_text: str | None,
    ui_locale: str | None,
) -> dict[str, Any]:
    """Persist the request and resolve deterministic intent fields.

    The precedence implemented here is the portion observable at submit time:
    explicit task wording, then the UI locale.  Source-language fallback is
    intentionally left unresolved until transcript ingestion detects it.
    """
    text = (request_text or "").strip()
    explicit_locale = _explicit_locale(text)
    normalized_ui_locale = normalize_lang_code(ui_locale)

    if explicit_locale in _SUPPORTED_OUTPUT_LOCALES:
        target_locale = explicit_locale
        locale_source = "explicit_instruction"
    elif normalized_ui_locale in _SUPPORTED_OUTPUT_LOCALES:
        target_locale = normalized_ui_locale
        locale_source = "ui_locale"
    elif ui_locale:
        target_locale = "en"
        locale_source = "default_locale"
    else:
        target_locale = None
        locale_source = "source_language"

    lower = text.lower()
    depth = "detailed" if any(token in lower for token in ("detailed", "in-depth", "深入", "详细")) else "standard"
    audience = "investment_analyst" if any(
        token in lower for token in ("investment analyst", "投资分析师", "analyst brief")
    ) else None
    preserve_source_terms = any(
        token in lower
        for token in ("preserve", "original quote", "original quotes", "保留", "原文术语", "英文术语")
    )

    return {
        "version": 1,
        "request_text": text,
        "target_locale": target_locale,
        "locale_source": locale_source,
        "depth": depth,
        "audience": audience,
        "preserve_source_terms": preserve_source_terms,
    }


def resolve_output_intent(
    intent: Mapping[str, Any] | None,
    source_language: str | None,
) -> dict[str, Any]:
    """Resolve source fallback after the reusable transcript is available."""
    resolved = dict(intent or {})
    target_locale = normalize_lang_code(resolved.get("target_locale"))
    if target_locale == "unknown":
        source_locale = normalize_lang_code(source_language)
        if source_locale in _SUPPORTED_OUTPUT_LOCALES:
            target_locale = source_locale
            resolved["locale_source"] = "source_language"
        else:
            target_locale = "en"
            resolved["locale_source"] = "default_locale"
    elif target_locale not in _SUPPORTED_OUTPUT_LOCALES:
        target_locale = "en"
        resolved["locale_source"] = "default_locale"
    resolved["target_locale"] = target_locale
    resolved.setdefault("version", 1)
    resolved.setdefault("request_text", "")
    resolved.setdefault("depth", "standard")
    resolved.setdefault("audience", None)
    resolved.setdefault("preserve_source_terms", False)
    return resolved
