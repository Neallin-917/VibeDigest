"""
API request and response schemas for VibeDigest endpoints.

These Pydantic models define the structure of API responses, enabling:
- Automatic validation and serialization
- OpenAPI documentation generation
- TypeScript type generation for frontend clients
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from constants import OutputKind, TaskStatus


class TaskCreateResponse(BaseModel):
    """Response from POST /api/tasks/process-video."""

    task_id: str = Field(..., description="Unique identifier for the created task")
    message: str = Field(..., description="Status message")


class TaskStatusResponse(BaseModel):
    """Task status information returned by status endpoints."""

    id: str = Field(..., description="Task ID")
    video_url: str = Field(..., description="Original video URL")
    video_title: Optional[str] = Field(None, description="Video title")
    thumbnail_url: Optional[str] = Field(None, description="Video thumbnail URL")
    status: TaskStatus = Field(..., description="Current task status")
    progress: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Processing progress percentage"
    )
    error: Optional[str] = Field(None, description="Error message if failed")
    created_at: datetime = Field(..., description="Task creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")

    # Video metadata
    duration: Optional[float] = Field(None, description="Video duration in seconds")
    author: Optional[str] = Field(None, description="Video author/channel name")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class TaskOutputResponse(BaseModel):
    """Individual task output response."""

    id: str = Field(..., description="Output ID")
    task_id: str = Field(..., description="Parent task ID")
    kind: OutputKind = Field(..., description="Output type")
    status: TaskStatus = Field(..., description="Output status")
    content: Optional[str] = Field(None, description="Output content")
    locale: Optional[str] = Field(None, description="Language/locale code")
    progress: int = Field(default=0, description="Processing progress")
    error: Optional[str] = Field(None, description="Error message if failed")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class TaskWithOutputsResponse(BaseModel):
    """Full task response including all outputs."""

    task: TaskStatusResponse = Field(..., description="Task information")
    outputs: List[TaskOutputResponse] = Field(
        default_factory=list,
        description="List of task outputs"
    )


class RetryOutputResponse(BaseModel):
    """Response from POST /api/tasks/retry-output."""

    message: str = Field(..., description="Status message")
    output_id: Optional[str] = Field(None, description="The output being retried")


class ErrorResponse(BaseModel):
    """Standard error response format."""

    detail: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Machine-readable error code")


class QuotaExceededResponse(BaseModel):
    """Response when user quota is exceeded."""

    detail: str = Field(
        default="Quota exceeded or insufficient credits. Please upgrade your plan.",
        description="Error message"
    )
    error_code: str = Field(default="QUOTA_EXCEEDED", description="Error code")
    remaining_credits: Optional[int] = Field(
        None,
        description="Remaining credits (if applicable)"
    )
