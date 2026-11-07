from decimal import Decimal

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from shop_api.models import CartItem, CustomerOrder, OrderItem, Product


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


def create_product(
    client: TestClient,
    *,
    stock: int = 5,
    price: str = "10.00",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/products",
        json=product_payload(stock=stock, price=price),
        headers=auth_headers(client, "order-admin", ["admin"]),
    )
    assert response.status_code == 201
    return response.json()


def add_cart_item(
    client: TestClient,
    headers: dict[str, str],
    product_id: int,
    quantity: int = 1,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": quantity},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def checkout(
    client: TestClient,
    headers: dict[str, str],
    idempotency_key: str = "checkout-request-1",
):
    return client.post(
        "/api/v1/orders",
        json=create_checkout_request(client, headers),
        headers={**headers, "Idempotency-Key": idempotency_key},
    )


def test_checkout_creates_order_snapshots_decrements_stock_and_clears_cart(
    client: TestClient,
    engine,
) -> None:
    product = create_product(client, stock=5, price="12.50")
    buyer_headers = auth_headers(client, "checkout-success-buyer")
    add_cart_item(client, buyer_headers, int(product["id"]), 2)

    response = checkout(client, buyer_headers)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending_payment"
    assert body["item_subtotal"] == "25.00"
    assert body["delivery_fee"] == "49.90"
    assert body["total_amount"] == "74.90"
    assert body["items"] == [
        {
            "id": body["items"][0]["id"],
            "product_id": product["id"],
            "product_name": product["name"],
            "unit_price": "12.50",
            "quantity": 2,
            "line_total": "25.00",
        }
    ]
    assert client.get("/api/v1/cart", headers=buyer_headers).json() == {
        "items": [],
        "subtotal": "0.00",
    }

    with Session(engine) as session:
        stored_product = session.get(Product, product["id"])
        stored_order = session.get(CustomerOrder, body["id"])
        assert stored_product is not None and stored_product.stock == 3
        assert stored_order is not None
        assert stored_order.total_amount == Decimal("74.90")
        order_items = session.scalars(
            select(OrderItem).where(OrderItem.order_id == stored_order.id)
        ).all()
        assert len(order_items) == 1
        assert session.scalar(select(func.count()).select_from(CartItem)) == 0


def test_checkout_uses_current_catalog_price_and_keeps_snapshot_after_product_changes(
    client: TestClient,
) -> None:
    product = create_product(client, stock=5, price="12.50")
    buyer_headers = auth_headers(client, "checkout-snapshot-buyer")
    add_cart_item(client, buyer_headers, int(product["id"]), 2)
    updated_product = {
        **product_payload(stock=5, price="15.75"),
        "name": f"New {product['name']}",
    }
    update_response = client.put(
        f"/api/v1/products/{product['id']}",
        json=updated_product,
        headers=auth_headers(client, "order-admin", ["admin"]),
    )
    assert update_response.status_code == 200

    response = checkout(client, buyer_headers)

    assert response.status_code == 201
    assert response.json()["item_subtotal"] == "31.50"
    assert response.json()["total_amount"] == "81.40"
    assert response.json()["items"][0]["product_name"] == updated_product["name"]
    assert response.json()["items"][0]["unit_price"] == "15.75"

    delete_response = client.delete(
        f"/api/v1/products/{product['id']}",
        headers=auth_headers(client, "order-admin", ["admin"]),
    )
    assert delete_response.status_code == 204
    history = client.get("/api/v1/orders", headers=buyer_headers)
    assert history.status_code == 200
    assert history.json()[0]["items"][0]["product_id"] is None
    assert history.json()[0]["items"][0]["product_name"] == updated_product["name"]
    assert history.json()[0]["items"][0]["unit_price"] == "15.75"
    assert history.json()[0]["total_amount"] == "81.40"


def test_same_idempotency_key_replays_existing_order_without_new_stock_or_order(
    client: TestClient,
    engine,
) -> None:
    product = create_product(client, stock=5)
    buyer_headers = auth_headers(client, "checkout-idempotency-buyer")
    add_cart_item(client, buyer_headers, int(product["id"]), 2)

    original = checkout(client, buyer_headers, "same-key")
    replay = checkout(client, buyer_headers, "same-key")

    assert original.status_code == 201
    assert replay.status_code == 200
    assert replay.json() == original.json()
    with Session(engine) as session:
        stored_product = session.get(Product, product["id"])
        assert stored_product is not None and stored_product.stock == 3
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 1


def test_same_key_is_scoped_to_buyer_and_order_reads_are_private(
    client: TestClient,
) -> None:
    product = create_product(client, stock=5)
    first_headers = auth_headers(client, "checkout-first-buyer")
    second_headers = auth_headers(client, "checkout-second-buyer")
    add_cart_item(client, first_headers, int(product["id"]))
    first_order = checkout(client, first_headers, "shared-key")
    second_order = checkout(client, second_headers, "shared-key")

    assert first_order.status_code == 201
    assert second_order.status_code == 409
    order_id = first_order.json()["id"]
    assert client.get(f"/api/v1/orders/{order_id}", headers=first_headers).status_code == 200
    assert client.get(f"/api/v1/orders/{order_id}", headers=second_headers).status_code == 404
    assert client.get("/api/v1/orders", headers=second_headers).json() == []


def test_checkout_rejects_empty_or_unavailable_carts_without_mutation(
    client: TestClient,
    engine,
) -> None:
    buyer_headers = auth_headers(client, "checkout-invalid-buyer")
    assert checkout(client, buyer_headers).status_code == 409

    product = create_product(client, stock=3)
    add_cart_item(client, buyer_headers, int(product["id"]), 2)
    update_response = client.put(
        f"/api/v1/products/{product['id']}",
        json={
            **product_payload(stock=1),
            "name": product["name"],
        },
        headers=auth_headers(client, "order-admin", ["admin"]),
    )
    assert update_response.status_code == 200

    response = checkout(client, buyer_headers, "unavailable-stock")

    assert response.status_code == 409
    assert client.get("/api/v1/cart", headers=buyer_headers).json()["items"][0]["quantity"] == 2
    assert client.get("/api/v1/orders", headers=buyer_headers).json() == []
    with Session(engine) as session:
        stored_product = session.get(Product, product["id"])
        assert stored_product is not None and stored_product.stock == 1


def test_checkout_rejects_an_existing_but_empty_cart(client: TestClient) -> None:
    product = create_product(client)
    buyer_headers = auth_headers(client, "checkout-empty-cart-buyer")
    cart = add_cart_item(client, buyer_headers, int(product["id"]))
    cart_item_id = cart["items"][0]["id"]
    assert (
        client.delete(f"/api/v1/cart/items/{cart_item_id}", headers=buyer_headers).status_code
        == 204
    )

    response = checkout(client, buyer_headers, "empty-cart-key")

    assert response.status_code == 409
    assert response.json()["detail"] == "Sipariş oluşturmak için sepetinde ürün olmalıdır."


def test_checkout_rejects_cart_items_for_deleted_products(client: TestClient) -> None:
    product = create_product(client)
    buyer_headers = auth_headers(client, "checkout-deleted-product-buyer")
    add_cart_item(client, buyer_headers, int(product["id"]))
    deletion = client.delete(
        f"/api/v1/products/{product['id']}",
        headers=auth_headers(client, "order-admin", ["admin"]),
    )
    assert deletion.status_code == 204

    response = checkout(client, buyer_headers, "deleted-product-key")

    assert response.status_code == 409
    assert "artık mevcut olmayan ürün" in response.json()["detail"]
    cart = client.get("/api/v1/cart", headers=buyer_headers).json()
    assert cart["items"][0]["product_id"] is None
    assert cart["items"][0]["quantity"] == 1


def test_checkout_requires_buyer_and_valid_idempotency_key(client: TestClient) -> None:
    assert client.post("/api/v1/orders").status_code == 401
    assert (
        client.post(
            "/api/v1/orders",
            headers={
                **auth_headers(client, "checkout-seller", ["seller"]),
                "Idempotency-Key": "valid-key",
            },
            json={"address_id": 1, "delivery_method": "standard"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/orders",
            headers={
                **auth_headers(client, "checkout-invalid-key"),
                "Idempotency-Key": "contains spaces",
            },
            json=create_checkout_request(client, auth_headers(client, "checkout-invalid-key")),
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/orders",
            headers=auth_headers(client, "checkout-missing-key"),
            json=create_checkout_request(
                client,
                auth_headers(client, "checkout-missing-key"),
            ),
        ).status_code
        == 422
    )


def test_checkout_rolls_back_order_stock_and_cart_after_transaction_failure(
    client: TestClient,
    engine,
) -> None:
    product = create_product(client, stock=5)
    buyer_headers = auth_headers(client, "checkout-rollback-buyer")
    add_cart_item(client, buyer_headers, int(product["id"]), 2)
    create_checkout_request(client, buyer_headers)

    def fail_before_commit(session) -> None:
        if session.bind is engine:
            raise RuntimeError("Injected transaction failure")

    event.listen(Session, "before_commit", fail_before_commit)
    try:
        failing_client = TestClient(client.app, raise_server_exceptions=False)
        response = checkout(failing_client, buyer_headers, "rollback-key")
    finally:
        event.remove(Session, "before_commit", fail_before_commit)

    assert response.status_code == 500
    assert client.get("/api/v1/cart", headers=buyer_headers).json()["items"][0]["quantity"] == 2
    assert client.get("/api/v1/orders", headers=buyer_headers).json() == []
    with Session(engine) as session:
        stored_product = session.get(Product, product["id"])
        assert stored_product is not None and stored_product.stock == 5
