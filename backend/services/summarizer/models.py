"""
Pydantic models for the Summarizer service.

These models define the structured output schemas for content classification
and summary generation.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ContentClassification(BaseModel):
    """Classification of content type, structure, and cognitive goal."""

    content_form: str = Field(
        ...,
        description="The form of the content, e.g. casual, tutorial, simple_explanation, deep_dive, interview, monologue, news, review, reaction, finance, narrative, marketing",
    )
    info_structure: str = Field(
        ...,
        description="The structural organization of information, e.g. thematic, sequential, argumentative, comparative, narrative_arc, problem_solution, qa_format, data_driven",
    )
    cognitive_goal: str = Field(
        ...,
        description="The primary cognitive goal for the reader, e.g. understand, decide, execute, inspire, digest, evaluate, solve, memorize",
    )
    confidence: float = Field(default=0.0, description="Confidence score between 0.0 and 1.0")


class KeyPoint(BaseModel):
    """A key point extracted from content."""

    title: str = Field(..., description="Concise title of the key point")
    detail: str = Field(..., description="Detailed explanation of the key point")
    why_it_matters: Optional[str] = Field(
        default="", description="Practical significance or downstream effects"
    )
    evidence: str = Field(
        ..., description="Exact quote or evidence from the text properly attributed"
    )


class SectionItem(BaseModel):
    """A single item within a dynamic section."""
    
    content: str = Field(..., description="Main content of this item")
    metadata: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional metadata (priority, severity, speaker, etc.)"
    )


class DynamicSection(BaseModel):
    """A dynamically generated section based on content analysis."""
    
    section_type: str = Field(
        ..., 
        description="Type identifier: quotes, insights, action_items, risks, timeline, lessons, comparisons, etc."
    )
    title: str = Field(..., description="Human-readable section title in target language")
    description: Optional[str] = Field(
        default="", description="Brief explanation of what this section contains"
    )
    items: List[SectionItem] = Field(
        default_factory=list, description="List of items in this section"
    )


class ContentPlan(BaseModel):
    """Phase 1 output: Content analysis and section planning."""
    
    content_form: str = Field(..., description="Detected content form")
    info_structure: str = Field(..., description="Detected information structure")
    cognitive_goal: str = Field(..., description="Primary cognitive goal for reader")
    planned_sections: List[str] = Field(
        ..., 
        description="List of section types to generate (e.g., ['quotes', 'insights', 'action_items'])"
    )
    confidence: float = Field(default=0.8, description="Confidence score 0.0-1.0")
    section_rationale: Optional[Dict[str, str]] = Field(
        default=None,
        description="Brief rationale for why each section was chosen"
    )


class ContentContext(BaseModel):
    """Context information to help readers navigate the content."""

    prerequisites: Optional[List[str]] = Field(
        default_factory=list, description="What should I know first?"
    )
    related_topics: Optional[List[str]] = Field(
        default_factory=list, description="What else should I explore?"
    )
    best_for: Optional[List[str]] = Field(
        default_factory=list, description="Who will benefit most from this content?"
    )


class SummaryResponseV4(BaseModel):
    """V4 Summary with dynamic sections based on content analysis."""

    version: int = Field(default=4)
    language: str = Field(..., description="Language code of the summary (e.g., 'zh')")
    tl_dr: str = Field(default="", description="Ultra-concise 1-2 sentence takeaway")
    overview: str = Field(..., description="A comprehensive overview of the content")
    keypoints: List[KeyPoint] = Field(
        ..., description="Core key points (always present)"
    )
    sections: List[DynamicSection] = Field(
        default_factory=list,
        description="Dynamically generated sections based on content analysis"
    )
    context: Optional[ContentContext] = Field(
        default=None, description="Context to help readers navigate"
    )
    content_type: Optional[ContentClassification] = Field(
        None, description="Classification metadata"
    )


# ============================================================================
# LEGACY MODELS (Backward Compatibility)
# ============================================================================

class KeyQuote(BaseModel):
    """A memorable or impactful verbatim quote."""

    quote: str = Field(..., description="Exact words in original language")
    speaker: str = Field(default="Speaker", description="Who said it")
    context: str = Field(default="", description="Why this quote matters")


class Insight(BaseModel):
    """A meta-level observation about the content."""

    insight: str = Field(..., description="A synthesis, pattern, or implication")
    originality: str = Field(
        default="conventional",
        description="How novel: novel, contrarian, synthesis, conventional"
    )


class ActionItem(BaseModel):
    """An actionable item or next step from the content."""

    content: str = Field(..., description="The action item or next step")
    priority: str = Field(
        default="medium", description="Priority level: high, medium, or low"
    )
    effort: str = Field(
        default="project", description="Effort: quick_win, project, strategic"
    )


class Risk(BaseModel):
    """A risk or warning mentioned in the content."""

    content: str = Field(..., description="The risk or warning description")
    severity: str = Field(
        default="medium", description="Severity level: high, medium, or low"
    )
    mitigation: str = Field(
        default="", description="How to avoid or minimize this risk"
    )


class SummaryResponse(BaseModel):
    """Complete structured summary response (v3 - backward compatible)."""

    version: int = Field(default=3)
    language: str = Field(..., description="Language code of the summary (e.g., 'zh')")
    tl_dr: Optional[str] = Field(
        default="", description="Ultra-concise 1-2 sentence takeaway"
    )
    overview: str = Field(..., description="A comprehensive overview of the content")
    keypoints: List[KeyPoint] = Field(
        ..., description="List of key points extracted from the content"
    )
    key_quotes: Optional[List[KeyQuote]] = Field(
        default_factory=list, description="Memorable or impactful verbatim quotes"
    )
    insights: Optional[List[Insight]] = Field(
        default_factory=list, description="Meta-level observations about the content"
    )
    action_items: Optional[List[ActionItem]] = Field(
        default_factory=list, description="List of actionable next steps"
    )
    risks: Optional[List[Risk]] = Field(
        default_factory=list, description="List of risks or warnings mentioned"
    )
    context: Optional[ContentContext] = Field(
        default=None, description="Context to help readers navigate"
    )
    content_type: Optional[ContentClassification] = Field(
        None, description="Classification metadata if available"
    )
