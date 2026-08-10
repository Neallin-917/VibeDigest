import json
import hmac
import hashlib
import logging
import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from coinbase_commerce.webhook import Webhook as CoinbaseWebhook

from config import settings
from dependencies import get_db_client
from db_client import DBClient

router = APIRouter()
logger = logging.getLogger(__name__)

# Creem API Config
CREEM_WEBHOOK_SECRET = settings.CREEM_WEBHOOK_SECRET
COINBASE_WEBHOOK_SECRET = settings.COINBASE_WEBHOOK_SECRET


def _provider_id(value: object) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        identifier = value.get("id")
        return identifier if isinstance(identifier, str) and identifier else None
    return None


def _provider_period_end(subscription: object) -> str | None:
    """Normalize Creem's recorded period end; never invent a billing period."""
    if not isinstance(subscription, dict):
        return None
    raw_value = subscription.get("current_period_end_date")
    if not isinstance(raw_value, str) or not raw_value.strip():
        return None

    try:
        value = datetime.datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Creem subscription has an invalid period end: %r", raw_value)
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc).isoformat()

@router.post("/creem")
async def creem_webhook(
    request: Request,
    db: DBClient = Depends(get_db_client)
):
    """Handle Creem payment webhooks."""
    payload = await request.body()
    sig_header = request.headers.get("creem-signature")

    if not CREEM_WEBHOOK_SECRET:
        logger.error("Creem webhook secret is not configured")
        raise HTTPException(status_code=503, detail="Webhook verification unavailable")

    if not sig_header:
        logger.warning("Creem webhook signature is missing")
        raise HTTPException(status_code=400, detail="Missing signature")

    # Verify signature using HMAC-SHA256
    expected_sig = hmac.new(
        CREEM_WEBHOOK_SECRET.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_sig, sig_header):
        logger.warning("Creem webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("eventType")
    obj = event.get("object", {})

    logger.info(f"Creem webhook received: {event_type}")

    if event_type == "checkout.completed":
        # Extract data from checkout object
        checkout_id = obj.get("id")
        metadata = obj.get("metadata", {})
        user_id = metadata.get("user_id")
        customer_id = _provider_id(obj.get("customer"))
        product = obj.get("product", {})
        subscription = obj.get("subscription", {})

        # Link Creem Customer ID (if we have user_id)
        if user_id and customer_id:
            db.link_creem_customer(user_id, customer_id)

        # Update payment order if exists
        if checkout_id:
            existing_order = db.get_payment_order_by_provider_id(checkout_id)
            if existing_order:
                if existing_order.get("status") == "completed":
                    logger.info(
                        f"Order {existing_order['id']} already completed. Skipping."
                    )
                    return {"status": "success", "message": "Already processed"}

                db.update_payment_order(
                    existing_order["id"],
                    status="completed",
                    metadata={
                        "creem_customer": customer_id,
                        "checkout_id": checkout_id,
                    },
                )

        # Determine product type
        billing_type = (
            product.get("billing_type", "one_time")
            if isinstance(product, dict)
            else "one_time"
        )
        product_id = product.get("id") if isinstance(product, dict) else product

        if billing_type == "recurring":
            period_end = _provider_period_end(subscription)
            if user_id and period_end:
                db.update_subscription_by_user(
                    user_id, "pro", period_end
                )
                logger.info(f"Activated Pro subscription for user {user_id}")
            elif user_id:
                logger.warning(
                    "Skipping subscription activation for user %s: Creem period end is missing",
                    user_id,
                )

        else:
            # One-time payment (Credits)
            price = settings.get_price_by_id(product_id)
            if price and price.credits > 0 and user_id:
                db.add_credits(user_id, price.credits)
                logger.info(f"Added {price.credits} credits to user {user_id}")

    elif event_type == "subscription.paid":
        # Recurring payment success - renew subscription
        customer_id = _provider_id(obj.get("customer"))
        period_end = _provider_period_end(obj)

        if customer_id and period_end:
            db.update_subscription(customer_id, "pro", period_end)
            logger.info(f"Renewed Pro subscription for customer {customer_id}")
        elif customer_id:
            logger.warning(
                "Skipping subscription renewal for customer %s: Creem period end is missing",
                customer_id,
            )

    elif event_type in ("subscription.canceled", "subscription.scheduled_cancel"):
        # A cancellation remains entitled through Creem's paid period. The task
        # submission transaction enforces the recorded end time when it arrives.
        customer_id = _provider_id(obj.get("customer"))
        period_end = _provider_period_end(obj)
        if customer_id and period_end:
            db.update_subscription(customer_id, "pro", period_end)
            logger.info("Recorded subscription cancellation for customer %s", customer_id)
        elif customer_id:
            logger.warning(
                "Skipping cancellation update for customer %s: Creem period end is missing",
                customer_id,
            )

    elif event_type == "subscription.expired":
        # Creem may retry a failed renewal. Keep the last provider-recorded
        # period end and let the task transaction expire access when appropriate.
        logger.info("Received subscription.expired; retaining recorded period end")

    return {"status": "success"}

@router.post("/coinbase")
async def coinbase_webhook(
    request: Request,
    db: DBClient = Depends(get_db_client)
):
    payload = await request.body()
    sig_header = request.headers.get("X-CC-Webhook-Signature")

    try:
        event = CoinbaseWebhook.construct_event(
            payload.decode("utf-8"), sig_header, settings.COINBASE_WEBHOOK_SECRET
        )
    except Exception as e:
        logger.error(f"Coinbase signature error: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle confirmed payments
    if event.type == "charge:confirmed":
        charge = event.data
        metadata = charge.get("metadata", {})
        user_id = metadata.get("user_id")
        order_id = metadata.get("order_id")
        price_id = metadata.get("price_id")

        # Accounting Details
        payments = charge.get("payments", [])
        if payments:
            latest = payments[-1]
            crypto_amt = latest["value"]["crypto"]["amount"]
            crypto_curr = latest["value"]["crypto"]["currency"]

            # Verify Order
            if order_id:
                # Idempotency Check
                existing_order = db.get_payment_order(order_id)
                if existing_order and existing_order.get("status") == "completed":
                    logger.info(
                        f"Order {order_id} already completed. Skipping webhook."
                    )
                    return {"status": "success", "message": "Already processed"}

                db.update_payment_order(
                    order_id,
                    status="completed",
                    amount_crypto=float(crypto_amt),
                    currency_crypto=crypto_curr,
                    metadata=charge,
                )

        if user_id and price_id:
            price = settings.get_price_by_id(price_id)
            if price and price.credits > 0:
                db.add_credits(user_id, price.credits)
            # Handle Pro? (Manual period calculation needed if supporting crypto subs)
            pass

    return {"status": "success"}
