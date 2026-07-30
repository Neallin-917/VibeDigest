from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, TYPE_CHECKING
from urllib.parse import urlparse

from services.supadata_client import SupadataClient
from services.video_processor import VideoProcessor
from utils.url import normalize_video_url

from .schemas import ProviderAttempt, TranscriptSegment, VideoContext, VideoIntakeOptions

if TYPE_CHECKING:
    from services.transcriber import Transcriber


def _platform_for_url(url: str) -> str:
    host = (urlparse(url).hostname or "").lower().replace("www.", "")
    if "youtube.com" in host or "youtu.be" in host:
        return "youtube"
    if host.endswith("bilibili.com"):
        return "bilibili"
    if host.endswith("xiaoyuzhoufm.com"):
        return "xiaoyuzhou"
    if host.endswith("apple.com"):
        return "apple_podcasts"
    return host or "unknown"


def _source_quality(source: str) -> str:
    if source == "supadata":
        return "provider"
    if source == "vtt":
        return "caption"
    if source == "asr":
        return "asr"
    return "missing"


def _format_time(seconds: float) -> str:
    total = max(int(seconds), 0)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _segments_to_markdown(segments: Iterable[TranscriptSegment]) -> str:
    parts: List[str] = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        parts.append(f"**[{_format_time(segment.start)}]**")
        parts.append("")
        parts.append(text)
        parts.append("")
    return "\n".join(parts).strip()


def _segments_to_plain_text(segments: Iterable[TranscriptSegment]) -> str:
    return "\n".join(segment.text.strip() for segment in segments if segment.text.strip())


def _coerce_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _segments_from_raw_json(raw_json: Optional[str]) -> List[TranscriptSegment]:
    if not raw_json:
        return []

    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError:
        return []

    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        return []

    segments: List[TranscriptSegment] = []
    for item in raw_segments:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        start = _coerce_float(item.get("start"))
        end = _coerce_float(item.get("end"), start + _coerce_float(item.get("duration")))
        if end < start:
            end = start
        segments.append(TranscriptSegment(start=start, end=end, text=text))
    return segments


class VideoIntakeGateway:
    """Credential-aware video context extraction without task/database coupling."""

    def __init__(
        self,
        *,
        supadata_client: Optional[SupadataClient] = None,
        video_processor: Optional[VideoProcessor] = None,
        transcriber: Optional["Transcriber"] = None,
        temp_dir: Optional[Path] = None,
    ) -> None:
        self.supadata_client = supadata_client or SupadataClient()
        self.video_processor = video_processor or VideoProcessor()
        self.transcriber = transcriber
        self.temp_dir = temp_dir or Path(os.getenv("VIBEDIGEST_INTAKE_TEMP_DIR", "temp/video-intake"))

    def _get_transcriber(self) -> "Transcriber":
        if self.transcriber is None:
            from services.transcriber import Transcriber

            self.transcriber = Transcriber()
        return self.transcriber

    async def get_video_context(
        self,
        options: VideoIntakeOptions,
    ) -> VideoContext:
        normalized_url = normalize_video_url(options.url)
        if not normalized_url:
            raise ValueError("A valid video URL is required.")

        platform = _platform_for_url(normalized_url)
        attempts: List[ProviderAttempt] = []
        warnings: List[str] = []
        errors: List[str] = []

        metadata = await self._extract_metadata(normalized_url, attempts, warnings)
        source, markdown, raw_json, language = await self._extract_transcript(
            normalized_url=normalized_url,
            platform=platform,
            allow_asr=options.allow_asr,
            attempts=attempts,
            errors=errors,
        )

        segments = _segments_from_raw_json(raw_json)
        if not markdown and segments:
            markdown = _segments_to_markdown(segments)

        status = "completed" if segments or markdown else "failed"
        if metadata and status == "failed":
            status = "partial"

        if not options.allow_asr and status != "completed":
            warnings.append(
                "ASR fallback was not attempted. Re-run with allow_asr=true if a full audio transcription is acceptable."
            )

        return VideoContext(
            url=options.url,
            normalized_url=normalized_url,
            platform=platform,
            status=status,
            source=source,
            quality=_source_quality(source),
            metadata=metadata,
            language=language or "unknown",
            transcript=segments,
            markdown=markdown or "",
            plain_text=_segments_to_plain_text(segments),
            warnings=warnings,
            errors=errors,
            attempts=attempts,
        )

    async def _extract_metadata(
        self,
        normalized_url: str,
        attempts: List[ProviderAttempt],
        warnings: List[str],
    ) -> Dict[str, Any]:
        try:
            metadata = await self.video_processor.extract_info_only(normalized_url)
            attempts.append(ProviderAttempt("metadata", "success"))
            return {
                "title": metadata.get("title") or "Unknown",
                "thumbnail": metadata.get("thumbnail"),
                "duration_seconds": metadata.get("duration"),
                "author": metadata.get("author"),
                "author_url": metadata.get("author_url"),
                "audio_url_available": bool(metadata.get("audio_url")),
            }
        except Exception as exc:
            message = f"Metadata extraction failed: {exc}"
            attempts.append(ProviderAttempt("metadata", "failed", message))
            warnings.append(message)
            return {}

    async def _extract_transcript(
        self,
        *,
        normalized_url: str,
        platform: str,
        allow_asr: bool,
        attempts: List[ProviderAttempt],
        errors: List[str],
    ) -> Tuple[str, str, Optional[str], str]:
        if platform == "youtube":
            supadata = await self._try_supadata(normalized_url, attempts)
            if supadata:
                return supadata

            vtt = await self._try_vtt(normalized_url, attempts)
            if vtt:
                return vtt
        else:
            attempts.append(
                ProviderAttempt(
                    "supadata",
                    "skipped",
                    "Supadata transcript provider is currently only used for YouTube URLs.",
                )
            )
            attempts.append(
                ProviderAttempt(
                    "vtt",
                    "skipped",
                    "Direct caption extraction is currently only enabled for YouTube URLs.",
                )
            )

        if allow_asr:
            asr = await self._try_asr(normalized_url, attempts)
            if asr:
                return asr
        else:
            attempts.append(ProviderAttempt("asr", "skipped", "allow_asr=false"))

        errors.append("No transcript source returned usable content.")
        return "none", "", None, "unknown"

    async def _try_supadata(
        self,
        normalized_url: str,
        attempts: List[ProviderAttempt],
    ) -> Optional[Tuple[str, str, Optional[str], str]]:
        try:
            markdown, raw_json, language = await self.supadata_client.get_transcript_async(normalized_url)
        except Exception as exc:
            attempts.append(ProviderAttempt("supadata", "failed", str(exc)))
            return None

        if markdown and raw_json:
            attempts.append(ProviderAttempt("supadata", "success"))
            return "supadata", markdown, raw_json, language or "unknown"

        message = self.supadata_client.last_error or "Supadata returned no transcript."
        attempts.append(ProviderAttempt("supadata", "failed", message))
        return None

    async def _try_vtt(
        self,
        normalized_url: str,
        attempts: List[ProviderAttempt],
    ) -> Optional[Tuple[str, str, Optional[str], str]]:
        try:
            result = await self.video_processor.extract_captions(normalized_url)
        except Exception as exc:
            attempts.append(ProviderAttempt("vtt", "failed", str(exc)))
            return None

        if not result:
            attempts.append(ProviderAttempt("vtt", "failed", "No caption file was available."))
            return None

        markdown, raw_json, language = result
        if markdown and raw_json:
            attempts.append(ProviderAttempt("vtt", "success"))
            return "vtt", markdown, raw_json, language or "unknown"

        attempts.append(ProviderAttempt("vtt", "failed", "Caption extraction returned an empty transcript."))
        return None

    async def _try_asr(
        self,
        normalized_url: str,
        attempts: List[ProviderAttempt],
    ) -> Optional[Tuple[str, str, Optional[str], str]]:
        try:
            self.temp_dir.mkdir(parents=True, exist_ok=True)
            audio_path, _, _, _, _ = await self.video_processor.download_and_convert(
                normalized_url,
                self.temp_dir,
            )
            markdown, raw_json, language = await self._get_transcriber().transcribe_with_raw(audio_path)
        except Exception as exc:
            attempts.append(ProviderAttempt("asr", "failed", str(exc)))
            return None

        if markdown and raw_json:
            attempts.append(ProviderAttempt("asr", "success"))
            return "asr", markdown, raw_json, language or "unknown"

        attempts.append(ProviderAttempt("asr", "failed", "ASR returned an empty transcript."))
        return None
