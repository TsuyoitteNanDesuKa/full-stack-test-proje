import hashlib
import json
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.config import Settings
from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import CustomerOrder, Payment, PaymentWebhookEvent
from shop_api.order_fulfillment import set_order_fulfillments_status
from shop_api.order_lifecycle import record_order_status_event
from shop_api.payment_expiry import (
    StockRestorationError,
    expire_due_payments,
    restore_order_stock,
)
from shop_api.payment_providers import MockPaymentProvider, PaymentProvider
from shop_api.schemas import (
    MockPaymentResultRequest,
    OrderStatus,
    PaymentResponse,
    PaymentResult,
    PaymentStatus,
    PaymentWebhookRequest,
    PaymentWebhookResponse,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(tags=["payments"])
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _provider(request: Request) -> PaymentProvider:
    return request.app.state.payment_provider


def _expire_due_payments(db: Session, now: datetime | None = None) -> int:
    try:
        return expire_due_payments(db, now)
    except StockRestorationError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stok sınırı nedeniyle süresi dolan sipariş kapatılamadı.",
        ) from error


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ödeme için alıcı hesabı gereklidir.",
        )


def _payment_response(
    payment: Payment,
    provider: PaymentProvider,
    *,
    include_checkout_url: bool = True,
) -> PaymentResponse:
    checkout_url = (
        provider.create_checkout_url(payment.id, payment.provider_reference)
        if include_checkout_url and payment.status == PaymentStatus.PENDING
        else None
    )
    return PaymentResponse(
        id=payment.id,
        order_id=payment.order_id,
        provider_reference=payment.provider_reference,
        status=payment.status,
        amount=payment.amount,
        currency=payment.currency,
        expires_at=payment.expires_at,
        checkout_url=checkout_url,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


def _load_owned_order(
    db: Session,
    order_id: int,
    owner_subject: str,
) -> CustomerOrder:
    order = db.scalar(
        select(CustomerOrder)
        .where(
            CustomerOrder.id == order_id,
            CustomerOrder.owner_subject == owner_subject,
        )
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")
    return order


@router.post(
    "/api/v1/orders/{order_id}/payments",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    order_id: int,
    response: Response,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=1, max_length=128),
    ],
) -> PaymentResponse:
    _require_buyer(current_user)
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
        raise HTTPException(status_code=422, detail="Idempotency-Key geçersiz biçimde.")
    _expire_due_payments(db)

    existing = db.scalar(
        select(Payment).where(
            Payment.owner_subject == current_user.subject,
            Payment.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.order_id != order_id:
            raise HTTPException(
                status_code=409,
                detail="Idempotency-Key başka bir sipariş için kullanılmış.",
            )
        response.status_code = status.HTTP_200_OK
        return _payment_response(existing, _provider(request))

    order = _load_owned_order(db, order_id, current_user.subject)
    existing = db.scalar(
        select(Payment).where(
            Payment.owner_subject == current_user.subject,
            Payment.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.order_id != order_id:
            raise HTTPException(
                status_code=409,
                detail="Idempotency-Key başka bir sipariş için kullanılmış.",
            )
        response.status_code = status.HTTP_200_OK
        return _payment_response(existing, _provider(request))

    if order.status != OrderStatus.PENDING_PAYMENT:
        raise HTTPException(status_code=409, detail="Sipariş ödeme beklemiyor.")
    current_payment = db.scalar(select(Payment).where(Payment.order_id == order.id))
    if current_payment is not None:
        raise HTTPException(status_code=409, detail="Sipariş için ödeme zaten başlatılmış.")

    settings = _settings(request)
    provider = _provider(request)
    now = datetime.now(UTC)
    payment = Payment(
        order_id=order.id,
        owner_subject=current_user.subject,
        provider=provider.name,
        provider_reference=f"{provider.name}-{uuid.uuid4().hex}",
        idempotency_key=idempotency_key,
        status=PaymentStatus.PENDING,
        amount=order.total_amount,
        currency="TRY",
        expires_at=now + timedelta(seconds=settings.payment_expiry_seconds),
        created_at=now,
        updated_at=now,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return _payment_response(payment, provider)


@router.get(
    "/api/v1/orders/{order_id}/payments/{payment_id}",
    response_model=PaymentResponse,
)
def get_payment(
    order_id: int,
    payment_id: int,
    request: Request,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PaymentResponse:
    _require_buyer(current_user)
    _expire_due_payments(db)
    payment = db.scalar(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.order_id == order_id,
            Payment.owner_subject == current_user.subject,
        )
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı.")
    return _payment_response(payment, _provider(request))


def _apply_webhook(
    db: Session,
    provider: PaymentProvider,
    event: PaymentWebhookRequest,
    payload_sha256: str,
) -> PaymentWebhookResponse:
    _expire_due_payments(db)
    payment = db.scalar(
        select(Payment)
        .where(
            Payment.provider == provider.name,
            Payment.provider_reference == event.payment_reference,
        )
        .with_for_update()
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı.")

    existing_event = db.scalar(
        select(PaymentWebhookEvent).where(
            PaymentWebhookEvent.provider == provider.name,
            PaymentWebhookEvent.event_id == event.event_id,
        )
    )
    if existing_event is not None:
        if (
            existing_event.payment_id != payment.id
            or existing_event.payload_sha256 != payload_sha256
        ):
            raise HTTPException(status_code=409, detail="Webhook event ID çakışması.")
        return PaymentWebhookResponse(
            accepted=True,
            duplicate=True,
            payment=_payment_response(payment, provider),
        )

    if event.amount != payment.amount or event.currency != payment.currency:
        raise HTTPException(status_code=409, detail="Ödeme tutarı veya para birimi eşleşmiyor.")

    now = datetime.now(UTC)
    if payment.status == PaymentStatus.PENDING:
        expires_at = payment.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= now:
            _expire_due_payments(db, now)
        elif event.status == PaymentResult.SUCCEEDED:
            payment.status = PaymentStatus.SUCCEEDED
            payment.updated_at = now
            order = db.scalar(
                select(CustomerOrder).where(CustomerOrder.id == payment.order_id).with_for_update()
            )
            if order is not None and order.status == OrderStatus.PENDING_PAYMENT:
                previous_status = order.status
                order.status = OrderStatus.PAID
                set_order_fulfillments_status(
                    db,
                    order_id=order.id,
                    target_status=OrderStatus.PAID.value,
                    action="payment_succeeded",
                    created_at=now,
                )
                record_order_status_event(
                    db,
                    order_id=order.id,
                    action="payment_succeeded",
                    from_status=previous_status,
                    to_status=order.status,
                    created_at=now,
                )
        else:
            payment.status = (
                PaymentStatus.FAILED
                if event.status == PaymentResult.FAILED
                else PaymentStatus.CANCELLED
            )
            payment.updated_at = now
            order = db.scalar(
                select(CustomerOrder).where(CustomerOrder.id == payment.order_id).with_for_update()
            )
            if order is not None and order.status == OrderStatus.PENDING_PAYMENT:
                previous_status = order.status
                order.status = OrderStatus.CANCELLED
                try:
                    restore_order_stock(db, order.id)
                except StockRestorationError as error:
                    db.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Stok sınırı nedeniyle sipariş kapatılamadı.",
                    ) from error
                set_order_fulfillments_status(
                    db,
                    order_id=order.id,
                    target_status=OrderStatus.CANCELLED.value,
                    action=(
                        "payment_failed"
                        if event.status == PaymentResult.FAILED
                        else "payment_cancelled"
                    ),
                    created_at=now,
                )
                record_order_status_event(
                    db,
                    order_id=order.id,
                    action=(
                        "payment_failed"
                        if event.status == PaymentResult.FAILED
                        else "payment_cancelled"
                    ),
                    from_status=previous_status,
                    to_status=order.status,
                    created_at=now,
                )

    db.add(
        PaymentWebhookEvent(
            payment_id=payment.id,
            provider=provider.name,
            event_id=event.event_id,
            payload_sha256=payload_sha256,
            received_at=now,
        )
    )
    db.commit()
    db.refresh(payment)
    return PaymentWebhookResponse(
        accepted=True,
        duplicate=False,
        payment=_payment_response(payment, provider),
    )


@router.post("/api/v1/payments/webhook", response_model=PaymentWebhookResponse)
async def payment_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    signature: Annotated[str, Header(alias="X-Payment-Signature", min_length=1)],
) -> PaymentWebhookResponse:
    provider = _provider(request)
    body = await request.body()
    if len(body) > 4096:
        raise HTTPException(status_code=413, detail="Webhook gövdesi çok büyük.")
    if not provider.verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Webhook imzası geçersiz.")
    try:
        event = PaymentWebhookRequest.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail="Webhook gövdesi geçersiz.") from error
    return _apply_webhook(
        db,
        provider,
        event,
        hashlib.sha256(body).hexdigest(),
    )


@router.get("/api/v1/payments/mock-checkout/{payment_id}/{token}")
def mock_checkout_page(
    payment_id: int,
    token: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> HTMLResponse:
    provider = _provider(request)
    if not isinstance(provider, MockPaymentProvider):
        raise HTTPException(status_code=404, detail="Ödeme sayfası bulunamadı.")
    _expire_due_payments(db)
    payment = db.get(Payment, payment_id)
    if (
        payment is None
        or payment.provider != provider.name
        or not provider.verify_checkout_token(payment.id, payment.provider_reference, token)
    ):
        raise HTTPException(status_code=404, detail="Ödeme sayfası bulunamadı.")
    if payment.status != PaymentStatus.PENDING:
        return HTMLResponse(
            "<!doctype html><html lang='tr'><meta charset='utf-8'>"
            "<title>Ödeme tamamlandı</title><p>Bu ödeme oturumu artık etkin değil.</p></html>"
        )
    content = f"""<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Güvenli test ödeme sayfası</title>
<style>body{{font:16px sans-serif;max-width:36rem;margin:10vh auto;padding:1rem;color:#243b2a}}
button{{margin:.5rem;padding:.8rem 1rem;cursor:pointer}}#result{{margin-top:1rem}}</style></head>
<body><main><h1>Test ödeme sayfası</h1>
<p>Bu yerel sandbox gerçek ödeme yapmaz. Gerçek kart bilgisi girmeyin.</p>
<p>Ödenecek tutar: {payment.amount} {payment.currency}</p>
<button data-status="succeeded">Test ödemesini başarılı yap</button>
<button data-status="failed">Test ödemesini reddet</button>
<button data-status="cancelled">Test ödemesini iptal et</button>
<p id="result" role="status"></p></main>
<script>
for (const button of document.querySelectorAll('button[data-status]')) {{
  button.addEventListener('click', async () => {{
    const response = await fetch(location.pathname, {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{status: button.dataset.status}})
    }});
    const result = await response.json();
    document.querySelector('#result').textContent =
      response.ok ? `Ödeme durumu: ${{result.status}}` : 'İşlem tamamlanamadı.';
  }});
}}
</script></body></html>"""
    return HTMLResponse(content)


@router.post("/api/v1/payments/mock-checkout/{payment_id}/{token}")
def complete_mock_checkout(
    payment_id: int,
    token: str,
    request: Request,
    result: MockPaymentResultRequest,
    db: Annotated[Session, Depends(get_db)],
) -> PaymentResponse:
    provider = _provider(request)
    if not isinstance(provider, MockPaymentProvider):
        raise HTTPException(status_code=404, detail="Ödeme sayfası bulunamadı.")
    _expire_due_payments(db)
    payment = db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
    if (
        payment is None
        or payment.provider != provider.name
        or not provider.verify_checkout_token(payment.id, payment.provider_reference, token)
    ):
        raise HTTPException(status_code=404, detail="Ödeme sayfası bulunamadı.")
    payload = {
        "event_id": f"mock-{payment.id}-{result.status.value}",
        "payment_reference": payment.provider_reference,
        "status": result.status.value,
        "amount": str(payment.amount),
        "currency": payment.currency,
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = provider.sign_webhook_body(body)
    if not provider.verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Mock ödeme imzası geçersiz.")
    event = PaymentWebhookRequest.model_validate(payload)
    result = _apply_webhook(
        db,
        provider,
        event,
        hashlib.sha256(body).hexdigest(),
    )
    return result.payment
