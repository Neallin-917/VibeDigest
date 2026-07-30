import pytest
import hmac
import hashlib
import json
from unittest.mock import MagicMock, patch

@pytest.mark.asyncio
async def test_creem_webhook_valid(api_client, mock_db_client):
    secret = "test_secret"
    payload = {
        "eventType": "checkout.completed", 
        "object": {
            "id": "chk_123", 
            "metadata": {"user_id": "u1"},
            "customer": {"id": "cust_1"},
            "product": {"id": "prod_1", "billing_type": "one_time"}
        }
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
    
    # Mock settings.get_price_by_id to return valid credits
    with patch("api.routes.webhooks.settings") as mock_settings:
        mock_settings.get_price_by_id.return_value.credits = 100
        
        with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", secret):
            response = await api_client.post(
                "/api/webhook/creem", 
                content=payload_bytes,
                headers={"creem-signature": signature}
            )
            assert response.status_code == 200
            mock_db_client.add_credits.assert_called_with("u1", 100)

@pytest.mark.asyncio
async def test_creem_webhook_invalid_signature(api_client):
    secret = "test_secret"
    payload = b"{}"
    
    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", secret):
        response = await api_client.post(
            "/api/webhook/creem", 
            content=payload,
            headers={"creem-signature": "invalid"}
        )
        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_creem_webhook_missing_signature(api_client):
    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", "test_secret"):
        response = await api_client.post("/api/webhook/creem", content=b"{}")

    assert response.status_code == 400
    assert "Missing signature" in response.json()["detail"]


@pytest.mark.asyncio
async def test_creem_webhook_missing_secret(api_client):
    response = await api_client.post(
        "/api/webhook/creem",
        content=b"{}",
        headers={"creem-signature": "signature"},
    )

    assert response.status_code == 503
    assert "verification unavailable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_coinbase_webhook(api_client, mock_db_client):
    with patch("api.routes.webhooks.CoinbaseWebhook") as mock_cb:
        mock_event = MagicMock()
        mock_event.type = "charge:confirmed"
        mock_event.data = {
            "metadata": {"user_id": "u1", "order_id": "ord_1", "price_id": "p1"},
            "payments": [{"value": {"crypto": {"amount": "10", "currency": "BTC"}}}]
        }
        mock_cb.construct_event.return_value = mock_event
        
        with patch("api.routes.webhooks.settings") as mock_settings:
            mock_settings.get_price_by_id.return_value.credits = 50

            response = await api_client.post(
                "/api/webhook/coinbase",
                json={},
                headers={"X-CC-Webhook-Signature": "sig"}
            )
            assert response.status_code == 200
            mock_db_client.update_payment_order.assert_called()
            mock_db_client.add_credits.assert_called_with("u1", 50)

@pytest.mark.asyncio
async def test_coinbase_webhook_invalid_sig(api_client):
    with patch("api.routes.webhooks.CoinbaseWebhook") as mock_cb:
        mock_cb.construct_event.side_effect = Exception("Bad sig")

        response = await api_client.post(
            "/api/webhook/coinbase",
            json={},
            headers={"X-CC-Webhook-Signature": "sig"}
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_creem_webhook_subscription_completed(api_client, mock_db_client):
    """checkout.completed with recurring billing_type activates Pro subscription."""
    secret = "test_secret"
    payload = {
        "eventType": "checkout.completed",
        "object": {
            "id": "chk_sub_1",
            "metadata": {"user_id": "u2"},
            "customer": {"id": "cust_2"},
            "product": {
                "id": "prod_monthly",
                "billing_type": "recurring",
                "billing_period": "every-month",
            },
            "subscription": {"id": "sub_1"},
        },
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()

    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", secret):
        response = await api_client.post(
            "/api/webhook/creem",
            content=payload_bytes,
            headers={"creem-signature": signature},
        )
        assert response.status_code == 200
        mock_db_client.update_subscription_by_user.assert_called_once()
        call_args = mock_db_client.update_subscription_by_user.call_args[0]
        assert call_args[0] == "u2"
        assert call_args[1] == "pro"


@pytest.mark.asyncio
async def test_creem_webhook_subscription_paid(api_client, mock_db_client):
    """subscription.paid event renews the Pro subscription period."""
    secret = "test_secret"
    payload = {
        "eventType": "subscription.paid",
        "object": {
            "customer": "cust_3",
            "product": {"billing_period": "every-month"},
        },
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()

    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", secret):
        response = await api_client.post(
            "/api/webhook/creem",
            content=payload_bytes,
            headers={"creem-signature": signature},
        )
        assert response.status_code == 200
        mock_db_client.update_subscription.assert_called_once()
        call_args = mock_db_client.update_subscription.call_args[0]
        assert call_args[0] == "cust_3"
        assert call_args[1] == "pro"


@pytest.mark.asyncio
async def test_creem_webhook_subscription_canceled(api_client, mock_db_client):
    """subscription.canceled event downgrades user to free tier immediately."""
    secret = "test_secret"
    payload = {
        "eventType": "subscription.canceled",
        "object": {"customer": "cust_4"},
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()

    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", secret):
        response = await api_client.post(
            "/api/webhook/creem",
            content=payload_bytes,
            headers={"creem-signature": signature},
        )
        assert response.status_code == 200
        mock_db_client.update_subscription.assert_called_once()
        call_args = mock_db_client.update_subscription.call_args[0]
        assert call_args[0] == "cust_4"
        assert call_args[1] == "free"


@pytest.mark.asyncio
async def test_creem_webhook_invalid_json(api_client):
    """Returns 400 when webhook body is not valid JSON."""
    secret = "test_secret"
    payload_bytes = b"not-json-at-all"
    signature = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()

    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", secret):
        response = await api_client.post(
            "/api/webhook/creem",
            content=payload_bytes,
            headers={"creem-signature": signature},
        )
        assert response.status_code == 400
        assert "Invalid JSON" in response.json()["detail"]
