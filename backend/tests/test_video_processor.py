
import asyncio
import pytest
from unittest.mock import AsyncMock, Mock, patch
from services.video_processor import VideoProcessor

@pytest.fixture
def processor():
    return VideoProcessor()

@pytest.mark.asyncio
async def test_enrich_xiaoyuzhou(processor):
    info = {"title": "Original Title"}
    url = "https://www.xiaoyuzhoufm.com/episode/123"
    
    with patch.object(processor, "_fetch_xiaoyuzhou_metadata") as mock_fetch:
        mock_fetch.return_value = {
            "author": "Podcast Author",
            "author_image": "http://img.com/author.jpg",
            "thumbnail": "http://img.com/thumb.jpg"
        }
        
        processor._enrich_metadata(url, info)
        
        assert info["uploader"] == "Podcast Author"
        assert info["uploader_avatar"] == "http://img.com/author.jpg"
        assert info["thumbnail"] == "http://img.com/thumb.jpg"

@pytest.mark.asyncio
async def test_enrich_bilibili(processor):
    info = {
        "title": "Bilibili Video",
        "uploader_id": "12345",
        "uploader_url": ""
    }
    url = "https://www.bilibili.com/video/BV123"
    
    with patch.object(processor, "_fetch_bilibili_avatar") as mock_fetch:
        mock_fetch.return_value = "http://img.com/face.jpg"
        
        processor._enrich_metadata(url, info)
        
        assert info["uploader_url"] == "https://space.bilibili.com/12345"
        assert info["uploader_avatar"] == "http://img.com/face.jpg"
        
@pytest.mark.asyncio
async def test_enrich_apple(processor):
    info = {"title": "Apple Podcast", "uploader": "Unknown"}
    url = "https://podcasts.apple.com/us/podcast/id123"
    
    with patch.object(processor, "_fetch_apple_metadata") as mock_fetch:
        mock_fetch.return_value = {
            "author": "Apple Author",
            "author_image": "http://img.com/apple.jpg"
        }
        
        processor._enrich_metadata(url, info)
        
        assert info["uploader"] == "Apple Author"
        assert info["uploader_avatar"] == "http://img.com/apple.jpg"


@pytest.mark.asyncio
async def test_bilibili_download_retries_transient_timeout_with_fresh_resolution(processor):
    processor._download_once = Mock(
        side_effect=[
            RuntimeError("HTTPSConnectionPool: Read timed out."),
            RuntimeError("HTTPSConnectionPool: Read timed out."),
            {"title": "recovered"},
        ]
    )

    with patch.object(asyncio, "sleep", new=AsyncMock()) as sleep:
        result = await processor._download_media(
            "https://www.bilibili.com/video/BV1bi346XEnM/",
            {"outtmpl": "temp/audio.%(ext)s"},
        )

    assert result == {"title": "recovered"}
    assert processor._download_once.call_count == 3
    assert sleep.await_args_list[0].args == (1,)
    assert sleep.await_args_list[1].args == (2,)


@pytest.mark.asyncio
async def test_bilibili_download_reports_clear_error_after_bounded_timeouts(processor):
    processor._download_once = Mock(
        side_effect=RuntimeError("HTTPSConnectionPool: Read timed out.")
    )

    with patch.object(asyncio, "sleep", new=AsyncMock()):
        with pytest.raises(RuntimeError, match="3 次尝试后仍超时"):
            await processor._download_media(
                "https://www.bilibili.com/video/BV1bi346XEnM/",
                {"outtmpl": "temp/audio.%(ext)s"},
            )

    assert processor._download_once.call_count == 3


@pytest.mark.asyncio
async def test_non_bilibili_download_does_not_retry(processor):
    processor._download_once = Mock(side_effect=RuntimeError("Read timed out"))

    with pytest.raises(RuntimeError, match="Read timed out"):
        await processor._download_media("https://example.com/video", {})

    assert processor._download_once.call_count == 1
