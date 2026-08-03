"""
Centralized Pydantic schemas for VibeDigest.

This module consolidates all Pydantic models used across the application,
serving as the single source of truth for data structures. These schemas
are used for:
- LLM structured output enforcement
- API request/response validation
- TypeScript type generation (via pydantic-to-typescript)
"""

# Re-export enums from constants
from constants import OutputKind, TaskStatus

# Re-export models from services
from services.summarizer import (
    ContentClassification,
    KeyPoint,
    ActionItem,
    Risk,
    SummaryResponse,
)
from services.transcript_guard import TranscriptValidation

# Export API response schemas
from .api import (
    TaskCreateResponse,
    TaskStatusResponse,
    TaskOutputResponse,
    RetryOutputResponse,
)

__all__ = [
    # Enums
    "OutputKind",
    "TaskStatus",
    # Summary models
    "ContentClassification",
    "KeyPoint",
    "ActionItem",
    "Risk",
    "SummaryResponse",
    # Validation models
    "TranscriptValidation",
    # API Response models
    "TaskCreateResponse",
    "TaskStatusResponse",
    "TaskOutputResponse",
    "RetryOutputResponse",
]
