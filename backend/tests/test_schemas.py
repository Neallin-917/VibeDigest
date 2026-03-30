"""Tests for Pydantic schemas."""

import pytest
from datetime import datetime
from pydantic import ValidationError

from schemas.api import (
    TaskCreateResponse,
    TaskStatusResponse,
    VideoPreviewResponse,
    TaskOutputResponse,
    RetryOutputResponse,
    ErrorResponse,
)
from constants import TaskStatus, OutputKind


class TestTaskCreateResponse:
    """Tests for TaskCreateResponse schema."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = TaskCreateResponse(
            task_id="task-123",
            message="Task started",
        )
        assert response.task_id == "task-123"


class TestTaskStatusResponse:
    """Tests for TaskStatusResponse schema."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = TaskStatusResponse(
            id="task-123",
            video_url="https://youtube.com/watch?v=abc",
            status=TaskStatus.PROCESSING,
            progress=50,
            created_at=datetime.utcnow(),
        )
        assert response.id == "task-123"
        assert response.progress == 50

    def test_optional_fields(self):
        """Test optional fields."""
        response = TaskStatusResponse(
            id="t1",
            video_url="https://example.com/video",
            status=TaskStatus.PENDING,
            created_at=datetime.utcnow(),
        )
        assert response.video_title is None
        assert response.error is None
        assert response.duration is None


class TestVideoPreviewResponse:
    """Tests for VideoPreviewResponse schema."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = VideoPreviewResponse(
            title="Test Video",
            thumbnail="https://example.com/thumb.jpg",
            duration=300.0,
            author="Test Author",
            url="https://youtube.com/watch?v=123",
        )
        assert response.title == "Test Video"
        assert response.duration == 300.0

    def test_defaults(self):
        """Test default values."""
        response = VideoPreviewResponse(
            title="Video",
            url="https://example.com",
        )
        assert response.thumbnail == ""
        assert response.duration == 0
        assert response.author == "Unknown"


class TestTaskOutputResponse:
    """Tests for TaskOutputResponse schema."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = TaskOutputResponse(
            id="out-123",
            task_id="task-456",
            kind=OutputKind.SUMMARY,
            status=TaskStatus.COMPLETED,
            content='{"overview": "test"}',
            locale="en",
            progress=100,
            created_at=datetime.utcnow(),
        )
        assert response.kind == OutputKind.SUMMARY
        assert response.progress == 100


class TestRetryOutputResponse:
    """Tests for RetryOutputResponse schema."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = RetryOutputResponse(
            message="Retry queued",
            output_id="out-123",
        )
        assert response.message == "Retry queued"


class TestErrorResponse:
    """Tests for ErrorResponse schema."""

    def test_valid_response(self):
        """Test creating a valid response."""
        response = ErrorResponse(
            detail="Something went wrong",
            error_code="INTERNAL_ERROR",
        )
        assert response.detail == "Something went wrong"
