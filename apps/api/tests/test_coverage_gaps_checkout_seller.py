"""Coverage gap: checkout is rejected when a cart seller's store is no longer approved."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_seller_orders import create_seller_product
from conftest import create_checkout_request, create_test_token

from shop_api.models import SellerApplication


def _headers(client: TestClient, subject: str, roles: list[str]) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles,
    )
    return {"Authorization": f"Bearer {token}"}


def test_checkout_rejects_cart_whose_seller_store_is_no_longer_approved(
    client: TestClient, engine
) -> None:
    from test_seller_orders import create_approved_seller

    seller = "checkout-gap-seller"
    create_approved_seller(engine, seller, "CheckoutGap")
    product = create_seller_product(client, seller, "CheckoutGap")
    buyer = _headers(client, "checkout-gap-buyer", ["buyer"])
    assert (
        client.post(
            "/api/v1/cart/items",
            json={"product_id": product["id"], "quantity": 1},
            headers=buyer,
        ).status_code
        == 200
    )

    with Session(engine) as db:
        application = db.query(SellerApplication).filter_by(owner_subject=seller).one()
        application.status = "rejected"
        db.commit()

    response = client.post(
        "/api/v1/orders",
        json=create_checkout_request(client, buyer),
        headers={**buyer, "Idempotency-Key": "checkout-gap-inactive-seller"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Sepetindeki bir satıcının mağazası artık etkin değil."
