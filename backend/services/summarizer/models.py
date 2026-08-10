"""
Pydantic models for the Summarizer service.

These models define the structured output schemas for content classification
and summary generation.
"""
import math
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, TypeAdapter, ValidationError, field_validator, model_validator


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


# -----------------------------------------------------------------------------
# V5 Knowledge UI blocks
# -----------------------------------------------------------------------------
# The model may choose a display intent, but the client only receives one of
# these validated data shapes. It never receives executable HTML, JSX, SVG, or
# chart configuration from the model.


class ComparisonTableRow(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    values: List[str] = Field(..., min_length=2, max_length=4)
    evidence: str = Field(..., min_length=1, max_length=500)


class ComparisonTableBlock(BaseModel):
    kind: Literal["comparison_table"]
    id: str = Field(..., min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=120)
    columns: List[str] = Field(..., min_length=2, max_length=4)
    rows: List[ComparisonTableRow] = Field(..., min_length=2, max_length=5)

    @model_validator(mode="after")
    def validate_row_widths(self):
        if any(len(row.values) != len(self.columns) for row in self.rows):
            raise ValueError("Comparison table rows must match the number of columns")
        return self


class BarChartValue(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    value: float
    evidence: str = Field(..., min_length=1, max_length=500)

    @field_validator("value")
    @classmethod
    def value_must_be_finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Chart value must be finite")
        if value < 0:
            raise ValueError("Chart value must be non-negative")
        return value


class BarChartBlock(BaseModel):
    kind: Literal["bar_chart"]
    id: str = Field(..., min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=120)
    unit: str = Field(..., min_length=1, max_length=32)
    values: List[BarChartValue] = Field(..., min_length=3, max_length=5)


class StepItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    detail: str = Field(..., min_length=1, max_length=500)
    evidence: str = Field(..., min_length=1, max_length=500)


class StepsBlock(BaseModel):
    kind: Literal["steps"]
    id: str = Field(..., min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=120)
    steps: List[StepItem] = Field(..., min_length=3, max_length=7)


KnowledgeUiBlock = Annotated[
    Union[ComparisonTableBlock, BarChartBlock, StepsBlock],
    Field(discriminator="kind"),
]
_knowledge_ui_block_adapter = TypeAdapter(KnowledgeUiBlock)


class SummaryResponseV5(SummaryResponseV4):
    """V5 summary with a small, validated set of optional knowledge UI blocks."""

    version: int = Field(default=5)
    ui_blocks: List[KnowledgeUiBlock] = Field(default_factory=list, max_length=2)

    @field_validator("ui_blocks", mode="before")
    @classmethod
    def drop_invalid_ui_blocks(cls, value: Any) -> List[Dict[str, Any]]:
        if not isinstance(value, list):
            return []

        valid_blocks: List[Dict[str, Any]] = []
        for candidate in value[:2]:
            try:
                valid_blocks.append(_knowledge_ui_block_adapter.validate_python(candidate).model_dump())
            except ValidationError:
                continue
        return valid_blocks

    @field_validator("ui_blocks")
    @classmethod
    def keep_one_block_per_kind(cls, blocks: List[KnowledgeUiBlock]) -> List[KnowledgeUiBlock]:
        seen_kinds = set()
        unique_blocks: List[KnowledgeUiBlock] = []
        for block in blocks:
            if block.kind in seen_kinds:
                continue
            seen_kinds.add(block.kind)
            unique_blocks.append(block)
        return unique_blocks


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
