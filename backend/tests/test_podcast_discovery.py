from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from services.podcast_discovery import (
    DiscoveredEpisode,
    EpisodeRecord,
    PodcastDiscoveryService,
    PodcastRepository,
    PodcastSource,
    YouTubeChannelDiscoverer,
    _entry_published_at,
    _optional_non_negative_int,
    load_podcast_catalog,
)
from services.task_queue import TaskSubmission


CATALOG_PATH = Path(__file__).resolve().parents[2] / "config" / "podcast-sources.json"


def _source(**overrides):
    values = {
        "id": "00000000-0000-0000-0000-000000000100",
        "slug": "latent-space",
        "name": "Latent Space",
        "description": "AI podcast",
        "source_type": "youtube_channel",
        "source_url": "https://www.youtube.com/@LatentSpacePod",
        "avatar_url": None,
        "aliases": ("latent space",),
        "topics": ("agents",),
        "featured": True,
        "active": True,
        "discovery_enabled": True,
        "auto_publish": True,
        "catalog_order": 1,
        "min_duration_seconds": 600,
        "max_new_per_run": 1,
    }
    values.update(overrides)
    return PodcastSource(**values)


def _episode(external_id: str, **overrides):
    values = {
        "external_id": external_id,
        "video_url": f"https://www.youtube.com/watch?v={external_id}",
        "title": f"Episode {external_id}",
        "thumbnail_url": None,
        "published_at": datetime.now(UTC) - timedelta(hours=2),
        "duration_seconds": 3600,
    }
    values.update(overrides)
    return DiscoveredEpisode(**values)


def test_catalog_contains_all_onepod_sources_with_bounded_default_tracking():
    sources = load_podcast_catalog(CATALOG_PATH)

    assert len(sources) == 42
    assert len({source.slug for source in sources}) == 42
    assert len({source.source_url for source in sources}) == 42
    tracked = [source for source in sources if source.discovery_enabled]
    assert {source.slug for source in tracked} == {
        "latent-space",
        "lennys-podcast",
        "a16z",
        "every",
        "no-priors",
    }
    assert all(source.auto_publish for source in tracked)


@pytest.mark.parametrize(
    "payload,error",
    [
        ({}, "non-empty sources list"),
        ({"sources": ["bad"]}, "must be an object"),
        ({"sources": [{"slug": "missing"}]}, "missing slug/name/source_url"),
        (
            {
                "sources": [
                    {"slug": "one", "name": "One", "source_url": "https://example.com/one"},
                    {"slug": "one", "name": "Two", "source_url": "https://example.com/two"},
                ]
            },
            "Duplicate podcast source slug",
        ),
        (
            {
                "sources": [
                    {
                        "slug": "unsupported",
                        "name": "Unsupported",
                        "source_url": "https://example.com/source",
                        "source_type": "rss",
                    }
                ]
            },
            "Unsupported source_type",
        ),
    ],
)
def test_catalog_rejects_invalid_source_contracts(tmp_path, payload, error):
    catalog = tmp_path / "podcasts.json"
    catalog.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match=error):
        load_podcast_catalog(catalog)


def test_repository_syncs_catalog_and_maps_database_rows():
    db = MagicMock()
    repository = PodcastRepository(db)
    source = _source()

    assert repository.sync_catalog([source]) == 1
    query, params = db._execute_query.call_args.args
    assert "jsonb_array_elements" in query
    assert json.loads(params["sources"])[0]["slug"] == "latent-space"

    db._execute_query.reset_mock()
    db._execute_query.return_value = [{**source.__dict__}]
    rows = repository.list_sources()

    assert rows == [source]
    assert "discovery_enabled = true" in db._execute_query.call_args.args[0]

    db._execute_query.reset_mock()
    db._execute_query.return_value = [{"id": "episode-1", "task_id": "task-1"}]
    record = repository.upsert_episode(source, _episode("new"))
    assert record == EpisodeRecord(id="episode-1", task_id="task-1")

    db._execute_query.return_value = [{"id": "episode-1"}]
    repository.link_episode_task("episode-1", "task-1")
    db._execute_query.return_value = []
    with pytest.raises(LookupError, match="was not updated"):
        repository.link_episode_task("missing", "task-1")

    repository.mark_episode_error("episode-1", "provider failed")
    repository.mark_source_checked(source.id)
    repository.mark_source_checked(source.id, "provider failed")


@pytest.mark.asyncio
async def test_youtube_discoverer_extracts_flat_metadata(monkeypatch):
    captured = {}

    class FakeProcess:
        returncode = 0

        async def communicate(self):
            payload = {
                "entries": [
                    {
                        "id": "recent",
                        "title": "Recent episode",
                        "duration": "1234.5",
                        "timestamp": datetime.now(UTC).timestamp(),
                        "thumbnail": "https://example.com/thumb.jpg",
                    },
                    None,
                    {"id": "missing-title"},
                ]
            }
            return json.dumps(payload).encode(), b""

    async def fake_create_subprocess_exec(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return FakeProcess()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)
    episodes = await YouTubeChannelDiscoverer(timeout_seconds=1).discover(
        _source(),
        candidate_limit=3,
    )

    assert captured["args"][-1] == "https://www.youtube.com/@LatentSpacePod/videos"
    assert "--dump-single-json" in captured["args"]
    assert captured["args"][captured["args"].index("--playlist-items") + 1] == "1:3"
    assert captured["kwargs"]["stdout"] == asyncio.subprocess.PIPE
    assert len(episodes) == 1
    assert episodes[0].duration_seconds == 1234
    assert episodes[0].published_at is not None


@pytest.mark.asyncio
async def test_youtube_discoverer_kills_timed_out_process(monkeypatch):
    class HangingProcess:
        returncode = None

        def __init__(self):
            self.killed = False

        async def communicate(self):
            if self.killed:
                self.returncode = -9
                return b"", b""
            await asyncio.Event().wait()

        def kill(self):
            self.killed = True

    process = HangingProcess()

    async def fake_create_subprocess_exec(*_args, **_kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    with pytest.raises(TimeoutError, match="latent-space.*0.01 seconds"):
        await YouTubeChannelDiscoverer(timeout_seconds=0.01).discover(
            _source(),
            candidate_limit=1,
        )

    assert process.killed is True


def test_discovery_metadata_helpers_fail_closed():
    assert _optional_non_negative_int("12.9") == 12
    assert _optional_non_negative_int(-2) == 0
    assert _optional_non_negative_int("bad") is None
    assert _entry_published_at({"upload_date": "20260825"}) == datetime(2026, 8, 25, tzinfo=UTC)
    assert _entry_published_at({"upload_date": "invalid"}) is None


@pytest.mark.asyncio
async def test_discovery_filters_old_and_short_items_then_uses_canonical_queue():
    source = _source()
    recent = _episode("recent")
    short = _episode("short", duration_seconds=90)
    old = _episode("old", published_at=datetime.now(UTC) - timedelta(days=30))
    repository = MagicMock()
    repository.list_sources.return_value = [source]
    repository.upsert_episode.return_value = EpisodeRecord(
        id="00000000-0000-0000-0000-000000000200",
        task_id=None,
    )
    discoverer = MagicMock()
    discoverer.discover = AsyncMock(return_value=[short, old, recent])
    queue = MagicMock()
    queue.submit_catalog_video.return_value = TaskSubmission(
        task_id="00000000-0000-0000-0000-000000000300",
        resolution="created",
        message_id=10,
    )
    service = PodcastDiscoveryService(
        repository=repository,
        discoverer=discoverer,
        task_queue=queue,
        demo_user_id="00000000-0000-0000-0000-000000000001",
    )

    stats = await service.run(since_days=7, max_enqueues=4)

    assert stats.episodes_seen == 3
    assert stats.episodes_filtered == 2
    assert stats.episodes_queued == 1
    repository.upsert_episode.assert_called_once_with(source, recent)
    queue.submit_catalog_video.assert_called_once_with(
        video_url=recent.video_url,
        user_id="00000000-0000-0000-0000-000000000001",
        output_intent={
            "target_locale": "zh",
            "source": "podcast_discovery",
            "podcast_source_slug": "latent-space",
        },
        publish_on_complete=True,
    )
    repository.link_episode_task.assert_called_once_with(
        "00000000-0000-0000-0000-000000000200",
        "00000000-0000-0000-0000-000000000300",
    )
    repository.mark_source_checked.assert_called_once_with(source.id)


@pytest.mark.asyncio
async def test_discovery_does_not_requeue_an_episode_that_already_has_a_task():
    source = _source()
    episode = _episode("existing")
    repository = MagicMock()
    repository.list_sources.return_value = [source]
    repository.upsert_episode.return_value = EpisodeRecord(
        id="00000000-0000-0000-0000-000000000200",
        task_id="00000000-0000-0000-0000-000000000300",
    )
    discoverer = MagicMock()
    discoverer.discover = AsyncMock(return_value=[episode])
    queue = MagicMock()
    service = PodcastDiscoveryService(
        repository=repository,
        discoverer=discoverer,
        task_queue=queue,
        demo_user_id="00000000-0000-0000-0000-000000000001",
    )

    stats = await service.run()

    assert stats.episodes_already_linked == 1
    assert stats.episodes_queued == 0
    queue.submit_process_video.assert_not_called()


@pytest.mark.asyncio
async def test_discovery_records_source_and_episode_errors_without_losing_other_runs():
    source = _source()
    episode = _episode("failure")
    repository = MagicMock()
    repository.list_sources.return_value = [source]
    repository.upsert_episode.return_value = EpisodeRecord(
        id="00000000-0000-0000-0000-000000000200",
        task_id=None,
    )
    discoverer = MagicMock()
    discoverer.discover = AsyncMock(return_value=[episode])
    queue = MagicMock()
    queue.submit_catalog_video.side_effect = RuntimeError("queue unavailable")
    service = PodcastDiscoveryService(
        repository=repository,
        discoverer=discoverer,
        task_queue=queue,
        demo_user_id="00000000-0000-0000-0000-000000000001",
    )

    stats = await service.run()

    assert stats.source_failures == 1
    repository.mark_episode_error.assert_called_once_with(
        "00000000-0000-0000-0000-000000000200",
        "queue unavailable",
    )
    repository.mark_source_checked.assert_called_once_with(source.id, "queue unavailable")
