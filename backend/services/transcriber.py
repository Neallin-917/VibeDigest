import os
import logging
from typing import Optional, List, Any, Tuple
import json
import asyncio
from config import settings
from services.formatting import (
    _serialize_raw_segments,
    _merge_segments_into_sentences,
    _paragraph_limits_for_language,
    _group_sentences_into_paragraphs_v2,
    format_time,
)

logger = logging.getLogger(__name__)


class Transcriber:
    """Audio transcriber using the OpenAI API for speech-to-text."""

    def __init__(self, model_size: Optional[str] = None):
        """
        Initialize the transcriber.

        Args:
            model_size: OpenAI model name (defaults to config settings)
        """
        self.model_name = model_size or settings.OPENAI_TRANSCRIPTION_MODEL
        self.client: Any = None
        self.last_detected_language: Optional[str] = None

    def _init_client(self) -> None:
        """Lazy-init the OpenAI client (async)."""
        if self.client is None:
            # Import new factory
            from utils.openai_client import get_async_audio_client

            self.client = get_async_audio_client()
            if self.client:
                logger.info(
                    "OpenAI Async Client initialized (Transcriber - Audio Specialized)"
                )
            else:
                raise ValueError("未找到 OPENAI_API_KEY 环境变量")

    async def transcribe(self, audio_path: str, language: Optional[str] = None) -> str:
        """
        Transcribe an audio file.

        Args:
            audio_path: Audio file path
            language: Optional language hint (auto-detected if omitted)

        Returns:
            Transcript text (Markdown)
        """
        md, _, _ = await self.transcribe_with_raw(audio_path, language=language)
        return md

    async def transcribe_with_raw(
        self, audio_path: str, language: Optional[str] = None
    ) -> Tuple[str, str, str]:
        """
        Transcribe audio and also return a JSON payload of raw segments for future re-formatting.

        Returns:
            (markdown_text, raw_segments_json, detected_language)
        """
        try:
            # Check file exists
            if not os.path.exists(audio_path):
                raise Exception(f"音频文件不存在: {audio_path}")

            # Initialize client
            self._init_client()

            logger.info(f"开始使用 OpenAI (Async) 转录音频: {audio_path}")

            # Check file size (OpenAI limit ~25MB)
            file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            logger.info(f"文件大小: {file_size_mb:.2f} MB")

            files_to_transcribe = []
            is_chunked = False

            if file_size_mb > 24.0:  # Leave some headroom
                logger.info("文件超过25MB，开始分片处理...")
                is_chunked = True
                files_to_transcribe = await self._split_audio(audio_path)
            else:
                files_to_transcribe = [
                    (audio_path, 0.0)
                ]  # tuple of (path, start_offset)

            all_segments = []
            detected_language = "unknown"

            try:
                for chunk_path, offset in files_to_transcribe:
                    logger.info(f"正在转录分片: {chunk_path} (偏移: {offset}s)")

                    # Native Async Call
                    with open(chunk_path, "rb") as audio_file:
                        transcript = await self.client.audio.transcriptions.create(
                            model=self.model_name,
                            file=audio_file,
                            language=language,
                            response_format="verbose_json",
                        )

                    # Record language detection result from first chunk
                    if offset == 0.0:
                        detected_language = getattr(
                            transcript, "language", "unknown"
                        )
                        self.last_detected_language = detected_language

                    # Offset timestamps and merge
                    for segment in transcript.segments:
                        segment.start += offset
                        segment.end += offset
                        all_segments.append(segment)

            finally:
                # Clean up temporary chunk files
                if is_chunked:
                    for chunk_path, _ in files_to_transcribe:
                        try:
                            if os.path.exists(chunk_path):
                                os.remove(chunk_path)
                        except Exception as e:
                            logger.warning(f"清理临时文件失败 {chunk_path}: {e}")

            logger.info(f"检测到的语言: {detected_language}")

            raw_payload = {
                "version": 1,
                "model": self.model_name,
                "language": detected_language,
                "segments": _serialize_raw_segments(all_segments),
            }
            raw_json = json.dumps(raw_payload, ensure_ascii=False)

            # Assemble transcript output
            transcript_lines = []

            sentences = _merge_segments_into_sentences(all_segments)
            max_chars, max_dur = _paragraph_limits_for_language(detected_language)
            paragraphs = _group_sentences_into_paragraphs_v2(
                sentences,
                max_chars=max_chars,
                gap_seconds=2.0,
                max_duration_seconds=max_dur,
            )

            for para in paragraphs:
                start_time = self.format_time(float(para["start"]))
                transcript_lines.append(f"**[{start_time}]**")
                transcript_lines.append("")
                transcript_lines.append(para["text"])
                transcript_lines.append("")

            transcript_text = "\n".join(transcript_lines)

            logger.info("转录完成")

            return transcript_text, raw_json, detected_language

        except Exception as e:
            logger.error(f"转录失败: {str(e)}")
            raise Exception(f"转录失败: {str(e)}")

    async def _split_audio(
        self, audio_path: str, chunk_length_ms: int = 10 * 60 * 1000
    ) -> List[Tuple[str, float]]:
        """
        Split audio into smaller chunks using pydub.
        """
        from pydub import AudioSegment

        def _do_split() -> List[Tuple[str, float]]:
            try:
                # pydub depends on ffmpeg; the container image installs it.
                audio = AudioSegment.from_file(audio_path)
                duration_ms = len(audio)
                chunks: List[Tuple[str, float]] = []

                base_name = os.path.splitext(audio_path)[0]

                for i, start_ms in enumerate(range(0, duration_ms, chunk_length_ms)):
                    end_ms = min(start_ms + chunk_length_ms, duration_ms)
                    chunk = audio[start_ms:end_ms]

                    chunk_filename = f"{base_name}_part{i}.mp3"
                    # Export as mp3 to reduce size
                    chunk.export(chunk_filename, format="mp3")

                    chunks.append((chunk_filename, start_ms / 1000.0))

                return chunks
            except Exception as e:
                logger.error(f"音频切片失败: {e}")
                raise e

        return await asyncio.to_thread(_do_split)

    @staticmethod
    def format_time(seconds: float) -> str:
        """
        Convert seconds to MM:SS or HH:MM:SS.
        """
        return format_time(seconds)

    def get_supported_languages(self) -> List[str]:
        """
        Return supported languages (common OpenAI Whisper languages).
        """
        return [
            "zh",
            "en",
            "ja",
            "ko",
            "es",
            "fr",
            "de",
            "it",
            "pt",
            "ru",
            "ar",
            "hi",
            "th",
            "vi",
            "tr",
            "pl",
            "nl",
            "sv",
            "da",
            "no",
        ]

    def get_detected_language(
        self, transcript_text: Optional[str] = None
    ) -> Optional[str]:
        """
        Return the last detected language.
        """
        if self.last_detected_language:
            return self.last_detected_language

        if transcript_text and "**Detected Language:**" in transcript_text:
            lines = transcript_text.split("\n")
            for line in lines:
                if "**Detected Language:**" in line:
                    lang = line.split(":")[-1].strip()
                    return lang

        return None
