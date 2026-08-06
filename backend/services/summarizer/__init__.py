"""
Summarizer package for structured text summarization.

This package provides:
- Multi-language summary generation
- Transcript optimization
- Timestamp-based keypoint matching
- Summary translation
"""
from services.summarizer.models import (
    ContentClassification,
    KeyPoint,
    KeyQuote,
    Insight,
    ActionItem,
    Risk,
    ContentContext,
    SummaryResponse,
    SectionItem,
    DynamicSection,
    ContentPlan,
    SummaryResponseV4,
    SummaryResponseV5,
)
from services.summarizer.facade import Summarizer

__all__ = [
    "Summarizer",
    "ContentClassification",
    "KeyPoint",
    "KeyQuote",
    "Insight",
    "ActionItem",
    "Risk",
    "ContentContext",
    "SummaryResponse",
    "SectionItem",
    "DynamicSection",
    "ContentPlan",
    "SummaryResponseV4",
    "SummaryResponseV5",
]
