from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

@pytest.mark.asyncio
async def test_create_crypto_charge(api_client, mock_db_client, mock_coinbase_client):
    mock_db_client.create_payment_order.return_value = {"id": "ord_123"}
    
    with patch("api.routes.payments.settings") as mock_settings:
        mock_settings.get_price_by_id.return_value.amount = 10.0
        mock_settings.get_price_by_id.return_value.name = "Credits"
        mock_settings.FRONTEND_URL = "http://front"
        
        response = await api_client.post("/api/create-crypto-charge", data={"price_id": "price_1"})
        assert response.status_code == 200
        assert response.json()["url"] == "http://cb.com/charge"
        
        mock_db_client.create_payment_order.assert_called()
        mock_coinbase_client.charge.create.assert_called()

@pytest.mark.asyncio
async def test_create_checkout_session(api_client, mock_db_client):
    mock_db_client.create_payment_order.return_value = {"id": "ord_123"}
    
    with patch("api.routes.payments.CREEM_API_KEY", "test-key"):
        with patch("api.routes.payments.settings") as mock_settings:
            mock_settings.get_price_by_id.return_value.amount = 10.0

            # Proper way to mock `async with httpx.AsyncClient() as client:`
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"checkout_url": "http://creem.com/pay", "id": "chk_1"}
            mock_response.text = ""

            mock_ac_instance = AsyncMock()
            mock_ac_instance.post.return_value = mock_response
            mock_ac_instance.__aenter__.return_value = mock_ac_instance
            mock_ac_instance.__aexit__.return_value = None

            with patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance):
                response = await api_client.post("/api/create-checkout-session", data={"price_id": "price_1"})
                assert response.status_code == 200
                assert response.json()["url"] == "http://creem.com/pay"
                mock_db_client.create_payment_order.assert_called()

@pytest.mark.asyncio
async def test_create_checkout_session_error(api_client, mock_db_client):
    with patch("api.routes.payments.CREEM_API_KEY", "test-key"):
        with patch("api.routes.payments.settings") as mock_settings:
            mock_settings.get_price_by_id.return_value.amount = 10.0

            mock_ac_instance = AsyncMock()
            mock_ac_instance.post.side_effect = Exception("Connection error")
            mock_ac_instance.__aenter__.return_value = mock_ac_instance
            mock_ac_instance.__aexit__.return_value = None

            with patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance):
                response = await api_client.post("/api/create-checkout-session", data={"price_id": "price_1"})
                assert response.status_code == 500


@pytest.mark.asyncio
async def test_create_checkout_session_invalid_product(api_client):
    """Returns 400 when the price_id doesn't map to a known product."""
    with patch("api.routes.payments.CREEM_API_KEY", "test-key"):
        with patch("api.routes.payments.settings") as mock_settings:
            mock_settings.get_price_by_id.return_value = None

            response = await api_client.post("/api/create-checkout-session", data={"price_id": "invalid_id"})
            assert response.status_code == 400
            assert "Invalid Product ID" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_checkout_session_no_api_key(api_client):
    """Returns 503 when CREEM_API_KEY is not configured."""
    with patch("api.routes.payments.CREEM_API_KEY", ""):
        with patch("api.routes.payments.settings") as mock_settings:
            mock_settings.get_price_by_id.return_value = MagicMock(amount=10.0)

            response = await api_client.post("/api/create-checkout-session", data={"price_id": "price_1"})
            assert response.status_code == 503
            assert "not configured" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_checkout_session_non_200_response(api_client, mock_db_client):
    """Returns 500 when Creem API responds with a non-200 status."""
    with patch("api.routes.payments.CREEM_API_KEY", "test-key"):
        with patch("api.routes.payments.settings") as mock_settings:
            mock_settings.get_price_by_id.return_value = MagicMock(amount=10.0)

            mock_response = MagicMock()
            mock_response.status_code = 422
            mock_response.text = "Unprocessable Entity"

            mock_ac_instance = AsyncMock()
            mock_ac_instance.post.return_value = mock_response
            mock_ac_instance.__aenter__.return_value = mock_ac_instance
            mock_ac_instance.__aexit__.return_value = None

            with patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance):
                response = await api_client.post("/api/create-checkout-session", data={"price_id": "price_1"})
                assert response.status_code == 500
                assert "Checkout creation failed" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_customer_portal(api_client, mock_db_client):
    mock_db_client.get_profile.return_value = {"creem_customer_id": "cust_123"}
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "customer_portal_link": "https://creem.io/portal/session"
    }

    mock_ac_instance = AsyncMock()
    mock_ac_instance.post.return_value = mock_response
    mock_ac_instance.__aenter__.return_value = mock_ac_instance
    mock_ac_instance.__aexit__.return_value = None

    with (
        patch("api.routes.payments.CREEM_API_KEY", "test-key"),
        patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance),
    ):
        response = await api_client.post("/api/customer-portal")

    assert response.status_code == 200
    assert response.json() == {
        "url": "https://creem.io/portal/session",
        "available": True,
    }
    mock_ac_instance.post.assert_awaited_once_with(
        "https://api.creem.io/v1/customers/billing",
        headers={"x-api-key": "test-key", "Content-Type": "application/json"},
        json={"customer_id": "cust_123"},
        timeout=15.0,
    )


@pytest.mark.asyncio
async def test_create_customer_portal_without_customer(api_client, mock_db_client):
    mock_db_client.get_profile.return_value = {"tier": "free"}

    with patch("api.routes.payments.CREEM_API_KEY", "test-key"):
        response = await api_client.post("/api/customer-portal")

    assert response.status_code == 200
    assert response.json() == {"url": None, "available": False}


@pytest.mark.asyncio
async def test_create_customer_portal_provider_error(api_client, mock_db_client):
    mock_db_client.get_profile.return_value = {"creem_customer_id": "cust_123"}
    mock_response = MagicMock(status_code=500)

    mock_ac_instance = AsyncMock()
    mock_ac_instance.post.return_value = mock_response
    mock_ac_instance.__aenter__.return_value = mock_ac_instance
    mock_ac_instance.__aexit__.return_value = None

    with (
        patch("api.routes.payments.CREEM_API_KEY", "test-key"),
        patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance),
    ):
        response = await api_client.post("/api/customer-portal")

    assert response.status_code == 502


@pytest.mark.asyncio
async def test_create_customer_portal_stale_customer(api_client, mock_db_client):
    mock_db_client.get_profile.return_value = {"creem_customer_id": "cust_stale"}
    mock_response = MagicMock(status_code=404)

    mock_ac_instance = AsyncMock()
    mock_ac_instance.post.return_value = mock_response
    mock_ac_instance.__aenter__.return_value = mock_ac_instance
    mock_ac_instance.__aexit__.return_value = None

    with (
        patch("api.routes.payments.CREEM_API_KEY", "test-key"),
        patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance),
    ):
        response = await api_client.post("/api/customer-portal")

    assert response.status_code == 200
    assert response.json() == {"url": None, "available": False}


@pytest.mark.asyncio
async def test_create_customer_portal_request_error(api_client, mock_db_client):
    mock_db_client.get_profile.return_value = {"creem_customer_id": "cust_123"}
    request = httpx.Request("POST", "https://api.creem.io/v1/customers/billing")

    mock_ac_instance = AsyncMock()
    mock_ac_instance.post.side_effect = httpx.ConnectError(
        "Connection failed", request=request
    )
    mock_ac_instance.__aenter__.return_value = mock_ac_instance
    mock_ac_instance.__aexit__.return_value = None

    with (
        patch("api.routes.payments.CREEM_API_KEY", "test-key"),
        patch("api.routes.payments.httpx.AsyncClient", return_value=mock_ac_instance),
    ):
        response = await api_client.post("/api/customer-portal")

    assert response.status_code == 503
