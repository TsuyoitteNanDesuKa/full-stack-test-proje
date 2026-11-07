from decimal import Decimal

import pytest
from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop_api.models import CustomerAddress, CustomerOrder, Payment, Product


def auth_headers(
    client: TestClient,
    subject: str,
    roles: list[str] | None = None,
) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles if roles is not None else ["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def address_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "label": " Ev ",
        "recipient_name": " Test Buyer ",
        "phone": "0 (555) 123 45 67",
        "city": " İstanbul ",
        "district": " Kadıköy ",
        "address_line": " Test Mahallesi, Deneme Sokak No 1 ",
        "postal_code": "34710",
        "is_default": False,
    }
    payload.update(overrides)
    return payload


def create_product(
    client: TestClient,
    *,
    price: str,
    stock: int = 5,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/products",
        json=product_payload(price=price, stock=stock),
        headers=auth_headers(client, "address-product-admin", ["admin"]),
    )
    assert response.status_code == 201
    return response.json()


def add_cart_item(
    client: TestClient,
    headers: dict[str, str],
    product_id: int,
    quantity: int = 1,
) -> None:
    response = client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": quantity},
        headers=headers,
    )
    assert response.status_code == 200


def create_address(client: TestClient, headers: dict[str, str], **overrides: object):
    return client.post("/api/v1/addresses", json=address_payload(**overrides), headers=headers)


def checkout(
    client: TestClient,
    headers: dict[str, str],
    address_id: int,
    *,
    delivery_method: str = "standard",
    key: str = "address-checkout",
):
    return client.post(
        "/api/v1/orders",
        json={"address_id": address_id, "delivery_method": delivery_method},
        headers={**headers, "Idempotency-Key": key},
    )


def test_address_crud_normalizes_fields_and_moves_default(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "address-owner")
    first = create_address(client, headers, is_default=True)
    assert first.status_code == 201
    first_body = first.json()
    assert first_body["label"] == "Ev"
    assert first_body["recipient_name"] == "Test Buyer"
    assert first_body["phone"] == "+905551234567"
    assert first_body["city"] == "İstanbul"
    assert first_body["district"] == "Kadıköy"
    assert first_body["is_default"] is True

    second = create_address(client, headers, label="İş", is_default=True)
    assert second.status_code == 201
    assert second.json()["is_default"] is True
    addresses = client.get("/api/v1/addresses", headers=headers).json()
    assert [address["id"] for address in addresses] == [second.json()["id"], first_body["id"]]
    assert [address["is_default"] for address in addresses] == [True, False]

    updated = client.put(
        f"/api/v1/addresses/{first_body['id']}",
        json=address_payload(label="Yeni Ev", is_default=True, postal_code=""),
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["postal_code"] is None
    assert updated.json()["is_default"] is True
    assert client.get("/api/v1/addresses", headers=headers).json()[1]["is_default"] is False

    assert (
        client.delete(f"/api/v1/addresses/{updated.json()['id']}", headers=headers).status_code
        == 204
    )
    remaining = client.get("/api/v1/addresses", headers=headers).json()
    assert len(remaining) == 1
    assert remaining[0]["id"] == second.json()["id"]
    assert remaining[0]["is_default"] is False
    with Session(engine) as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(CustomerAddress)
                .where(
                    CustomerAddress.owner_subject == "address-owner",
                    CustomerAddress.is_default.is_(True),
                )
            )
            == 0
        )


def test_address_book_is_private_and_buyer_only(client: TestClient) -> None:
    buyer_headers = auth_headers(client, "private-address-owner")
    another_buyer = auth_headers(client, "another-address-owner")
    address = create_address(client, buyer_headers, is_default=True).json()

    assert client.get("/api/v1/addresses").status_code == 401
    assert (
        client.get(
            "/api/v1/addresses", headers=auth_headers(client, "seller", ["seller"])
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/v1/addresses/{address['id']}",
            json=address_payload(),
            headers=another_buyer,
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/v1/addresses/{address['id']}", headers=another_buyer).status_code
        == 404
    )
    assert client.get("/api/v1/addresses", headers=another_buyer).json() == []


def test_address_validation_rejects_invalid_phone_postal_and_normalized_text(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "invalid-address-owner")
    for payload in (
        address_payload(phone="123"),
        address_payload(postal_code="12A45"),
        address_payload(city="  "),
        address_payload(address_line="tiny"),
    ):
        assert client.post("/api/v1/addresses", json=payload, headers=headers).status_code == 422
    assert client.get("/api/v1/addresses", headers=headers).json() == []


def test_checkout_rejects_another_buyers_address_without_mutating_cart_or_stock(
    client: TestClient,
    engine,
) -> None:
    buyer = auth_headers(client, "checkout-address-buyer")
    another_buyer = auth_headers(client, "checkout-address-owner")
    address = create_address(client, another_buyer, is_default=True).json()
    product = create_product(client, price="12.50")
    add_cart_item(client, buyer, int(product["id"]), 2)

    response = checkout(client, buyer, int(address["id"]))

    assert response.status_code == 404
    assert client.get("/api/v1/cart", headers=buyer).json()["items"][0]["quantity"] == 2
    with Session(engine) as session:
        assert session.get(Product, product["id"]).stock == 5
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 0
        assert session.scalar(select(func.count()).select_from(Payment)) == 0


def test_standard_delivery_fee_threshold_is_inclusive_and_express_stays_paid(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "delivery-threshold-buyer")
    address = create_address(client, headers, is_default=True).json()
    standard_product = create_product(client, price="500.00", stock=4)
    add_cart_item(client, headers, int(standard_product["id"]), 2)

    standard = checkout(client, headers, int(address["id"]), key="standard-threshold")

    assert standard.status_code == 201
    assert standard.json()["item_subtotal"] == "1000.00"
    assert standard.json()["delivery_fee"] == "0.00"
    assert standard.json()["total_amount"] == "1000.00"

    express_product = create_product(client, price="1000.00", stock=2)
    add_cart_item(client, headers, int(express_product["id"]))
    express = checkout(
        client,
        headers,
        int(address["id"]),
        delivery_method="express",
        key="express-threshold",
    )
    assert express.status_code == 201
    assert express.json()["delivery_fee"] == "89.90"
    assert express.json()["total_amount"] == "1089.90"


@pytest.mark.parametrize(
    ("subtotal", "method", "fee", "total"),
    [
        ("999.99", "standard", "49.90", "1049.89"),
        ("1000.00", "standard", "0.00", "1000.00"),
        ("1000.01", "standard", "0.00", "1000.01"),
        ("999.99", "express", "89.90", "1089.89"),
        ("1000.01", "express", "89.90", "1089.91"),
    ],
)
def test_delivery_pricing_at_one_kurus_boundaries(
    client: TestClient,
    subtotal: str,
    method: str,
    fee: str,
    total: str,
) -> None:
    headers = auth_headers(client, "delivery-boundary-buyer")
    address = create_address(client, headers, is_default=True).json()
    product = create_product(client, price=subtotal)
    add_cart_item(client, headers, int(product["id"]))

    response = checkout(client, headers, int(address["id"]), delivery_method=method)

    assert response.status_code == 201
    assert response.json()["item_subtotal"] == subtotal
    assert response.json()["delivery_fee"] == fee
    assert response.json()["total_amount"] == total


def test_invalid_checkout_body_does_not_change_cart_or_stock(client: TestClient, engine) -> None:
    headers = auth_headers(client, "invalid-delivery-buyer")
    address = create_address(client, headers).json()
    product = create_product(client, price="12.50")
    add_cart_item(client, headers, int(product["id"]))
    for payload in (
        {},
        {"address_id": address["id"]},
        {"address_id": address["id"], "delivery_method": "overnight"},
    ):
        response = client.post(
            "/api/v1/orders",
            json=payload,
            headers={**headers, "Idempotency-Key": "invalid-checkout"},
        )
        assert response.status_code == 422
    assert client.get("/api/v1/cart", headers=headers).json()["items"][0]["quantity"] == 1
    with Session(engine) as session:
        assert session.get(Product, product["id"]).stock == 5
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 0
        assert session.scalar(select(func.count()).select_from(Payment)) == 0


def test_legacy_order_without_delivery_snapshot_remains_readable(
    client: TestClient, engine
) -> None:
    headers = auth_headers(client, "legacy-delivery-buyer")
    address = create_address(client, headers).json()
    product = create_product(client, price="12.50")
    add_cart_item(client, headers, int(product["id"]))
    order = checkout(client, headers, int(address["id"])).json()
    with Session(engine) as session:
        stored_order = session.get(CustomerOrder, order["id"])
        assert stored_order is not None
        stored_order.shipping_recipient_name = None
        stored_order.delivery_method = None
        stored_order.delivery_fee = None
        stored_order.total_amount = Decimal("12.50")
        session.commit()

    response = client.get(f"/api/v1/orders/{order['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["shipping_address"] is None
    assert response.json()["delivery_method"] is None
    assert response.json()["delivery_fee"] == "0.00"
    assert response.json()["item_subtotal"] == "12.50"
    assert response.json()["total_amount"] == "12.50"


def test_below_threshold_fee_is_included_in_payment_and_order_total(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "delivery-fee-buyer")
    address = create_address(client, headers, is_default=True).json()
    product = create_product(client, price="500.00")
    add_cart_item(client, headers, int(product["id"]), 1)

    order = checkout(client, headers, int(address["id"]))
    payment = client.post(
        f"/api/v1/orders/{order.json()['id']}/payments",
        headers={**headers, "Idempotency-Key": "delivery-fee-payment"},
    )

    assert order.status_code == 201
    assert order.json()["item_subtotal"] == "500.00"
    assert order.json()["delivery_fee"] == "49.90"
    assert order.json()["total_amount"] == "549.90"
    assert payment.status_code == 201
    assert payment.json()["amount"] == "549.90"
    with Session(engine) as session:
        stored_order = session.get(CustomerOrder, order.json()["id"])
        assert stored_order is not None and stored_order.total_amount == Decimal("549.90")


def test_order_keeps_address_snapshot_when_address_is_edited_or_deleted(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "address-snapshot-buyer")
    address = create_address(client, headers, is_default=True).json()
    product = create_product(client, price="12.50")
    add_cart_item(client, headers, int(product["id"]))

    order = checkout(client, headers, int(address["id"]))
    assert order.status_code == 201
    order_id = order.json()["id"]
    snapshot = order.json()["shipping_address"]
    assert snapshot["city"] == "İstanbul"
    assert order.json()["delivery_method"] == "standard"

    update = client.put(
        f"/api/v1/addresses/{address['id']}",
        json=address_payload(city="Ankara", address_line="Başka Mahalle Yeni Cadde No 2"),
        headers=headers,
    )
    assert update.status_code == 200
    assert (
        client.get(f"/api/v1/orders/{order_id}", headers=headers).json()["shipping_address"]
        == snapshot
    )
    assert client.delete(f"/api/v1/addresses/{address['id']}", headers=headers).status_code == 204
    history = client.get(f"/api/v1/orders/{order_id}", headers=headers).json()
    assert history["shipping_address"] == snapshot
    assert history["delivery_fee"] == "49.90"


def test_checkout_idempotency_replay_preserves_original_snapshot_and_stock(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "delivery-idempotency-buyer")
    first_address = create_address(client, headers, is_default=True).json()
    second_address = create_address(client, headers, label="İş").json()
    product = create_product(client, price="12.50")
    add_cart_item(client, headers, int(product["id"]), 2)

    first = checkout(client, headers, int(first_address["id"]), key="same-delivery-key")
    replay = checkout(
        client,
        headers,
        int(second_address["id"]),
        delivery_method="express",
        key="same-delivery-key",
    )

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json() == first.json()
    with Session(engine) as session:
        assert session.get(Product, product["id"]).stock == 3
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 1
