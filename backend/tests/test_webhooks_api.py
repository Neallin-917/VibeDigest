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
    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", ""):
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
            "subscription": {
                "id": "sub_1",
                "current_period_end_date": "2026-09-07T00:00:00Z",
            },
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
        assert call_args[2] == "2026-09-07T00:00:00+00:00"


@pytest.mark.asyncio
async def test_creem_webhook_subscription_paid(api_client, mock_db_client):
    """subscription.paid event renews the Pro subscription period."""
    secret = "test_secret"
    payload = {
        "eventType": "subscription.paid",
        "object": {
            "customer": "cust_3",
            "current_period_end_date": "2026-09-07T00:00:00Z",
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
        assert call_args[2] == "2026-09-07T00:00:00+00:00"


@pytest.mark.asyncio
async def test_creem_webhook_subscription_canceled_preserves_paid_period(api_client, mock_db_client):
    """subscription.canceled keeps Pro access through Creem's paid period end."""
    secret = "test_secret"
    payload = {
        "eventType": "subscription.canceled",
        "object": {
            "customer": "cust_4",
            "current_period_end_date": "2026-09-07T00:00:00Z",
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
        assert call_args[0] == "cust_4"
        assert call_args[1] == "pro"
        assert call_args[2] == "2026-09-07T00:00:00+00:00"


@pytest.mark.asyncio
async def test_creem_webhook_subscription_expired_does_not_drop_access_early(
    api_client, mock_db_client
):
    secret = "test_secret"
    payload = {
        "eventType": "subscription.expired",
        "object": {"customer": "cust_5"},
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
    mock_db_client.update_subscription.assert_not_called()


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


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["subscription.canceled", "subscription.scheduled_cancel"])
async def test_creem_cancellation_sets_explicit_cancel_flag(api_client, mock_db_client, event_type):
    payload = json.dumps({
        "eventType": event_type,
        "object": {"customer": {"id": "cust_cancel"},
                   "current_period_end_date": "2027-09-07T00:00:00Z"},
    }).encode()
    signature = hmac.new(b"secret", payload, hashlib.sha256).hexdigest()
    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", "secret"):
        response = await api_client.post(
            "/api/webhook/creem", content=payload, headers={"creem-signature": signature}
        )
    assert response.status_code == 200
    mock_db_client.update_subscription.assert_called_once_with(
        "cust_cancel", "pro", "2027-09-07T00:00:00+00:00", canceled=True
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["checkout.completed", "subscription.paid"])
@pytest.mark.parametrize("interval,plan_key", [("monthly", "pro_monthly"), ("annual", "pro_annual")])
async def test_creem_subscription_records_configured_billing_interval(
    api_client, mock_db_client, event_type, interval, plan_key
):
    from types import SimpleNamespace

    period = "2027-09-07T00:00:00Z"
    obj = {"customer": {"id": "cust_interval"},
           "product": {"id": "configured_product", "billing_type": "recurring"},
           "metadata": {"user_id": "user_interval"},
           "current_period_end_date": period,
           "subscription": {"current_period_end_date": period}}
    payload = json.dumps({"eventType": event_type, "object": obj}).encode()
    signature = hmac.new(b"secret", payload, hashlib.sha256).hexdigest()
    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", "secret"), patch(
        "api.routes.webhooks.settings.get_price_by_plan_key",
        side_effect=lambda key: SimpleNamespace(id="configured_product" if key == plan_key else "other"),
    ):
        response = await api_client.post(
            "/api/webhook/creem", content=payload, headers={"creem-signature": signature}
        )
    assert response.status_code == 200
    update = (mock_db_client.update_subscription_by_user if event_type == "checkout.completed"
              else mock_db_client.update_subscription)
    assert update.call_args.kwargs["billing_interval"] == interval


@pytest.mark.asyncio
async def test_creem_subscription_write_failure_keeps_checkout_retryable(api_client, mock_db_client):
    from httpx import ASGITransport, AsyncClient
    from main import app

    order = {"id": "order_retry", "status": "pending"}
    mock_db_client.get_payment_order_by_provider_id.return_value = order
    mock_db_client.update_subscription_by_user.side_effect = [RuntimeError("database unavailable"), None]

    def record_receipt(order_id, *, status, metadata):
        assert order_id == order["id"]
        order["status"] = status

    mock_db_client.update_payment_order.side_effect = record_receipt
    payload = json.dumps({
        "eventType": "checkout.completed",
        "object": {
            "id": "checkout_retry",
            "customer": {"id": "customer_retry"},
            "metadata": {"user_id": "user_retry"},
            "product": {"id": "product_retry", "billing_type": "recurring"},
            "subscription": {"current_period_end_date": "2027-09-07T00:00:00Z"},
        },
    }).encode()
    signature = hmac.new(b"secret", payload, hashlib.sha256).hexdigest()
    with patch("api.routes.webhooks.CREEM_WEBHOOK_SECRET", "secret"):
        # Keep api_client's mocked dependencies, but expose the actual HTTP 500.
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            failed = await client.post(
                "/api/webhook/creem", content=payload, headers={"creem-signature": signature}
            )
            assert failed.status_code == 500
            assert order["status"] == "pending"
            mock_db_client.update_payment_order.assert_not_called()
            retried = await client.post(
                "/api/webhook/creem", content=payload, headers={"creem-signature": signature}
            )
    assert retried.status_code == 200
    assert mock_db_client.update_subscription_by_user.call_count == 2
    assert order["status"] == "completed"
    mock_db_client.update_payment_order.assert_called_once()
