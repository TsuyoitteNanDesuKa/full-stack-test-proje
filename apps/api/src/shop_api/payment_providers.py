import hashlib
import hmac
from dataclasses import dataclass
from typing import Protocol


class PaymentProvider(Protocol):
    name: str

    def create_checkout_url(
        self,
        payment_id: int,
        payment_reference: str,
    ) -> str: ...

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool: ...

    def sign_webhook_body(self, body: bytes) -> str: ...


@dataclass(frozen=True)
class MockPaymentProvider:
    webhook_secret: str
    name: str = "mock"

    def create_checkout_url(
        self,
        payment_id: int,
        payment_reference: str,
    ) -> str:
        token = self._checkout_token(payment_id, payment_reference)
        return f"/api/v1/payments/mock-checkout/{payment_id}/{token}"

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        expected = sign_webhook_body(body, self.webhook_secret)
        return hmac.compare_digest(expected, signature)

    def sign_webhook_body(self, body: bytes) -> str:
        return sign_webhook_body(body, self.webhook_secret)

    def _checkout_token(self, payment_id: int, payment_reference: str) -> str:
        message = f"checkout:{payment_id}:{payment_reference}".encode()
        return hmac.new(
            self.webhook_secret.encode(),
            message,
            hashlib.sha256,
        ).hexdigest()

    def verify_checkout_token(
        self,
        payment_id: int,
        payment_reference: str,
        token: str,
    ) -> bool:
        expected = self._checkout_token(payment_id, payment_reference)
        return hmac.compare_digest(expected, token)


def sign_webhook_body(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
