import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    """
    Test the root endpoint / health check.
    """
    response = await async_client.get("/")
    assert response.status_code == 200
    # Assuming the root returns some message, verify basic JSON structure
    assert response.json() is not None

@pytest.mark.asyncio
async def test_404_not_found(async_client: AsyncClient):
    """
    Test a non-existent endpoint.
    """
    response = await async_client.get("/non-existent-endpoint")
    assert response.status_code == 404
@pytest.mark.asyncio
async def test_api_config_removed(async_client: AsyncClient):
    """
    Security Regression: Ensure /api/config is removed and returns 404.
    """
    response = await async_client.get("/api/config")
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_cors_headers(async_client: AsyncClient):
    """
    Verify CORS headers are set correctly for allowed origins.
    """
    # Test allowed origin (Simple Request)
    headers = {"Origin": "http://localhost:3000"}
    response = await async_client.get("/", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" in response.headers

    # Test disallowed origin
    headers_bad = {"Origin": "http://evil.com"}
    response_bad = await async_client.get("/", headers=headers_bad)
    # FastAPI CORS middleware behavior on disallowed origin: typically strips the allow-origin header
    # or sets it to null/doesn't echo.
    assert response_bad.headers.get("access-control-allow-origin") != "http://evil.com"
