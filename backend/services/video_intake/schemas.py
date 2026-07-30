from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

TranscriptSource = Literal["supadata", "vtt", "asr", "none"]
SourceQuality = Literal["provider", "caption", "asr", "missing"]
AttemptStatus = Literal["success", "failed", "skipped"]


@dataclass(frozen=True)
class TranscriptSegment:
    start: float
    end: float
    text: str

    @property
    def duration(self) -> float:
        return max(self.end - self.start, 0.0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "duration": self.duration,
            "text": self.text,
        }


@dataclass(frozen=True)
class ProviderAttempt:
    provider: str
    status: AttemptStatus
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        payload = {"provider": self.provider, "status": self.status}
        if self.message:
            payload["message"] = self.message
        return payload


@dataclass(frozen=True)
class VideoIntakeOptions:
    url: str
    language: Optional[str] = None
    strategy: str = "fastest_reliable"
    allow_asr: bool = False


@dataclass(frozen=True)
class VideoContext:
    url: str
    normalized_url: str
    platform: str
    status: Literal["completed", "partial", "failed"]
    source: TranscriptSource
    quality: SourceQuality
    metadata: Dict[str, Any] = field(default_factory=dict)
    language: str = "unknown"
    transcript: List[TranscriptSegment] = field(default_factory=list)
    markdown: str = ""
    plain_text: str = ""
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    attempts: List[ProviderAttempt] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "normalized_url": self.normalized_url,
            "platform": self.platform,
            "status": self.status,
            "source": self.source,
            "quality": self.quality,
            "metadata": self.metadata,
            "language": self.language,
            "transcript": [segment.to_dict() for segment in self.transcript],
            "markdown": self.markdown,
            "plain_text": self.plain_text,
            "warnings": self.warnings,
            "errors": self.errors,
            "attempts": [attempt.to_dict() for attempt in self.attempts],
        }
