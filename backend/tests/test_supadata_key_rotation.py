"""Tests for SupadataClient key rotation integration."""

from unittest.mock import AsyncMock, patch, MagicMock

import httpx
import json
import pytest

from services.supadata_client import SupadataClient


class TestSupadataClientKeyLoading:
    def test_loads_multiple_keys_from_comma_separated_env(self, monkeypatch):
        monkeypatch.setenv("SUPADATA_API_KEY", "k1,k2,k3")
        client = SupadataClient()
        assert client.rotator is not None
        keys = [client.rotator.get_key() for _ in range(3)]
        assert keys == ["k1", "k2", "k3"]

    def test_single_key_from_env(self, monkeypatch):
        monkeypatch.setenv("SUPADATA_API_KEY", "single")
        client = SupadataClient()
        assert client.rotator is not None
        assert client.rotator.get_key() == "single"

    def test_no_keys_configured(self, monkeypatch):
        monkeypatch.delenv("SUPADATA_API_KEY", raising=False)
        client = SupadataClient()
        assert client.rotator is None


def _make_response(status_code: int, json_data: dict) -> httpx.Response:
    """Helper to create a mock httpx.Response."""
    return httpx.Response(
        status_code=status_code,
        json=json_data,
        request=httpx.Request("GET", "https://api.supadata.ai/v1/transcript"),
    )


def _mock_httpx_client(mock_get_fn):
    """Create a mock httpx.AsyncClient with the given get side_effect."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=mock_get_fn)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


class TestSupadataClient429Retry:
    @pytest.mark.asyncio
    async def test_429_triggers_key_rotation_and_retry(self):
        """First key returns 429, auto-switches to next key and succeeds."""
        client = SupadataClient(api_keys=["bad_key", "good_key"])

        used_keys = []

        async def mock_get(url, headers=None, params=None):
            used_keys.append(headers.get("x-api-key"))
            if headers.get("x-api-key") == "bad_key":
                return _make_response(429, {"error": "rate limited"})
            return _make_response(
                200,
                {
                    "content": [
                        {"text": "Hello world.", "offset": 0, "duration": 5000}
                    ],
                    "lang": "en",
                },
            )

        mock_client = _mock_httpx_client(mock_get)

        with patch("services.supadata_client.httpx.AsyncClient", return_value=mock_client):
            markdown, raw_json, lang = await client.get_transcript_async("https://youtube.com/watch?v=test")

        assert markdown is not None
        assert lang == "en"
        assert "bad_key" in used_keys
        assert "good_key" in used_keys

    @pytest.mark.asyncio
    async def test_all_keys_429_returns_none(self):
        """All keys return 429, should return (None, None, None)."""
        client = SupadataClient(api_keys=["k1", "k2"])

        async def mock_get(url, headers=None, params=None):
            return _make_response(429, {"error": "rate limited"})

        mock_client = _mock_httpx_client(mock_get)

        with patch("services.supadata_client.httpx.AsyncClient", return_value=mock_client):
            result = await client.get_transcript_async("https://youtube.com/watch?v=test")

        assert result == (None, None, None)


class TestSupadataBackwardCompatibility:
    @pytest.mark.asyncio
    async def test_single_key_behavior_unchanged(self):
        """Single key mode behavior matches pre-modification behavior."""
        client = SupadataClient(api_keys=["my_key"])

        used_headers = {}

        async def mock_get(url, headers=None, params=None):
            used_headers.update(headers)
            assert params == {"url": "https://youtube.com/watch?v=test", "text": "false", "mode": "native"}
            return _make_response(
                200,
                {
                    "content": [
                        {"text": "Test content.", "offset": 0, "duration": 3000}
                    ],
                    "lang": "en",
                },
            )

        mock_client = _mock_httpx_client(mock_get)

        with patch("services.supadata_client.httpx.AsyncClient", return_value=mock_client):
            markdown, raw_json, lang = await client.get_transcript_async("https://youtube.com/watch?v=test")

        assert used_headers["x-api-key"] == "my_key"
        assert json.loads(raw_json)["model"] == "supadata-native"
        assert markdown is not None
        assert lang == "en"
