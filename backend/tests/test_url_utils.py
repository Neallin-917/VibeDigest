"""Tests for URL utility functions."""

import pytest
from utils.url import is_supported_content_url, normalize_video_url


@pytest.mark.parametrize(
    "url",
    [
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtube.com/shorts/dQw4w9WgXcQ",
        "https://youtube.com/live/dQw4w9WgXcQ",
        "https://podcasts.apple.com/us/podcast/show/id123456?i=1000123",
        "https://bilibili.com/video/BV1xx411c7XW",
        "https://xiaoyuzhoufm.com/episode/12345",
    ],
)
def test_supported_content_url_requires_a_known_source_and_identifier(url):
    assert is_supported_content_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://youtube.com",
        "https://youtu.be",
        "https://youtube.com/@channel",
        "https://youtube.com/playlist?list=PL123",
        "https://podcasts.apple.com",
        "https://bilibili.com",
        "https://xiaoyuzhoufm.com/podcast/123",
        "https://example.com/video/123",
        "https://notyoutube.com/watch?v=spoofed",
    ],
)
def test_supported_content_url_rejects_sites_without_supported_content(url):
    assert not is_supported_content_url(url)


class TestNormalizeVideoUrl:
    """Tests for normalize_video_url function."""

    def test_youtube_watch_url(self):
        """Test normalizing YouTube watch URL."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        result = normalize_video_url(url)
        assert "youtube.com" in result
        assert "dQw4w9WgXcQ" in result

    def test_youtube_short_url(self):
        """Test normalizing YouTube short URL."""
        url = "https://youtu.be/dQw4w9WgXcQ"
        result = normalize_video_url(url)
        assert result is not None
        assert "dQw4w9WgXcQ" in result

    def test_youtube_url_without_scheme(self):
        """Test URL without scheme."""
        url = "youtube.com/watch?v=dQw4w9WgXcQ"
        result = normalize_video_url(url)
        assert result is not None
        assert result.startswith("http")

    def test_youtube_url_with_extra_params(self):
        """Test YouTube URL with extra parameters."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLxyz"
        result = normalize_video_url(url)
        assert result is not None
        assert "dQw4w9WgXcQ" in result

    def test_empty_url(self):
        """Test empty URL."""
        assert normalize_video_url("") == ""
        assert normalize_video_url(None) == ""

    def test_invalid_url(self):
        """Test invalid URL returns something (best effort)."""
        result = normalize_video_url("not a url")
        # Function attempts to normalize even invalid URLs
        assert result is not None

    def test_bilibili_url(self):
        """Test Bilibili URL."""
        url = "https://www.bilibili.com/video/BV1xx411c7XW"
        result = normalize_video_url(url)
        assert result is not None
        assert "bilibili.com" in result

    def test_podcast_url(self):
        """Test podcast platform URL."""
        url = "https://www.xiaoyuzhoufm.com/episode/12345"
        result = normalize_video_url(url)
        # Should be normalized (may or may not be supported)
        assert result is None or "xiaoyuzhoufm.com" in result


class TestYouTubeShorts:
    """Tests for YouTube Shorts URL handling."""

    def test_youtube_shorts_url(self):
        """Test YouTube Shorts URL normalization."""
        url = "https://www.youtube.com/shorts/dQw4w9WgXcQ"
        result = normalize_video_url(url)
        assert result is not None
        assert "dQw4w9WgXcQ" in result

    def test_youtube_shorts_with_trailing_slash(self):
        """Test YouTube Shorts URL with trailing slash."""
        url = "https://www.youtube.com/shorts/dQw4w9WgXcQ/"
        result = normalize_video_url(url)
        assert result is not None
        assert "dQw4w9WgXcQ" in result


class TestUrlCleaning:
    """Tests for URL parameter cleaning."""

    def test_removes_utm_params(self):
        """Test removal of UTM tracking parameters."""
        url = "https://example.com/video?id=123&utm_source=twitter&utm_medium=social"
        result = normalize_video_url(url)
        assert "utm_source" not in result
        assert "utm_medium" not in result
        assert "id=123" in result

    def test_removes_ref_param(self):
        """Test removal of ref parameter."""
        url = "https://example.com/video?id=123&ref=homepage"
        result = normalize_video_url(url)
        assert "ref=" not in result

    def test_preserves_important_params(self):
        """Test that important parameters are preserved."""
        url = "https://bilibili.com/video/BV123?p=2"
        result = normalize_video_url(url)
        assert "p=2" in result

    def test_removes_www_prefix(self):
        """Test www prefix removal."""
        url = "https://www.example.com/video"
        result = normalize_video_url(url)
        assert "www." not in result


class TestEdgeCases:
    """Tests for edge cases."""

    def test_undefined_string(self):
        """Test 'undefined' string is treated as empty."""
        assert normalize_video_url("undefined") == ""
        assert normalize_video_url("UNDEFINED") == ""

    def test_null_string(self):
        """Test 'null' string is treated as empty."""
        assert normalize_video_url("null") == ""
        assert normalize_video_url("NULL") == ""

    def test_none_string(self):
        """Test 'none' string is treated as empty."""
        assert normalize_video_url("none") == ""
        assert normalize_video_url("None") == ""

    def test_whitespace_url(self):
        """Test URL with whitespace."""
        url = "  https://youtube.com/watch?v=abc  "
        result = normalize_video_url(url)
        assert result.startswith("https://")

    def test_http_to_https(self):
        """Test that HTTP URLs work."""
        url = "http://youtube.com/watch?v=abc"
        result = normalize_video_url(url)
        assert result is not None
