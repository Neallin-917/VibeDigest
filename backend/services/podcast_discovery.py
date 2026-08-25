from __future__ import annotations

import asyncio
import json
import logging
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

from db_client import DBClient
from services.task_queue import TaskQueue

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PodcastSourceConfig:
    slug: str
    name: str
    description: str
    source_type: str
    source_url: str
    avatar_url: str | None
    aliases: tuple[str, ...]
    topics: tuple[str, ...]
    featured: bool
    active: bool
    discovery_enabled: bool
    auto_publish: bool
    catalog_order: int
    min_duration_seconds: int
    max_new_per_run: int


@dataclass(frozen=True)
class PodcastSource(PodcastSourceConfig):
    id: str


@dataclass(frozen=True)
class DiscoveredEpisode:
    external_id: str
    video_url: str
    title: str
    thumbnail_url: str | None
    published_at: datetime | None
    duration_seconds: int | None


@dataclass(frozen=True)
class EpisodeRecord:
    id: str
    task_id: str | None


@dataclass
class DiscoveryStats:
    sources_checked: int = 0
    episodes_seen: int = 0
    episodes_queued: int = 0
    episodes_already_linked: int = 0
    episodes_filtered: int = 0
    source_failures: int = 0


class EpisodeDiscoverer(Protocol):
    async def discover(
        self,
        source: PodcastSource,
        *,
        candidate_limit: int,
    ) -> list[DiscoveredEpisode]: ...


def load_podcast_catalog(path: Path) -> list[PodcastSourceConfig]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_sources = payload.get("sources") if isinstance(payload, dict) else None
    if not isinstance(raw_sources, list) or not raw_sources:
        raise ValueError("Podcast catalog must contain a non-empty sources list")

    sources: list[PodcastSourceConfig] = []
    seen_slugs: set[str] = set()
    seen_urls: set[str] = set()
    for index, raw in enumerate(raw_sources):
        if not isinstance(raw, dict):
            raise ValueError(f"Podcast source at index {index} must be an object")
        slug = str(raw.get("slug") or "").strip()
        name = str(raw.get("name") or "").strip()
        source_url = str(raw.get("source_url") or "").strip()
        if not slug or not name or not source_url:
            raise ValueError(f"Podcast source at index {index} is missing slug/name/source_url")
        if slug in seen_slugs:
            raise ValueError(f"Duplicate podcast source slug: {slug}")
        if source_url in seen_urls:
            raise ValueError(f"Duplicate podcast source URL: {source_url}")
        seen_slugs.add(slug)
        seen_urls.add(source_url)

        source_type = str(raw.get("source_type") or "youtube_channel")
        if source_type not in {"youtube_channel", "youtube_playlist"}:
            raise ValueError(f"Unsupported source_type for {slug}: {source_type}")

        sources.append(
            PodcastSourceConfig(
                slug=slug,
                name=name,
                description=str(raw.get("description") or "").strip(),
                source_type=source_type,
                source_url=source_url,
                avatar_url=str(raw.get("avatar_url") or "").strip() or None,
                aliases=tuple(str(value).strip() for value in raw.get("aliases", []) if str(value).strip()),
                topics=tuple(str(value).strip() for value in raw.get("topics", []) if str(value).strip()),
                featured=bool(raw.get("featured", False)),
                active=bool(raw.get("active", True)),
                discovery_enabled=bool(raw.get("discovery_enabled", False)),
                auto_publish=bool(raw.get("auto_publish", False)),
                catalog_order=int(raw.get("catalog_order", index + 1)),
                min_duration_seconds=int(raw.get("min_duration_seconds", 600)),
                max_new_per_run=int(raw.get("max_new_per_run", 1)),
            )
        )
    return sources


class PodcastRepository:
    def __init__(self, db: DBClient) -> None:
        self.db = db

    def sync_catalog(self, sources: list[PodcastSourceConfig]) -> int:
        payload = [
            {
                "slug": source.slug,
                "name": source.name,
                "description": source.description,
                "source_type": source.source_type,
                "source_url": source.source_url,
                "avatar_url": source.avatar_url,
                "aliases": list(source.aliases),
                "topics": list(source.topics),
                "featured": source.featured,
                "active": source.active,
                "discovery_enabled": source.discovery_enabled,
                "auto_publish": source.auto_publish,
                "catalog_order": source.catalog_order,
                "min_duration_seconds": source.min_duration_seconds,
                "max_new_per_run": source.max_new_per_run,
            }
            for source in sources
        ]
        self.db._execute_query(
            """
            INSERT INTO public.podcast_sources (
                slug, name, description, source_type, source_url, avatar_url,
                aliases, topics, featured, active, discovery_enabled,
                auto_publish, catalog_order, min_duration_seconds,
                max_new_per_run
            )
            SELECT
                slug, name, description, source_type, source_url, avatar_url,
                aliases, topics, featured, active, discovery_enabled,
                auto_publish, catalog_order, min_duration_seconds,
                max_new_per_run
            FROM (
                SELECT
                    item->>'slug' AS slug,
                    item->>'name' AS name,
                    coalesce(item->>'description', '') AS description,
                    item->>'source_type' AS source_type,
                    item->>'source_url' AS source_url,
                    nullif(item->>'avatar_url', '') AS avatar_url,
                    ARRAY(
                        SELECT jsonb_array_elements_text(
                            coalesce(item->'aliases', '[]'::jsonb)
                        )
                    ) AS aliases,
                    ARRAY(
                        SELECT jsonb_array_elements_text(
                            coalesce(item->'topics', '[]'::jsonb)
                        )
                    ) AS topics,
                    (item->>'featured')::boolean AS featured,
                    (item->>'active')::boolean AS active,
                    (item->>'discovery_enabled')::boolean AS discovery_enabled,
                    (item->>'auto_publish')::boolean AS auto_publish,
                    (item->>'catalog_order')::integer AS catalog_order,
                    (item->>'min_duration_seconds')::integer AS min_duration_seconds,
                    (item->>'max_new_per_run')::integer AS max_new_per_run
                FROM jsonb_array_elements(CAST(:sources AS jsonb)) AS catalog(item)
            ) AS source_rows
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                source_type = EXCLUDED.source_type,
                source_url = EXCLUDED.source_url,
                avatar_url = EXCLUDED.avatar_url,
                aliases = EXCLUDED.aliases,
                topics = EXCLUDED.topics,
                featured = EXCLUDED.featured,
                active = EXCLUDED.active,
                discovery_enabled = EXCLUDED.discovery_enabled,
                auto_publish = EXCLUDED.auto_publish,
                catalog_order = EXCLUDED.catalog_order,
                min_duration_seconds = EXCLUDED.min_duration_seconds,
                max_new_per_run = EXCLUDED.max_new_per_run
            """,
            {"sources": json.dumps(payload, ensure_ascii=False)},
        )
        return len(sources)

    def list_sources(self, source_slug: str | None = None) -> list[PodcastSource]:
        predicate = "AND slug = :source_slug" if source_slug else "AND discovery_enabled = true"
        rows = self.db._execute_query(
            f"""
            SELECT
                id, slug, name, description, source_type, source_url, avatar_url,
                aliases, topics, featured, active, discovery_enabled,
                auto_publish, catalog_order, min_duration_seconds,
                max_new_per_run
            FROM public.podcast_sources
            WHERE active = true
              {predicate}
            ORDER BY catalog_order ASC, slug ASC
            """,
            {"source_slug": source_slug} if source_slug else {},
        )
        return [
            PodcastSource(
                id=str(row["id"]),
                slug=str(row["slug"]),
                name=str(row["name"]),
                description=str(row.get("description") or ""),
                source_type=str(row["source_type"]),
                source_url=str(row["source_url"]),
                avatar_url=str(row["avatar_url"]) if row.get("avatar_url") else None,
                aliases=tuple(row.get("aliases") or ()),
                topics=tuple(row.get("topics") or ()),
                featured=bool(row.get("featured")),
                active=bool(row.get("active")),
                discovery_enabled=bool(row.get("discovery_enabled")),
                auto_publish=bool(row.get("auto_publish")),
                catalog_order=int(row.get("catalog_order") or 1000),
                min_duration_seconds=int(row.get("min_duration_seconds") or 0),
                max_new_per_run=int(row.get("max_new_per_run") or 1),
            )
            for row in rows
        ]

    def upsert_episode(
        self,
        source: PodcastSource,
        episode: DiscoveredEpisode,
    ) -> EpisodeRecord:
        rows = self.db._execute_query(
            """
            INSERT INTO public.podcast_episodes (
                source_id, external_id, video_url, title, thumbnail_url,
                source_published_at, duration_seconds
            ) VALUES (
                CAST(:source_id AS uuid), :external_id, :video_url, :title,
                :thumbnail_url, :source_published_at, :duration_seconds
            )
            ON CONFLICT (video_url) DO UPDATE SET
                title = EXCLUDED.title,
                thumbnail_url = coalesce(EXCLUDED.thumbnail_url, podcast_episodes.thumbnail_url),
                source_published_at = coalesce(
                    EXCLUDED.source_published_at,
                    podcast_episodes.source_published_at
                ),
                duration_seconds = coalesce(
                    EXCLUDED.duration_seconds,
                    podcast_episodes.duration_seconds
                )
            RETURNING id, task_id
            """,
            {
                "source_id": source.id,
                "external_id": episode.external_id,
                "video_url": episode.video_url,
                "title": episode.title,
                "thumbnail_url": episode.thumbnail_url,
                "source_published_at": episode.published_at,
                "duration_seconds": episode.duration_seconds,
            },
        )
        if not rows:
            raise RuntimeError("Episode upsert returned no row")
        return EpisodeRecord(
            id=str(rows[0]["id"]),
            task_id=str(rows[0]["task_id"]) if rows[0].get("task_id") else None,
        )

    def link_episode_task(self, episode_id: str, task_id: str) -> None:
        rows = self.db._execute_query(
            """
            UPDATE public.podcast_episodes
               SET task_id = CAST(:task_id AS uuid),
                   discovery_status = 'queued',
                   last_error = null
             WHERE id = CAST(:episode_id AS uuid)
            RETURNING id
            """,
            {"episode_id": episode_id, "task_id": task_id},
        )
        if not rows:
            raise LookupError(f"Podcast episode {episode_id} was not updated")

    def mark_episode_error(self, episode_id: str, error: str) -> None:
        self.db._execute_query(
            """
            UPDATE public.podcast_episodes
               SET discovery_status = 'error',
                   last_error = left(:error, 2000)
             WHERE id = CAST(:episode_id AS uuid)
            """,
            {"episode_id": episode_id, "error": error},
        )

    def mark_source_checked(self, source_id: str, error: str | None = None) -> None:
        self.db._execute_query(
            """
            UPDATE public.podcast_sources
               SET last_checked_at = now(),
                   last_success_at = CASE WHEN :error IS NULL THEN now() ELSE last_success_at END,
                   last_error = CASE WHEN :error IS NULL THEN null ELSE left(:error, 2000) END
             WHERE id = CAST(:source_id AS uuid)
            """,
            {"source_id": source_id, "error": error},
        )


class YouTubeChannelDiscoverer:
    def __init__(self, *, timeout_seconds: float = 45.0) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be greater than zero")
        self.timeout_seconds = timeout_seconds

    async def discover(
        self,
        source: PodcastSource,
        *,
        candidate_limit: int,
    ) -> list[DiscoveredEpisode]:
        source_url = source.source_url
        if source.source_type == "youtube_channel":
            source_url = f"{source_url.rstrip('/')}/videos"

        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "yt_dlp",
            "--quiet",
            "--no-warnings",
            "--skip-download",
            "--flat-playlist",
            "--playlist-items",
            f"1:{max(candidate_limit, 1)}",
            "--ignore-errors",
            "--dump-single-json",
            "--socket-timeout",
            "15",
            "--retries",
            "1",
            "--extractor-retries",
            "1",
            source_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout_seconds,
            )
        except TimeoutError as exc:
            process.kill()
            await process.communicate()
            raise TimeoutError(
                f"YouTube discovery for {source.slug} exceeded "
                f"{self.timeout_seconds:g} seconds"
            ) from exc

        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace").strip()[-500:]
            raise RuntimeError(
                f"YouTube discovery for {source.slug} exited with "
                f"code {process.returncode}: {detail or 'no error output'}"
            )

        if not stdout.strip():
            return []
        try:
            info = json.loads(stdout)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                f"YouTube discovery for {source.slug} returned invalid JSON"
            ) from exc

        entries = info.get("entries") if isinstance(info, dict) else None
        if not isinstance(entries, list):
            return []

        episodes: list[DiscoveredEpisode] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            external_id = str(entry.get("id") or "").strip()
            title = str(entry.get("title") or "").strip()
            if not external_id or not title:
                continue
            duration = _optional_non_negative_int(entry.get("duration"))
            published_at = _entry_published_at(entry)
            thumbnail = str(entry.get("thumbnail") or "").strip() or None
            episodes.append(
                DiscoveredEpisode(
                    external_id=external_id,
                    video_url=f"https://www.youtube.com/watch?v={external_id}",
                    title=title,
                    thumbnail_url=thumbnail,
                    published_at=published_at,
                    duration_seconds=duration,
                )
            )
        return episodes


class PodcastDiscoveryService:
    def __init__(
        self,
        *,
        repository: PodcastRepository,
        discoverer: EpisodeDiscoverer,
        task_queue: TaskQueue,
        demo_user_id: str,
    ) -> None:
        self.repository = repository
        self.discoverer = discoverer
        self.task_queue = task_queue
        self.demo_user_id = demo_user_id

    async def run(
        self,
        *,
        source_slug: str | None = None,
        since_days: int = 7,
        max_enqueues: int = 4,
        candidate_multiplier: int = 4,
    ) -> DiscoveryStats:
        if since_days <= 0:
            raise ValueError("since_days must be greater than zero")
        if max_enqueues <= 0:
            raise ValueError("max_enqueues must be greater than zero")

        cutoff = datetime.now(UTC) - timedelta(days=since_days)
        stats = DiscoveryStats()
        sources = self.repository.list_sources(source_slug)
        if source_slug and not sources:
            raise ValueError(f"Unknown active podcast source: {source_slug}")
        for source in sources:
            if stats.episodes_queued >= max_enqueues:
                break
            stats.sources_checked += 1
            remaining = max_enqueues - stats.episodes_queued
            per_source_limit = min(source.max_new_per_run, remaining)
            candidate_limit = max(per_source_limit * candidate_multiplier, per_source_limit)
            try:
                episodes = await self.discoverer.discover(
                    source,
                    candidate_limit=candidate_limit,
                )
                for episode in episodes:
                    stats.episodes_seen += 1
                    if not _is_episode_eligible(episode, source, cutoff):
                        stats.episodes_filtered += 1
                        continue

                    record = self.repository.upsert_episode(source, episode)
                    if record.task_id:
                        stats.episodes_already_linked += 1
                        continue
                    if per_source_limit <= 0 or stats.episodes_queued >= max_enqueues:
                        break

                    try:
                        submission = self.task_queue.submit_catalog_video(
                            video_url=episode.video_url,
                            user_id=self.demo_user_id,
                            output_intent={
                                "target_locale": "zh",
                                "source": "podcast_discovery",
                                "podcast_source_slug": source.slug,
                            },
                            publish_on_complete=source.auto_publish,
                        )
                        self.repository.link_episode_task(record.id, submission.task_id)
                        stats.episodes_queued += 1
                        per_source_limit -= 1
                    except Exception as exc:
                        self.repository.mark_episode_error(record.id, str(exc))
                        raise
                self.repository.mark_source_checked(source.id)
            except Exception as exc:
                stats.source_failures += 1
                self.repository.mark_source_checked(source.id, str(exc))
                logger.exception("Podcast discovery failed for source %s", source.slug)
        return stats


def _optional_non_negative_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    return max(parsed, 0)


def _entry_published_at(entry: dict[str, Any]) -> datetime | None:
    timestamp = entry.get("timestamp") or entry.get("release_timestamp")
    if timestamp is not None:
        try:
            return datetime.fromtimestamp(float(timestamp), tz=UTC)
        except (TypeError, ValueError, OSError):
            pass
    upload_date = str(entry.get("upload_date") or "")
    if len(upload_date) == 8 and upload_date.isdigit():
        try:
            return datetime.strptime(upload_date, "%Y%m%d").replace(tzinfo=UTC)
        except ValueError:
            return None
    return None


def _is_episode_eligible(
    episode: DiscoveredEpisode,
    source: PodcastSource,
    cutoff: datetime,
) -> bool:
    if episode.published_at is not None and episode.published_at < cutoff:
        return False
    if (
        episode.duration_seconds is not None
        and episode.duration_seconds < source.min_duration_seconds
    ):
        return False
    return True
