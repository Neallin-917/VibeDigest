import os
import logging
import json
import asyncio
import httpx
from typing import Optional, Tuple, Dict, List

from services.key_rotator import ApiKeyRotator

logger = logging.getLogger(__name__)


class SupadataClient:
    """
    Client for Supadata.ai API to fetch YouTube transcripts.
    Supports multiple API keys with automatic round-robin rotation.
    """

    BASE_URL = "https://api.supadata.ai/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
    ):
        self.last_error: Optional[str] = None
        keys = self._resolve_keys(api_key=api_key, api_keys=api_keys)
        if keys:
            self.rotator: Optional[ApiKeyRotator] = ApiKeyRotator(keys)
            # Keep api_key for backward compatibility (used by _get_headers
            # when rotator is present, this is the "current" key)
            self.api_key = keys[0]
        else:
            self.rotator = None
            self.api_key = None

    @staticmethod
    def _resolve_keys(
        api_key: Optional[str] = None,
        api_keys: Optional[List[str]] = None,
    ) -> List[str]:
        """Resolve API keys from explicit args or environment variables.

        Priority:
        1. Explicit api_keys list
        2. Explicit api_key string (supports comma-separated)
        3. SUPADATA_API_KEY env var (supports comma-separated)
        """
        if api_keys:
            return [k.strip() for k in api_keys if k.strip()]

        raw = api_key or os.getenv("SUPADATA_API_KEY", "")
        if raw and raw.strip():
            parsed = [k.strip() for k in raw.split(",") if k.strip()]
            if parsed:
                return parsed

        return []

    def _get_headers(self, key: Optional[str] = None) -> Dict[str, str]:
        active_key = key or self.api_key
        if not active_key:
            raise ValueError("SUPADATA_API_KEY not found in environment variables.")
        return {"x-api-key": active_key, "Content-Type": "application/json"}

    def get_transcript(
        self, video_url: str, lang: str = "en"
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Fetch transcript for a given video URL.

        Args:
            video_url: YouTube video URL.
            lang: Preferred language code (default 'en').
                  Supadata 'auto' mode often works best, but we can pass lang if needed.
                  Actually, Supadata docs say 'text' or 'json' response.
                  We want JSON segments.

        Returns:
            Tuple containing:
            - markdown_text: Formatted markdown string (compatible with our system).
            - raw_json_payload: JSON string of the segments (compatible with our system).
            - detected_language: Language code detected/returned.

            Returns (None, None, None) if supadate fails/unavailable (caller should fallback).
        """
        if not self.rotator:
            logger.warning("Supadata API key not configured. Skipping.")
            return None, None, None

        logger.info(f"Fetching transcript from Supadata for {video_url}")

        try:
            pass
        except Exception:
            pass

        return None, None, None

    async def get_transcript_async(
        self, video_url: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Async version to fetch transcript."""
        self.last_error = None
        if not self.rotator:
            self.last_error = "Supadata API key not configured"
            logger.warning("Supadata API key not configured. Skipping.")
            return None, None, None

        url = f"{self.BASE_URL}/transcript"
        params = {"url": video_url, "text": "false", "mode": "auto"}

        max_attempts = len(self.rotator._keys)

        async with httpx.AsyncClient(timeout=60.0) as client:
            for attempt in range(max_attempts):
                try:
                    current_key = self.rotator.get_key()
                except RuntimeError:
                    self.last_error = "Supadata API rate-limited (429)"
                    logger.warning("All Supadata API keys are rate-limited.")
                    return None, None, None

                try:
                    logger.info(f"Calling Supadata API for: {video_url} (attempt {attempt + 1}/{max_attempts})")
                    resp = await client.get(
                        url, headers=self._get_headers(key=current_key), params=params
                    )

                    if resp.status_code == 429:
                        self.last_error = "Supadata API rate-limited (429)"
                        logger.warning(
                            "Supadata API key rate-limited (429). Rotating key."
                        )
                        self.rotator.report_rate_limited(current_key)
                        continue

                    if resp.status_code not in (200, 201, 202):
                        self.last_error = f"Supadata API error {resp.status_code}"
                        logger.warning(
                            f"Supadata API error {resp.status_code}: {resp.text}"
                        )
                        return None, None, None

                    data = resp.json()
                    logger.info(f"Supadata raw response keys: {list(data.keys())}")

                    # Check if it's a Job ID (async processing) or direct result
                    if "jobId" in data:
                        job_id = data["jobId"]
                        logger.info(f"Supadata returned Job ID {job_id}, polling...")
                        data = await self._poll_job(client, job_id)
                        if not data:
                            if not self.last_error:
                                self.last_error = f"Supadata transcript job {job_id} did not complete"
                            return None, None, None

                    content = data.get("content")
                    if not content or not isinstance(content, list):
                        self.last_error = "Supadata returned no transcript segments"
                        logger.warning(
                            "Supadata returned invalid content format (expected list of segments)."
                        )
                        return None, None, None

                    detected_lang = data.get("lang", "unknown")

                    # Convert to OpenAI-compatible segments
                    openai_segments = []
                    for seg in content:
                        offset_ms = seg.get("offset", 0)
                        duration_ms = seg.get("duration", 0)
                        text = seg.get("text", "")
                        start_s = offset_ms / 1000.0
                        end_s = (offset_ms + duration_ms) / 1000.0
                        openai_segments.append(
                            {"start": start_s, "end": end_s, "text": text}
                        )

                    # Merge small segments into sentence-like chunks
                    merged_segments = []
                    current_chunk = {"start": 0.0, "end": 0.0, "text": ""}
                    current_parts: List[str] = []

                    is_cjk = detected_lang in [
                        "zh", "zh-CN", "zh-TW",
                        "ja", "ja-JP",
                        "ko", "ko-KR",
                        "chinese", "japanese", "korean",
                    ]

                    for i, seg in enumerate(openai_segments):
                        text = seg["text"]
                        start = seg["start"]
                        end = seg["end"]

                        if is_cjk:
                            text = text.replace(" ", "")

                        if not current_parts:
                            current_chunk["start"] = start

                        current_parts.append(text)
                        current_chunk["end"] = end

                        join_char = "" if is_cjk else " "
                        if not is_cjk:
                            current_parts = [p.strip() for p in current_parts]

                        joined_text = join_char.join(current_parts).strip()
                        duration = end - current_chunk["start"]

                        is_punctuation = (
                            text.strip() and text.strip()[-1] in ".!?。！？"
                        )
                        is_long_duration = duration > 5.0
                        is_long_text = len(joined_text) > 50

                        if (
                            is_punctuation
                            or (is_long_duration and len(joined_text) > 20)
                            or is_long_text
                        ):
                            merged_segments.append(
                                {
                                    "start": current_chunk["start"],
                                    "end": end,
                                    "text": joined_text,
                                }
                            )
                            current_parts = []
                            current_chunk = {"start": 0.0, "end": 0.0, "text": ""}

                    # Flush remaining
                    if current_parts:
                        join_char = "" if is_cjk else " "
                        if not is_cjk:
                            current_parts = [p.strip() for p in current_parts]
                        merged_segments.append(
                            {
                                "start": current_chunk["start"],
                                "end": current_chunk["end"],
                                "text": join_char.join(current_parts).strip(),
                            }
                        )

                    final_segments = []
                    for s in merged_segments:
                        final_segments.append(
                            {
                                "start": s["start"],
                                "end": s["end"],
                                "duration": s["end"] - s["start"],
                                "text": s["text"],
                            }
                        )

                    raw_payload = {
                        "version": 1,
                        "model": "supadata-auto",
                        "language": detected_lang,
                        "segments": final_segments,
                    }
                    raw_json = json.dumps(raw_payload, ensure_ascii=False)

                    from .transcriber import format_markdown_from_raw_segments

                    markdown_text = format_markdown_from_raw_segments(
                        final_segments, detected_language=detected_lang
                    )

                    # Validation: Check for known demo/mock content
                    if (
                        "Adaptive Learning Framework" in markdown_text
                        or "ALF" in markdown_text
                    ):
                        self.last_error = "Supadata returned placeholder transcript content"
                        logger.warning(
                            "Supadata returned generic demo/mock content (Adaptive Learning Framework). Treating as failure to force fallback."
                        )
                        return None, None, None

                    # Log content preview for debugging
                    preview = (
                        markdown_text[:200]
                        if len(markdown_text) > 200
                        else markdown_text
                    )
                    logger.info(
                        f"Supadata transcript preview ({len(final_segments)} segments, lang={detected_lang}): {preview}"
                    )

                    return markdown_text, raw_json, detected_lang

                except Exception as e:
                    self.last_error = str(e)
                    logger.error(f"Supadata request failed: {e}")
                    return None, None, None

            # All attempts exhausted (all keys returned 429)
            self.last_error = "Supadata API rate-limited (429)"
            logger.warning("All Supadata API keys exhausted after retries.")
            return None, None, None

    async def _poll_job(
        self, client: httpx.AsyncClient, job_id: str, max_retries: int = 150
    ) -> Optional[Dict]:
        """
        Poll job status. Default 150 * 2s = 5 minutes timeout.
        """
        url = f"{self.BASE_URL}/transcript/{job_id}"

        for i in range(max_retries):
            try:
                await asyncio.sleep(2)  # Wait 2s
                resp = await client.get(url, headers=self._get_headers())
                if resp.status_code != 200:
                    self.last_error = f"Supadata polling error {resp.status_code}"
                    logger.warning(f"Poll check {i} failed: {resp.status_code}")
                    continue

                data = resp.json()
                status = data.get("status")

                if status == "completed":
                    self.last_error = None
                    return data
                elif status == "failed":
                    self.last_error = str(data.get("error") or "Supadata transcript job failed")
                    logger.error(f"Supadata job {job_id} failed: {data.get('error')}")
                    return None
                else:
                    if i % 5 == 0:
                        logger.info(
                            f"Job {job_id} status: {status} (attempt {i}/{max_retries})"
                        )

                # Continue polling
            except Exception as e:
                self.last_error = str(e)
                logger.warning(f"Polling error: {e}")

        self.last_error = f"Supadata job {job_id} timed out"
        logger.warning(
            f"Supadata job {job_id} timed out after {max_retries * 2} seconds."
        )
        return None
