from datetime import UTC, datetime
from decimal import Decimal

import pytest
from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from shop_api.models import Cart, CartItem
from shop_api.routes.cart import _get_or_create_cart


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
        headers=auth_headers(client, "cart-admin", ["admin"]),
    )
    assert response.status_code == 201
    return response.json()


def add_item(
    client: TestClient,
    buyer_headers: dict[str, str],
    product_id: int,
    quantity: int = 1,
):
    return client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": quantity},
        headers=buyer_headers,
    )


def test_cart_requires_a_buyer_role_and_returns_empty_for_a_new_buyer(
    client: TestClient,
) -> None:
    assert client.get("/api/v1/cart").status_code == 401
    assert (
        client.get(
            "/api/v1/cart",
            headers=auth_headers(client, "seller-cart-user", ["seller"]),
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/api/v1/cart",
            headers=auth_headers(client, "admin-cart-user", ["admin"]),
        ).status_code
        == 403
    )

    response = client.get(
        "/api/v1/cart",
        headers=auth_headers(client, "empty-cart-buyer"),
    )

    assert response.status_code == 200
    assert response.json() == {"items": [], "subtotal": "0.00"}


def test_buyer_can_add_and_readd_product_with_current_price_and_total(
    client: TestClient,
) -> None:
    product = create_product(client, stock=5, price="12.50")
    headers = auth_headers(client, "adding-cart-buyer")

    first_add = add_item(client, headers, int(product["id"]), 2)
    second_add = add_item(client, headers, int(product["id"]), 1)

    assert first_add.status_code == 200
    assert first_add.json()["subtotal"] == "25.00"
    assert second_add.status_code == 200
    assert second_add.json() == {
        "items": [
            {
                "id": first_add.json()["items"][0]["id"],
                "product_id": product["id"],
                "product_name": product["name"],
                "unit_price": "12.50",
                "quantity": 3,
                "available_stock": 5,
                "is_available": True,
                "line_total": "37.50",
            }
        ],
        "subtotal": "37.50",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"product_id": 1, "quantity": 0},
        {"product_id": 1, "quantity": -1},
        {"product_id": 1, "quantity": 1.5},
        {"product_id": 1, "quantity": "2"},
        {"product_id": 1, "quantity": 1_000_000},
        {"product_id": 0, "quantity": 1},
    ],
    ids=[
        "zero-quantity",
        "negative-quantity",
        "fractional-quantity",
        "string-quantity",
        "quantity-over-limit",
        "invalid-product-id",
    ],
)
def test_add_rejects_invalid_quantity_or_product_id(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    response = client.post(
        "/api/v1/cart/items",
        json=payload,
        headers=auth_headers(client, "invalid-cart-buyer"),
    )

    assert response.status_code == 422
    assert client.get(
        "/api/v1/cart",
        headers=auth_headers(client, "invalid-cart-buyer"),
    ).json() == {"items": [], "subtotal": "0.00"}


def test_add_rejects_missing_product_without_persisting_an_empty_cart(
    client: TestClient,
    engine,
) -> None:
    response = add_item(client, auth_headers(client, "missing-product-buyer"), 999)

    assert response.status_code == 404
    with sessionmaker(bind=engine, class_=Session)() as session:
        assert session.scalar(select(func.count()).select_from(Cart)) == 0


def test_add_rejects_stock_excess_and_preserves_existing_quantity(
    client: TestClient,
) -> None:
    product = create_product(client, stock=3)
    headers = auth_headers(client, "stock-limited-buyer")
    added = add_item(client, headers, int(product["id"]), 2)

    initial_excess = add_item(client, headers, int(product["id"]), 2)
    exact_stock = add_item(client, headers, int(product["id"]), 1)
    existing_excess = add_item(client, headers, int(product["id"]), 1)

    assert added.status_code == 200
    assert initial_excess.status_code == 409
    assert exact_stock.status_code == 200
    assert existing_excess.status_code == 409
    assert client.get("/api/v1/cart", headers=headers).json()["items"][0]["quantity"] == 3


def test_buyer_can_update_and_remove_only_their_own_cart_item(
    client: TestClient,
) -> None:
    product = create_product(client, stock=8)
    first_headers = auth_headers(client, "first-cart-owner")
    second_headers = auth_headers(client, "second-cart-owner")
    added = add_item(client, first_headers, int(product["id"]), 2)
    item_id = added.json()["items"][0]["id"]
    second_added = add_item(client, second_headers, int(product["id"]), 1)
    second_item_id = second_added.json()["items"][0]["id"]

    updated = client.put(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 4},
        headers=first_headers,
    )
    foreign_get = client.get("/api/v1/cart", headers=second_headers)
    foreign_update = client.put(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 1},
        headers=second_headers,
    )
    foreign_delete = client.delete(
        f"/api/v1/cart/items/{item_id}",
        headers=second_headers,
    )
    missing_update = client.put(
        "/api/v1/cart/items/999999",
        json={"quantity": 1},
        headers=first_headers,
    )

    assert updated.status_code == 200
    assert updated.json()["items"][0]["quantity"] == 4
    assert [item["id"] for item in foreign_get.json()["items"]] == [second_item_id]
    assert foreign_update.status_code == 404
    assert foreign_delete.status_code == 404
    assert missing_update.status_code == 404

    removed = client.delete(f"/api/v1/cart/items/{item_id}", headers=first_headers)
    assert removed.status_code == 204
    assert client.get("/api/v1/cart", headers=first_headers).json() == {
        "items": [],
        "subtotal": "0.00",
    }


def test_update_and_delete_return_not_found_when_buyer_has_no_cart(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "cartless-buyer")

    update = client.put(
        "/api/v1/cart/items/1",
        json={"quantity": 1},
        headers=headers,
    )
    delete = client.delete("/api/v1/cart/items/1", headers=headers)

    assert update.status_code == 404
    assert delete.status_code == 404


def test_update_rejects_invalid_quantities_and_stock_excess_without_changes(
    client: TestClient,
) -> None:
    product = create_product(client, stock=4)
    headers = auth_headers(client, "updating-cart-buyer")
    added = add_item(client, headers, int(product["id"]), 2)
    item_id = added.json()["items"][0]["id"]
    invalid = client.put(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 0},
        headers=headers,
    )
    excessive = client.put(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 5},
        headers=headers,
    )

    assert invalid.status_code == 422
    assert excessive.status_code == 409
    assert client.get("/api/v1/cart", headers=headers).json()["items"][0]["quantity"] == 2


def test_cart_reads_current_price_and_marks_reduced_stock_unavailable(
    client: TestClient,
) -> None:
    product = create_product(client, stock=5, price="10.00")
    headers = auth_headers(client, "changing-stock-buyer")
    added = add_item(client, headers, int(product["id"]), 2)
    item_id = added.json()["items"][0]["id"]
    updated_product = client.put(
        f"/api/v1/products/{product['id']}",
        json=product_payload(stock=1, price="15.00"),
        headers=auth_headers(client, "cart-admin", ["admin"]),
    )

    cart = client.get("/api/v1/cart", headers=headers)
    update = client.put(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 1},
        headers=headers,
    )

    assert updated_product.status_code == 200
    assert cart.json()["items"][0] == {
        "id": item_id,
        "product_id": product["id"],
        "product_name": updated_product.json()["name"],
        "unit_price": "15.00",
        "quantity": 2,
        "available_stock": 1,
        "is_available": False,
        "line_total": None,
    }
    assert cart.json()["subtotal"] == "0.00"
    assert update.status_code == 200
    assert update.json()["subtotal"] == "15.00"


def test_deleted_product_remains_unavailable_until_buyer_removes_cart_item(
    client: TestClient,
) -> None:
    product = create_product(client)
    buyer_headers = auth_headers(client, "deleted-product-buyer")
    added = add_item(client, buyer_headers, int(product["id"]), 1)
    item_id = added.json()["items"][0]["id"]
    updated = client.put(
        f"/api/v1/products/{product['id']}",
        json=product_payload(name="Updated Cart Item"),
        headers=auth_headers(client, "cart-admin", ["admin"]),
    )
    deleted = client.delete(
        f"/api/v1/products/{product['id']}",
        headers=auth_headers(client, "cart-admin", ["admin"]),
    )

    cart = client.get("/api/v1/cart", headers=buyer_headers)
    update = client.put(
        f"/api/v1/cart/items/{item_id}",
        json={"quantity": 2},
        headers=buyer_headers,
    )
    remove = client.delete(f"/api/v1/cart/items/{item_id}", headers=buyer_headers)

    assert updated.status_code == 200
    assert deleted.status_code == 204
    assert cart.json() == {
        "items": [
            {
                "id": item_id,
                "product_id": None,
                "product_name": "Updated Cart Item",
                "unit_price": None,
                "quantity": 1,
                "available_stock": None,
                "is_available": False,
                "line_total": None,
            }
        ],
        "subtotal": "0.00",
    }
    assert update.status_code == 409
    assert remove.status_code == 204


def test_failed_cart_commit_does_not_leave_cart_or_item_persisted(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    product = create_product(client)

    def fail_commit(_session: Session) -> None:
        raise IntegrityError("INSERT cart_items", {}, Exception("simulated failure"))

    monkeypatch.setattr(Session, "commit", fail_commit)
    non_raising_client = TestClient(client.app, raise_server_exceptions=False)
    response = add_item(
        non_raising_client,
        auth_headers(non_raising_client, "rollback-cart-buyer"),
        int(product["id"]),
    )

    assert response.status_code == 500
    with sessionmaker(bind=engine, class_=Session)() as session:
        assert session.scalar(select(func.count()).select_from(Cart)) == 0
        assert session.scalar(select(func.count()).select_from(CartItem)) == 0


def test_cart_creation_recovers_when_another_request_creates_the_owner_cart_first(
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_flush = Session.flush

    def create_competing_cart(session: Session, objects=None) -> None:
        if not any(isinstance(item, Cart) for item in session.new):
            original_flush(session, objects)
            return
        session.rollback()
        now = datetime.now(UTC)
        with engine.begin() as connection:
            connection.execute(
                Cart.__table__.insert().values(
                    owner_subject="concurrent-cart-owner",
                    created_at=now,
                    updated_at=now,
                )
            )
        raise IntegrityError("INSERT carts", {}, Exception("unique owner"))

    monkeypatch.setattr(Session, "flush", create_competing_cart)
    with Session(engine) as session:
        cart = _get_or_create_cart(session, "concurrent-cart-owner")

    assert cart.owner_subject == "concurrent-cart-owner"


def test_cart_response_uses_decimal_arithmetic(client: TestClient) -> None:
    product = create_product(client, stock=3, price="0.10")
    response = add_item(
        client,
        auth_headers(client, "decimal-cart-buyer"),
        int(product["id"]),
        3,
    )

    assert response.status_code == 200
    assert Decimal(response.json()["subtotal"]) == Decimal("0.30")
