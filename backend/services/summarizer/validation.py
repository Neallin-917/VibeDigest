"""Strict validation helpers for persisted V4 summary payloads."""

from __future__ import annotations

import json
from typing import Any, Dict

from services.summarizer.models import SummaryResponseV4, SummaryResponseV5


def _coerce_summary_payload(summary: Any) -> Dict[str, Any]:
    if summary is None:
        raise ValueError("Empty summary payload")
    if hasattr(summary, "model_dump"):
        payload = summary.model_dump()
    elif isinstance(summary, dict):
        payload = summary
    elif isinstance(summary, str):
        try:
            payload = json.loads(summary)
        except json.JSONDecodeError as exc:
            raise ValueError("Summary payload is not valid JSON") from exc
    else:
        raise ValueError("Unsupported summary payload type")

    if not isinstance(payload, dict):
        raise ValueError("Summary payload must be a JSON object")

    return payload


def _require_non_empty(value: str, field_name: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Summary payload missing {field_name}")


def parse_summary_payload_v4(summary: Any) -> Dict[str, Any]:
    """Validate persisted V4/V5 summaries and drop invalid optional V5 UI blocks."""

    payload = _coerce_summary_payload(summary)
    version_value = payload.get("version")

    try:
        version = int(version_value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Summary payload missing version") from exc

    if version < 4:
        raise ValueError("Summary payload must be V4 or newer")

    validated = (SummaryResponseV5 if version >= 5 else SummaryResponseV4).model_validate(payload)

    _require_non_empty(validated.language, "language")
    _require_non_empty(validated.overview, "overview")

    if not validated.keypoints:
        raise ValueError("Summary payload missing keypoints")

    for keypoint in validated.keypoints:
        _require_non_empty(keypoint.title, "keypoint title")
        _require_non_empty(keypoint.detail, "keypoint detail")
        _require_non_empty(keypoint.evidence, "keypoint evidence")

    normalized = validated.model_dump()
    normalized["version"] = version
    return normalized
