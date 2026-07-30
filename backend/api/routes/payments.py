import asyncio
import httpx
import logging
from fastapi import APIRouter, Depends, Form, HTTPException
from coinbase_commerce.client import Client as CoinbaseClient

from config import settings
from dependencies import get_current_user, get_db_client, get_coinbase_client
from db_client import DBClient

router = APIRouter()
logger = logging.getLogger(__name__)

# Creem API Config
CREEM_API_BASE = settings.CREEM_API_BASE
CREEM_API_KEY = settings.CREEM_API_KEY

@router.post("/create-crypto-charge")
async def create_crypto_charge(
    price_id: str = Form(...),  # We map price_id to amount manually for now
    user_id: str = Depends(get_current_user),
    db: DBClient = Depends(get_db_client),
    coinbase_client: CoinbaseClient = Depends(get_coinbase_client)
):
    """Create Coinbase Commerce Charge (USDC Only)."""

    price = settings.get_price_by_id(price_id)
    if not price:
        raise HTTPException(status_code=400, detail="Invalid Price ID")

    amount = price.amount
    name = price.name

    try:
        # 2. Create Unified Order (Pending)
        order = db.create_payment_order(user_id, "coinbase", amount, "USD")
        if not order:
            raise HTTPException(status_code=500, detail="Failed to create order record")

        # 3. Create Coinbase Charge
        charge_data = {
            "name": name,
            "description": "VibeDigest Credits",
            "local_price": {"amount": str(amount), "currency": "USD"},
            "pricing_type": "fixed_price",
            "metadata": {
                "user_id": user_id,
                "order_id": order["id"],  # Link back to our DB
                "price_id": price_id,
            },
            "redirect_url": settings.FRONTEND_URL + "/settings/pricing?success=true",
            "cancel_url": settings.FRONTEND_URL + "/settings/pricing?canceled=true",
        }

        charge = coinbase_client.charge.create(**charge_data)
        hosted_url = charge.hosted_url
        code = charge.code

        # 4. Update Order with Charge Code
        db.update_payment_order(order["id"], provider_payment_id=code)

        return {"url": hosted_url}

    except Exception as e:
        logger.error(f"Coinbase creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create-checkout-session")
async def create_checkout_session(
    price_id: str = Form(...),  # This is now Creem product_id
    user_id: str = Depends(get_current_user),
    db: DBClient = Depends(get_db_client)
):
    """Create Creem Checkout Session."""
    price = settings.get_price_by_id(price_id)
    if not price:
        raise HTTPException(status_code=400, detail="Invalid Product ID")

    # Fail fast if Creem is not configured — avoids opaque 401 from the API
    if not CREEM_API_KEY:
        raise HTTPException(status_code=503, detail="Payment service not configured")

    try:
        # Create Creem Checkout Session via REST API, with 1 retry on transient errors
        max_attempts = 2
        response = None
        for attempt in range(max_attempts):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{CREEM_API_BASE}/v1/checkouts",
                        headers={
                            "x-api-key": CREEM_API_KEY,
                            "Content-Type": "application/json",
                        },
                        json={
                            "product_id": price_id,
                            "success_url": settings.FRONTEND_URL
                            + "/settings/pricing?success=true",
                            "metadata": {"user_id": user_id},
                        },
                        timeout=30.0,
                    )
                break  # 请求成功，跳出重试循环
            except httpx.RequestError as e:
                if attempt < max_attempts - 1:
                    logger.warning(f"Creem API request failed, retrying: {e}")
                    await asyncio.sleep(2)
                    continue
                logger.error(
                    f"Creem API request failed after {max_attempts} attempts: {e}"
                )
                raise HTTPException(
                    status_code=503, detail="Payment service temporarily unavailable"
                )

        if response.status_code != 200:
            error_detail = response.text
            logger.error(
                f"Creem checkout creation failed: {response.status_code} - {error_detail}"
            )
            raise HTTPException(
                status_code=500, detail=f"Checkout creation failed: {error_detail}"
            )

        checkout_data = response.json()
        checkout_url = checkout_data.get("checkout_url")
        checkout_id = checkout_data.get("id")

        if not checkout_url:
            raise HTTPException(status_code=500, detail="No checkout URL returned")

        # Create payment order for tracking
        amount_est = price.amount
        order = db.create_payment_order(user_id, "creem", amount_est, "USD")
        if order and checkout_id:
            db.update_payment_order(order["id"], provider_payment_id=checkout_id)

        return {"url": checkout_url}

    except HTTPException:
        raise  # 不 re-wrap 已明确定义的 HTTP 错误
    except Exception as e:
        logger.error(f"Creem session creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/customer-portal")
async def create_customer_portal(
    user_id: str = Depends(get_current_user),
    db: DBClient = Depends(get_db_client),
):
    """Create a short-lived Creem customer portal link for the current user."""
    if not CREEM_API_KEY:
        raise HTTPException(status_code=503, detail="Payment service not configured")

    profile = db.get_profile(user_id)
    customer_id = profile.get("creem_customer_id") if profile else None
    if not customer_id:
        return {"url": None, "available": False}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{CREEM_API_BASE}/v1/customers/billing",
                headers={
                    "x-api-key": CREEM_API_KEY,
                    "Content-Type": "application/json",
                },
                json={"customer_id": customer_id},
                timeout=15.0,
            )
    except httpx.RequestError as e:
        logger.warning(f"Creem customer portal request failed: {e}")
        raise HTTPException(
            status_code=503, detail="Payment service temporarily unavailable"
        ) from e

    if response.status_code == 404:
        logger.warning("Creem customer no longer exists for user %s", user_id)
        return {"url": None, "available": False}

    if response.status_code != 200:
        logger.error(
            "Creem customer portal creation failed with status %s",
            response.status_code,
        )
        raise HTTPException(status_code=502, detail="Unable to open billing portal")

    portal_url = response.json().get("customer_portal_link")
    if not portal_url:
        raise HTTPException(status_code=502, detail="Unable to open billing portal")

    return {"url": portal_url, "available": True}
