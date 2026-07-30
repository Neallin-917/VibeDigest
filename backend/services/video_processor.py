import os
import asyncio
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import json

logger = logging.getLogger(__name__)


class VideoProcessor:
    """Video processor using yt-dlp to download and convert media."""

    def __init__(self):
        # Lazy import for test environments to avoid heavy deps at import time.
        # A conservative browser UA helps with providers that block default agents.
        self._default_user_agent = os.getenv(
            "YTDLP_USER_AGENT",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36",
        )
        self._cookie_file = os.getenv("YTDLP_COOKIE_FILE", "").strip()
        self._proxy = os.getenv("YTDLP_PROXY", "").strip()
        # Defensive: Filter out invalid proxy strings that might come from misconfigured envs
        if self._proxy.lower() in ("undefined", "null", "none", "false"):
            self._proxy = ""

        self.ydl_opts = {
            "format": "bestaudio/best",  # Prefer best-available audio stream
            "outtmpl": "%(title)s.%(ext)s",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    # Convert to mono 16kHz during extraction (smaller and stable)
                    "preferredcodec": "m4a",
                    "preferredquality": "192",
                }
            ],
            # Global FFmpeg args: mono + 16kHz sample rate + faststart
            "postprocessor_args": [
                "-ac",
                "1",
                "-ar",
                "16000",
                "-movflags",
                "+faststart",
            ],
            "prefer_ffmpeg": True,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,  # Force single video download (no playlists)
        }

    def _ydl_overrides(self) -> Dict[str, str]:
        overrides = {}
        if self._cookie_file:
            overrides["cookiefile"] = self._cookie_file
        if self._proxy:
            overrides["proxy"] = self._proxy
        return overrides

    def _build_http_headers(self, url: str) -> Dict[str, str]:
        """
        Build best-effort headers to reduce 403/anti-bot blocks.
        For Bilibili, optionally inject cookies via env:
        - BILIBILI_COOKIE: full Cookie header string
        - BILIBILI_SESSDATA: value for SESSDATA cookie (common)
        """
        headers = {
            "User-Agent": self._default_user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        try:
            host = (urlparse(url).hostname or "").lower().replace("www.", "")
        except Exception:
            host = ""

        if host.endswith("bilibili.com"):
            headers["Referer"] = "https://www.bilibili.com/"
            headers["Origin"] = "https://www.bilibili.com"
            # Add modern browser headers to pass WAF/412 checks
            headers["Sec-Fetch-Mode"] = "navigate"
            headers["Sec-Fetch-Site"] = "none"
            headers["Sec-Fetch-User"] = "?1"
            headers["Sec-Fetch-Dest"] = "document"
            headers["Upgrade-Insecure-Requests"] = "1"

            cookie = os.getenv("BILIBILI_COOKIE", "").strip()
            sessdata = os.getenv("BILIBILI_SESSDATA", "").strip()
            if cookie:
                headers["Cookie"] = cookie
            elif sessdata:
                # Minimal cookie; many public videos work with just SESSDATA when required.
                headers["Cookie"] = f"SESSDATA={sessdata}"

        # Apple Podcasts work best with Googlebot UA to ensure server-side rendering of data
        if "podcasts.apple.com" in url:
            headers["User-Agent"] = (
                "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
            )

        return headers

    def _is_xiaoyuzhou_url(self, url: str) -> bool:
        try:
            host = (urlparse(url).hostname or "").replace("www.", "")
            return host.endswith("xiaoyuzhoufm.com")
        except Exception:
            return False

    def _fetch_og_image(
        self, page_url: str, timeout_seconds: float = 8.0
    ) -> Optional[str]:
        """
        Fetch episode page HTML and extract og:image.
        Best-effort, used only for xiaoyuzhou episode pages.
        """
        try:
            req = Request(
                page_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; VibeDigest/1.0)",
                    "Accept": "text/html,application/xhtml+xml",
                },
                method="GET",
            )
            with urlopen(req, timeout=timeout_seconds) as resp:
                raw = resp.read(1024 * 1024)  # cap 1MB
            html = raw.decode("utf-8", errors="ignore")

            m = re.search(
                r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
                html,
                flags=re.IGNORECASE,
            )
            if m:
                return m.group(1).strip()

            m = re.search(
                r'<meta[^>]+name=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
                html,
                flags=re.IGNORECASE,
            )
            if m:
                return m.group(1).strip()

            return None
        except (HTTPError, URLError, TimeoutError) as e:
            logger.warning(f"获取 og:image 失败（非致命）: {e}")
            return None
        except Exception as e:
            logger.warning(f"解析 og:image 失败（非致命）: {e}")
            return None

    def _fetch_xiaoyuzhou_episode_cover(
        self, page_url: str, timeout_seconds: float = 8.0
    ) -> Optional[str]:
        # Deprecated wrapper for backward compatibility if needed, but we will replace usages
        m = self._fetch_xiaoyuzhou_metadata(page_url, timeout_seconds)
        return m.get("thumbnail")

    def _fetch_xiaoyuzhou_metadata(
        self, page_url: str, timeout_seconds: float = 8.0
    ) -> Dict[str, Any]:
        """
        Xiaoyuzhou episode pages embed richer data in __NEXT_DATA__.
        Returns dict with keys: author (podcast title), thumbnail, etc.
        """
        metadata: Dict[str, Any] = {}
        try:
            req = Request(
                page_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; VibeDigest/1.0)",
                    "Accept": "text/html,application/xhtml+xml",
                },
                method="GET",
            )
            with urlopen(req, timeout=timeout_seconds) as resp:
                raw = resp.read(1024 * 1024)  # cap 1MB
            html = raw.decode("utf-8", errors="ignore")

            m = re.search(
                r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                html,
                flags=re.IGNORECASE | re.DOTALL,
            )
            if not m:
                return {}

            data = json.loads(m.group(1))
            props = (data.get("props") or {}).get("pageProps", {})
            episode = props.get("episode", {})
            podcast = episode.get("podcast", {})

            # Author / Podcast Title
            if podcast and isinstance(podcast, dict):
                metadata["author"] = podcast.get("title")
                metadata["author_url"] = (
                    f"https://www.xiaoyuzhoufm.com/podcast/{podcast.get('pid')}"
                    if podcast.get("pid")
                    else ""
                )
                # Podcast Cover (Author Image)
                p_image = (
                    (podcast.get("image") or {}) if isinstance(podcast, dict) else {}
                )
                for k in ("picUrl", "largePicUrl", "middlePicUrl", "thumbnailUrl"):
                    v = p_image.get(k)
                    if isinstance(v, str) and v:
                        metadata["author_image"] = v
                        break

            # Episode Thumbnail
            image = (episode.get("image") or {}) if isinstance(episode, dict) else {}
            # Prefer largest, fall back
            for k in (
                "largePicUrl",
                "middlePicUrl",
                "smallPicUrl",
                "picUrl",
                "thumbnailUrl",
            ):
                v = image.get(k)
                if isinstance(v, str) and v:
                    metadata["thumbnail"] = v
                    break

            return metadata
        except Exception as e:
            logger.warning(f"解析 xiaoyuzhou metadata 失败（非致命）: {e}")
            return {}

    def _fetch_apple_metadata(
        self, page_url: str, timeout_seconds: float = 8.0
    ) -> Dict[str, Any]:
        """
        Apple Podcast pages often have the author in meta tags or specific classes
        that yt-dlp might miss for direct audio links.
        """
        metadata: Dict[str, Any] = {}
        try:
            # Basic regex fallback because importing lxml/bs4 might be overkill if not already there
            req = Request(page_url, headers={"User-Agent": "Mozilla/5.0"}, method="GET")
            with urlopen(req, timeout=timeout_seconds) as resp:
                html = resp.read(1024 * 1024).decode("utf-8", errors="ignore")

            # Extract Author (Artist)
            # <span class="product-header__identity ..."> ... <a ...>Artist Name</a> ... </span>
            # Or more simply, looking for specific property meta tags
            # <meta property="og:title" content="Episode Title" />
            # Apple often puts "Podcast Name" in apple-itunes-app banner or similar, but generic OpenGraph is safer.
            # Actually, simpler: verify "music-link" or "podcast-header".

            # Attempt to find "artistName" in JSON-LD usually present
            m_json = re.search(
                r'<script type="application/ld\+json">\s*({.*?})\s*</script>',
                html,
                re.DOTALL,
            )
            if m_json:
                try:
                    data = json.loads(m_json.group(1))
                    # data can be a list or dict
                    if isinstance(data, dict):
                        # usually @graph or direct
                        if "author" in data and isinstance(data["author"], dict):
                            metadata["author"] = data["author"].get("name")
                        if "image" in data:
                            metadata["author_image"] = data["image"]
                except Exception:
                    pass

            if not metadata.get("author"):
                # Fallback regex for "podcast-header__identity" which usually contains the Author link
                # <span class="product-header__identity podcast-header__identity"> by <a ...>The Daily</a> </span>
                m_author = re.search(
                    r"podcast-header__identity[^>]*>.*?<a[^>]*>(.*?)</a>",
                    html,
                    re.DOTALL | re.IGNORECASE,
                )
                if m_author:
                    metadata["author"] = m_author.group(1).strip()

            return metadata
        except Exception:
            return {}

    def _fetch_bilibili_avatar(self, mid: str) -> Optional[str]:
        """
        Fetch Bilibili user avatar using their MID (Uploader ID).
        API: https://api.bilibili.com/x/space/acc/info?mid={mid}
        """
        if not mid:
            return None
        try:
            api_url = f"https://api.bilibili.com/x/space/acc/info?mid={mid}"
            # Use a standard browser UA and Referer to avoid -799/403
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://space.bilibili.com/",
                "Origin": "https://space.bilibili.com",
            }
            req = Request(api_url, headers=headers, method="GET")
            with urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            # Response: { code: 0, data: { face: "url", ... } }
            if data.get("code") == 0:
                return data.get("data", {}).get("face")
        except Exception as e:
            logger.warning(f"Failed to fetch Bilibili avatar for mid={mid}: {e}")
        return None

    def _enrich_metadata(self, url: str, info: Dict[str, Any]) -> None:
        """
        Enrich yt-dlp info dict with platform-specific extractions.
        Modifies info in-place.
        """
        if self._is_xiaoyuzhou_url(url):
            self._enrich_xiaoyuzhou(url, info)
        elif "podcasts.apple.com" in url:
            self._enrich_apple(url, info)
        elif "bilibili" in url:
            self._enrich_bilibili(url, info)

    def _enrich_xiaoyuzhou(self, url: str, info: Dict[str, Any]) -> None:
        """Enrich Xiaoyuzhou metadata."""
        xyz_meta = self._fetch_xiaoyuzhou_metadata(url)

        # Thumbnail hierarchy: API > og:image
        if xyz_meta.get("thumbnail"):
            info["thumbnail"] = xyz_meta.get("thumbnail")
        elif not info.get("thumbnail"):
            og_image = self._fetch_og_image(url)
            if og_image:
                info["thumbnail"] = og_image

        # Author info
        if xyz_meta.get("author"):
            info["uploader"] = xyz_meta.get("author")
            info["uploader_id"] = xyz_meta.get("author")  # Fallback ID
        if xyz_meta.get("author_image"):
            info["uploader_avatar"] = xyz_meta.get("author_image")
        if xyz_meta.get("author_url"):
            info["uploader_url"] = xyz_meta.get("author_url")

    def _enrich_apple(self, url: str, info: Dict[str, Any]) -> None:
        """Enrich Apple Podcasts metadata."""
        if not info.get("uploader") or info.get("uploader") == "Unknown":
            apple_meta = self._fetch_apple_metadata(url)
            if apple_meta.get("author"):
                info["uploader"] = apple_meta.get("author")
            if apple_meta.get("author_image"):
                info["uploader_avatar"] = apple_meta.get("author_image")

    def _enrich_bilibili(self, url: str, info: Dict[str, Any]) -> None:
        """Enrich Bilibili metadata."""
        # Ensure author_url
        if not info.get("uploader_url") and info.get("uploader_id"):
            mid = str(info.get("uploader_id"))
            if mid.isdigit():
                info["uploader_url"] = f"https://space.bilibili.com/{mid}"

                # Fetch avatar if missing
                if not info.get("uploader_avatar"):
                    avatar = self._fetch_bilibili_avatar(mid)
                    if avatar:
                        info["uploader_avatar"] = avatar

    def _extract_direct_audio_url_from_info(
        self, info: Dict[str, Any]
    ) -> Optional[str]:
        """
        Best-effort: extract a direct audio URL from yt-dlp info dict.
        This avoids uploading to any storage; frontend can play via <audio src>.
        """
        if not info:
            return None

        # Playlist / wrapper
        if isinstance(info.get("entries"), list) and info["entries"]:
            first = info["entries"][0]
            if isinstance(first, dict):
                info = first

        # Prefer audio-only formats
        formats = info.get("formats") or []
        audio_formats = []
        for f in formats:
            if not isinstance(f, dict):
                continue
            url = f.get("url")
            if not url:
                continue
            vcodec = f.get("vcodec")
            acodec = f.get("acodec")
            if vcodec == "none" and acodec and acodec != "none":
                audio_formats.append(f)

        def score(f: dict) -> float:
            # Prefer higher bitrate; fall back to whatever exists.
            for k in ("abr", "tbr", "asr"):
                v = f.get(k)
                try:
                    if v is not None:
                        return float(v)
                except Exception:
                    continue
            return 0.0

        if audio_formats:
            best = sorted(audio_formats, key=score, reverse=True)[0]
            return best.get("url")

        # Fallback: some extractors provide a single URL directly
        url = info.get("url")
        if isinstance(url, str) and url:
            return url
        return None
        return None

    async def download_and_convert(
        self, url: str, output_dir: Path
    ) -> Tuple[str, str, Optional[str], Optional[str], Dict[str, Any]]:
        """
        Download media and convert to m4a.

        Returns:
            (audio_file_path, video_title, thumbnail_url, direct_audio_url, metadata_dict)
        """
        try:
            # Create output directory
            output_dir.mkdir(exist_ok=True)

            # Generate a unique filename
            import uuid

            unique_id = str(uuid.uuid4())[:8]
            output_template = str(output_dir / f"audio_{unique_id}.%(ext)s")

            # Update yt-dlp options
            ydl_opts = self.ydl_opts.copy()
            ydl_opts["outtmpl"] = output_template
            ydl_opts["http_headers"] = self._build_http_headers(url)
            ydl_opts.update(self._ydl_overrides())

            logger.info(f"开始下载视频: {url}")

            # Run synchronously without a thread pool
            # In FastAPI, IO-bound operations can be awaited directly
            import asyncio
            import yt_dlp

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                try:
                    # Fetch video info (use thread to avoid blocking event loop)
                    info = await asyncio.to_thread(ydl.extract_info, url, False)
                except Exception as e:
                    msg = str(e)
                    # Give a more actionable hint for common provider blocks
                    if "403" in msg and "Forbidden" in msg and "BiliBili" in msg:
                        raise Exception(
                            "Bilibili blocked the request (HTTP 403). "
                            "If this is a restricted/anti-bot page, set BILIBILI_SESSDATA or BILIBILI_COOKIE in .env "
                            "and retry."
                        ) from e
                    raise

                video_title = info.get("title", "unknown")
                expected_duration = info.get("duration") or 0
                direct_audio_url = self._extract_direct_audio_url_from_info(info)
                logger.info(f"视频标题: {video_title}")

                # Download media (use thread to avoid blocking event loop)
                await asyncio.to_thread(ydl.download, [url])

            # Locate generated m4a file
            audio_file = str(output_dir / f"audio_{unique_id}.m4a")

            if not os.path.exists(audio_file):
                # If m4a is missing, look for other audio formats
                for ext in ["webm", "mp4", "mp3", "wav"]:
                    potential_file = str(output_dir / f"audio_{unique_id}.{ext}")
                    if os.path.exists(potential_file):
                        audio_file = potential_file
                        break
                else:
                    raise Exception("未找到下载的音频文件")

            # Validate duration; if it differs significantly, try an ffmpeg remux
            import shlex

            try:
                # Use asyncio.create_subprocess_shell instead of sync subprocess
                probe_cmd = f"ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {shlex.quote(audio_file)}"

                process = await asyncio.create_subprocess_shell(
                    probe_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await process.communicate()
                out = stdout.decode().strip()
                actual_duration = float(out) if out else 0.0
            except Exception:
                actual_duration = 0.0

            if (
                expected_duration
                and actual_duration
                and abs(actual_duration - expected_duration) / expected_duration > 0.1
            ):
                logger.warning(
                    f"音频时长异常，期望{expected_duration}s，实际{actual_duration}s，尝试重封装修复…"
                )
                try:
                    fixed_path = str(output_dir / f"audio_{unique_id}_fixed.m4a")
                    fix_cmd = f"ffmpeg -y -i {shlex.quote(audio_file)} -vn -c:a aac -b:a 160k -movflags +faststart {shlex.quote(fixed_path)}"

                    # Run ffmpeg repair command asynchronously
                    fix_process = await asyncio.create_subprocess_shell(
                        fix_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await fix_process.communicate()

                    if fix_process.returncode == 0:
                        # Replace with repaired file
                        audio_file = fixed_path
                        # Re-probe (async)
                        probe_cmd2 = probe_cmd.replace(
                            shlex.quote(audio_file.rsplit(".", 1)[0] + ".m4a"),
                            shlex.quote(audio_file),
                        )
                        process2 = await asyncio.create_subprocess_shell(
                            probe_cmd2,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        stdout2, _ = await process2.communicate()
                        out2 = stdout2.decode().strip()
                        actual_duration2 = float(out2) if out2 else 0.0
                        logger.info(f"重封装完成，新时长≈{actual_duration2:.2f}s")
                    else:
                        logger.error("重封装 ffmpeg 退出码非0")
                except Exception as e:
                    logger.error(f"重封装失败：{e}")

            # Extract known metadata and enrich
            self._enrich_metadata(url, info)

            # Update local vars from enriched info
            thumbnail = info.get("thumbnail")
            video_title = (
                info.get("title") or video_title
            )  # Ensure title consistency if enriched

            logger.info(f"音频文件已保存: {audio_file}")

            # Construct Metadata Dict
            author_url = info.get("uploader_url") or info.get("channel_url") or ""

            metadata = {
                "author": info.get("uploader") or info.get("uploader_id") or "Unknown",
                "author_url": author_url,
                "author_image_url": info.get("uploader_avatar") or "",
                "description": info.get("description") or "",
                "tags": info.get("tags") or [],
                "categories": info.get("categories") or [],
                "view_count": info.get("view_count") or 0,
                "upload_date": info.get("upload_date") or "",  # YYYYMMDD
                "duration": info.get("duration") or 0,
                "original_url": url,
                "title": video_title,
                "thumbnail_url": thumbnail,
            }

            return audio_file, video_title, thumbnail, direct_audio_url, metadata

        except Exception as e:
            logger.error(f"下载视频失败: {str(e)}")
            raise Exception(f"下载视频失败: {str(e)}")

    def _parse_vtt(self, vtt_path: Path) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Simple VTT parser.
        Returns: (full_text_markdown, segments_list_for_json)
        """
        text_blocks = []
        segments = []

        try:
            content = vtt_path.read_text(encoding="utf-8")
        except Exception:
            return "", []

        # Remove header (WEBVTT...)
        lines = content.splitlines()
        if lines and lines[0].strip().startswith("WEBVTT"):
            lines = lines[1:]

        # Buffer for current cue
        current_start = None
        current_end = None
        current_text: List[str] = []

        # Regex for VTT timestamps: 00:00:00.000 or 00:00.000
        # timestamp arrow timestamp
        time_pattern = re.compile(
            r"((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s-->\s((?:\d{2}:)?\d{2}:\d{2}\.\d{3})"
        )

        def parse_time(t_str):
            # Returns seconds (float)
            parts = t_str.split(":")
            if len(parts) == 3:
                h, m, s = parts
                return float(h) * 3600 + float(m) * 60 + float(s)
            elif len(parts) == 2:
                m, s = parts
                return float(m) * 60 + float(s)
            return 0.0

        for line in lines:
            line = line.strip()
            if not line:
                # End of cue (empty line separator)
                if current_start is not None and current_text:
                    full_text = " ".join(current_text)
                    # Simple duplication check or cleanup could go here
                    segments.append(
                        {"start": current_start, "end": current_end, "text": full_text}
                    )
                    text_blocks.append(
                        f"[{current_start:.2f}-{current_end:.2f}] {full_text}"
                    )

                current_start = None
                current_end = None
                current_text = []
                continue

            # Check for timestamp line
            m = time_pattern.search(line)
            if m:
                current_start = parse_time(m.group(1))
                current_end = parse_time(m.group(2))
                continue

            # If we have a start time, treat this as text (ignoring sequence numbers/identifiers)
            if current_start is not None:
                # Skip sequence identifiers (simple digits) if they appear alone on a line before timestamp?
                # Usually VTT is:
                # ID
                # Time --> Time
                # Text
                # So if we see text but have no time, it might be ID, but here we only capture text AFTER time is found.
                # Use a heuristic to skip metadata lines or style tags
                clean_line = re.sub(r"<[^>]+>", "", line)  # Remove <c> tags etc
                if clean_line:
                    current_text.append(clean_line)

        # Flush last one
        if current_start is not None and current_text:
            full_text = " ".join(current_text)
            segments.append(
                {"start": current_start, "end": current_end, "text": full_text}
            )
            text_blocks.append(f"[{current_start:.2f}-{current_end:.2f}] {full_text}")

        return "\n\n".join(text_blocks), segments

    async def extract_captions(self, url: str) -> Optional[Tuple[str, str, str]]:
        """
        Attempt to download and parse subtitles via yt-dlp.
        Returns: (script_text_with_timestamps, raw_json_str, detected_language) or None
        """
        import asyncio
        import uuid

        # Temp dir for subs
        # Use centralized temp directory to keep things clean
        sub_dir = Path("temp/subs")
        sub_dir.mkdir(parents=True, exist_ok=True)
        unique_id = str(uuid.uuid4())[:8]
        output_template = str(sub_dir / f"{unique_id}")  # yt-dlp will append .en.vtt

        opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            # Prefer manually created subs, then auto.
            # We fetch all available to be safe, or specify langs.
            # 'subtitleslangs': ['zh-Hans', 'zh-Hant', 'zh', 'en'], # Or 'all'
            "subtitleslangs": ["en", "zh", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW"],
            "sleep_interval": 1,
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "http_headers": self._build_http_headers(url),
        }
        opts.update(self._ydl_overrides())

        logger.info(f"Trying yt-dlp subtitle extraction for {url}")

        try:
            import yt_dlp

            with yt_dlp.YoutubeDL(opts) as ydl:
                await asyncio.to_thread(ydl.download, [url])

            # Find the best subtitle file
            # Priority: zh-Hans -> zh -> en
            # Filenames will be roughly: unique_id.zh-Hans.vtt, unique_id.en.vtt

            found_file = None
            found_lang = "unknown"

            # Simple priority list
            priorities = ["zh-Hans", "zh-Hant", "zh-CN", "zh-TW", "zh", "en", "en-US"]

            for lang in priorities:
                # Check for vtt
                f = sub_dir / f"{unique_id}.{lang}.vtt"
                if f.exists():
                    found_file = f
                    found_lang = (
                        lang if "zh" in lang else "en"
                    )  # Simplify lang code for system
                    if "zh" in lang:
                        found_lang = "zh"
                    break

            # Fallback: any vtt with unique_id
            if not found_file:
                logger.warning(
                    f"No priority subtitle found. Checking all files in {sub_dir} for {unique_id}..."
                )
                for f in sub_dir.glob(f"{unique_id}.*.vtt"):
                    logger.info(f"Found fallback subtitle: {f.name}")
                    found_file = f
                    # extract lang from filename if possible?
                    # filename: id.LANG.vtt
                    parts = f.name.split(".")
                    if len(parts) >= 3:
                        raw_lang = parts[-2]
                        found_lang = "zh" if "zh" in raw_lang else raw_lang
                    break

            if found_file:
                logger.info(f"Found subtitle file: {found_file}")
                # Parse
                md, segments = await asyncio.to_thread(self._parse_vtt, found_file)
                if md and segments:
                    # Construct raw_json compatible with Whisper
                    raw_payload = {
                        "text": "",  # optional
                        "segments": segments,
                        "language": found_lang,
                    }
                    # Cleanup
                    try:
                        found_file.unlink()
                        # Cleanup other subs for this id?
                        for f in sub_dir.glob(f"{unique_id}.*"):
                            f.unlink()
                    except Exception:
                        pass

                    return md, json.dumps(raw_payload, ensure_ascii=False), found_lang
            else:
                # Debug: List what WAS downloaded
                all_files = list(sub_dir.glob(f"{unique_id}.*"))
                logger.warning(
                    f"Subtitle extraction finished but no file matched priorities. Files present: {[f.name for f in all_files]}"
                )

            # Clean up empty remnants
            try:
                for f in sub_dir.glob(f"{unique_id}.*"):
                    f.unlink()
            except Exception:
                pass

            return None

        except Exception as e:
            logger.warning(f"yt-dlp subtitle extraction failed: {e}")
            return None

    async def extract_info_only(self, url: str) -> Dict[str, Any]:
        """
        Extract metadata without downloading the full audio.
        Returns: metadata_dict (includes title, thumbnail, audio_url, etc.)
        """
        # Use a fresh YDL instance with download=False (simulate=True implicitly via extract_info(..., download=False))
        # We assume same opts are fine, or minimal opts.
        # fast discovery
        opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": False,  # We need formats for direct audio url
            "http_headers": self._build_http_headers(url),
        }
        opts.update(self._ydl_overrides())

        try:
            import yt_dlp

            with yt_dlp.YoutubeDL(opts) as ydl:
                info = await asyncio.to_thread(ydl.extract_info, url, False)

                # Enrich with custom logic
                self._enrich_metadata(url, info)

                video_title = info.get("title", "unknown")
                thumbnail = info.get("thumbnail")

                direct_audio_url = self._extract_direct_audio_url_from_info(info)

                author_url = info.get("uploader_url") or info.get("channel_url") or ""

                return {
                    "title": video_title,
                    "thumbnail": thumbnail,
                    "audio_url": direct_audio_url,
                    # Prioritize explicitly set uploader
                    "author": info.get("uploader")
                    or info.get("uploader_id")
                    or "Unknown",
                    "author_url": author_url,
                    "author_image_url": info.get("uploader_avatar")
                    or "",  # Pass extracted avatar
                    "description": info.get("description") or "",
                    "tags": info.get("tags") or [],
                    "categories": info.get("categories") or [],
                    "view_count": info.get("view_count") or 0,
                    "upload_date": info.get("upload_date") or "",
                    "duration": info.get("duration") or 0,
                    "original_url": url,
                }
        except Exception as e:
            logger.error(f"Metadata extraction failed: {e}")
            raise e
