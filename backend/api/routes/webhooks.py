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
        customer = obj.get("customer", {})
        customer_id = customer.get("id") if isinstance(customer, dict) else customer
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

        if billing_type == "recurring" and subscription:
            # Subscription purchase - activate Pro
            # Calculate period_end (Creem doesn't provide this directly, estimate from billing_period)
            billing_period = product.get("billing_period", "every-month")
            now = datetime.datetime.now(datetime.timezone.utc)
            if "year" in billing_period:
                period_end = now + datetime.timedelta(days=365)
            else:
                period_end = now + datetime.timedelta(days=30)

            if user_id:
                db.update_subscription_by_user(
                    user_id, "pro", period_end.isoformat()
                )
                logger.info(f"Activated Pro subscription for user {user_id}")

        else:
            # One-time payment (Credits)
            price = settings.get_price_by_id(product_id)
            if price and price.credits > 0 and user_id:
                db.add_credits(user_id, price.credits)
                logger.info(f"Added {price.credits} credits to user {user_id}")

    elif event_type == "subscription.paid":
        # Recurring payment success - renew subscription
        subscription = obj
        customer_id = subscription.get("customer")
        product = subscription.get("product", {})
        billing_period = (
            product.get("billing_period", "every-month")
            if isinstance(product, dict)
            else "every-month"
        )

        now = datetime.datetime.now(datetime.timezone.utc)
        if "year" in str(billing_period):
            period_end = now + datetime.timedelta(days=365)
        else:
            period_end = now + datetime.timedelta(days=30)

        if customer_id:
            db.update_subscription(customer_id, "pro", period_end.isoformat())
            logger.info(f"Renewed Pro subscription for customer {customer_id}")

    elif event_type in ("subscription.canceled", "subscription.expired"):
        # Subscription canceled or expired - downgrade to free
        subscription = obj
        customer_id = subscription.get("customer")

        if customer_id:
            # Set period_end to now to immediately downgrade
            db.update_subscription(
                customer_id,
                "free",
                datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )
            logger.info(f"Canceled subscription for customer {customer_id}")

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
