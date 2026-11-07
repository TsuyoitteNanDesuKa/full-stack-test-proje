import json
import os
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from conftest import TEST_PRIVATE_KEY, StaticJwksClient, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.config import Settings, get_settings
from shop_api.database import create_database_engine
from shop_api.main import create_app
from shop_api.models import (
    Base,
    Cart,
    CartItem,
    CustomerOrder,
    OrderItem,
    OrderStatusEvent,
    Payment,
    PaymentWebhookEvent,
    Product,
    ProductReturn,
)
from shop_api.payment_expiry import expire_due_payments
from shop_api.payment_providers import sign_webhook_body

POSTGRES_TEST_DATABASE_URL = os.getenv("SHOP_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not POSTGRES_TEST_DATABASE_URL,
        reason="Set SHOP_TEST_DATABASE_URL to run PostgreSQL integration tests.",
    ),
]


@pytest.fixture
def postgres_engine(monkeypatch: pytest.MonkeyPatch) -> Iterator[Engine]:
    if not POSTGRES_TEST_DATABASE_URL:
        pytest.skip("Set SHOP_TEST_DATABASE_URL to run PostgreSQL integration tests.")

    url = make_url(POSTGRES_TEST_DATABASE_URL)
    if url.get_backend_name() != "postgresql" or not (url.database or "").endswith("_test"):
        pytest.fail(
            "SHOP_TEST_DATABASE_URL must target a dedicated PostgreSQL database ending in _test."
        )

    database_url = url.render_as_string(hide_password=False)
    monkeypatch.setenv("SHOP_DATABASE_URL", database_url)
    get_settings.cache_clear()

    api_root = os.path.dirname(os.path.dirname(__file__))
    alembic_config = Config(os.path.join(api_root, "alembic.ini"))
    alembic_config.set_main_option("script_location", os.path.join(api_root, "migrations"))
    engine: Engine | None = None
    try:
        command.upgrade(alembic_config, "head")
        engine = create_database_engine(database_url)
        with engine.begin() as connection:
            table_names = ", ".join(
                engine.dialect.identifier_preparer.quote(table.name)
                for table in Base.metadata.sorted_tables
            )
            connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))

        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        get_settings.cache_clear()


@pytest.fixture
def postgres_client(postgres_engine: Engine) -> Iterator[TestClient]:
    with _client_for_engine(postgres_engine) as client:
        yield client


def _client_for_engine(engine: Engine) -> TestClient:
    app = create_app(
        settings=Settings(database_url=str(engine.url)),
        db_engine=engine,
    )
    app.state.test_private_key = TEST_PRIVATE_KEY
    app.state.jwks_client = StaticJwksClient(TEST_PRIVATE_KEY.public_key())
    return TestClient(app)


def _auth_headers(
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


def _create_product(client: TestClient, *, stock: int) -> int:
    response = client.post(
        "/api/v1/products",
        json=product_payload(stock=stock),
        headers=_auth_headers(client, "postgres-cart-admin", ["admin"]),
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_postgres_product_filters_match_search_and_price_boundaries(
    postgres_client: TestClient,
) -> None:
    headers = _auth_headers(postgres_client, "postgres-filter-admin", ["admin"])
    products = [
        product_payload(
            name="Postgres Lavanta Kremi",
            category="Kişisel Bakım",
            description="Lavanta özlü nemlendirici krem.",
            price="100.00",
        ),
        product_payload(
            name="Postgres Lavanta Sabunu",
            category="Kişisel Bakım",
            description="Doğal sabun.",
            price="150.00",
        ),
        product_payload(
            name="Postgres Lavanta Mumu",
            category="Ev Yaşam",
            description="Kokulu ev mumu.",
            price="150.01",
        ),
    ]
    for product in products:
        assert (
            postgres_client.post(
                "/api/v1/products",
                json=product,
                headers=headers,
            ).status_code
            == 201
        )

    response = postgres_client.get(
        "/api/v1/products?search=LAVANTA&category=kişisel%20bakım"
        "&min_price=100&max_price=150&sort=price_desc",
        headers=_auth_headers(postgres_client, "postgres-filter-buyer"),
    )

    assert response.status_code == 200
    result = response.json()
    assert result["total"] == 2
    assert [product["name"] for product in result["products"]] == [
        "Postgres Lavanta Sabunu",
        "Postgres Lavanta Kremi",
    ]


def _add_item(
    engine: Engine,
    barrier: Barrier,
    *,
    subject: str,
    product_id: int,
    quantity: int = 1,
) -> int:
    with _client_for_engine(engine) as client:
        headers = _auth_headers(client, subject)
        barrier.wait(timeout=10)
        response = client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": quantity},
            headers=headers,
        )
        return response.status_code


def _cart_counts(engine: Engine) -> tuple[int, int, int]:
    with Session(engine) as session:
        cart_count = session.scalar(select(func.count()).select_from(Cart))
        item_count = session.scalar(select(func.count()).select_from(CartItem))
        quantity = session.scalar(select(func.coalesce(func.sum(CartItem.quantity), 0)))
        return cart_count or 0, item_count or 0, quantity or 0


def _checkout(
    engine: Engine,
    barrier: Barrier,
    *,
    subject: str,
    idempotency_key: str,
) -> tuple[int, int | None]:
    with _client_for_engine(engine) as client:
        headers = _auth_headers(client, subject)
        headers["Idempotency-Key"] = idempotency_key
        barrier.wait(timeout=10)
        response = client.post("/api/v1/orders", headers=headers)
        order_id = response.json().get("id") if response.status_code in {200, 201} else None
        return response.status_code, order_id


def _submit_product_return(
    engine: Engine,
    barrier: Barrier,
    *,
    subject: str,
    order_id: int,
    order_item_id: int,
    idempotency_key: str,
) -> int:
    with _client_for_engine(engine) as client:
        headers = _auth_headers(client, subject)
        headers["Idempotency-Key"] = idempotency_key
        barrier.wait(timeout=10)
        response = client.post(
            f"/api/v1/orders/{order_id}/returns",
            json={
                "order_item_id": order_item_id,
                "quantity": 1,
                "reason": "Concurrent return request",
            },
            headers=headers,
        )
        return response.status_code


def _send_signed_payment_event(
    engine: Engine,
    *,
    event_id: str,
    payment_reference: str,
    status: str,
    amount: str,
) -> tuple[int, bool]:
    body = json.dumps(
        {
            "event_id": event_id,
            "payment_reference": payment_reference,
            "status": status,
            "amount": amount,
            "currency": "TRY",
        },
        separators=(",", ":"),
    ).encode()
    signature = sign_webhook_body(body, "local-mock-payment-webhook-secret")
    app = create_app(
        settings=Settings(database_url=str(engine.url)),
        db_engine=engine,
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/payments/webhook",
            content=body,
            headers={"X-Payment-Signature": signature},
        )
        return response.status_code, response.json().get("duplicate", False)


def test_postgres_cart_api_persists_and_enforces_stock(postgres_client: TestClient) -> None:
    product_id = _create_product(postgres_client, stock=3)
    headers = _auth_headers(postgres_client, "postgres-cart-buyer")

    first_add = postgres_client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": 2},
        headers=headers,
    )
    assert first_add.status_code == 200
    assert first_add.json()["items"][0]["quantity"] == 2

    overstock_add = postgres_client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": 2},
        headers=headers,
    )
    assert overstock_add.status_code == 409
    assert postgres_client.get("/api/v1/cart", headers=headers).json()["items"][0]["quantity"] == 2


def test_postgres_concurrent_first_add_creates_one_cart_and_accumulates_quantity(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    product_id = _create_product(postgres_client, stock=20)
    workers = 8
    barrier = Barrier(workers)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        statuses = list(
            executor.map(
                lambda _: _add_item(
                    postgres_engine,
                    barrier,
                    subject="postgres-concurrent-buyer",
                    product_id=product_id,
                ),
                range(workers),
            )
        )

    assert statuses == [200] * workers
    assert _cart_counts(postgres_engine) == (1, 1, workers)


def test_postgres_concurrent_adds_by_one_buyer_cannot_exceed_stock(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    stock = 4
    product_id = _create_product(postgres_client, stock=stock)
    workers = 12
    barrier = Barrier(workers)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        statuses = list(
            executor.map(
                lambda index: _add_item(
                    postgres_engine,
                    barrier,
                    subject="postgres-stock-boundary-buyer",
                    product_id=product_id,
                ),
                range(workers),
            )
        )

    assert statuses.count(200) == stock
    assert statuses.count(409) == workers - stock
    assert set(statuses) <= {200, 409}
    assert _cart_counts(postgres_engine) == (1, 1, stock)
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        assert product is not None
        assert product.stock == stock


def test_postgres_carts_do_not_reserve_stock_across_buyers(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    stock = 4
    product_id = _create_product(postgres_client, stock=stock)
    workers = 8
    barrier = Barrier(workers)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        statuses = list(
            executor.map(
                lambda index: _add_item(
                    postgres_engine,
                    barrier,
                    subject=f"postgres-independent-buyer-{index}",
                    product_id=product_id,
                    quantity=stock,
                ),
                range(workers),
            )
        )

    assert statuses == [200] * workers
    assert _cart_counts(postgres_engine) == (workers, workers, workers * stock)
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        assert product is not None
        assert product.stock == stock


def test_postgres_product_deletion_preserves_cart_line_for_removal(
    postgres_client: TestClient,
) -> None:
    product_id = _create_product(postgres_client, stock=5)
    buyer_headers = _auth_headers(postgres_client, "postgres-deleted-product-buyer")
    add_response = postgres_client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": 1},
        headers=buyer_headers,
    )
    assert add_response.status_code == 200
    cart_item_id = add_response.json()["items"][0]["id"]
    product_name = add_response.json()["items"][0]["product_name"]

    delete_response = postgres_client.delete(
        f"/api/v1/products/{product_id}",
        headers=_auth_headers(postgres_client, "postgres-cart-admin", ["admin"]),
    )

    assert delete_response.status_code == 204
    cart_response = postgres_client.get("/api/v1/cart", headers=buyer_headers)
    assert cart_response.status_code == 200
    assert cart_response.json() == {
        "items": [
            {
                "id": cart_item_id,
                "product_id": None,
                "product_name": product_name,
                "unit_price": None,
                "quantity": 1,
                "available_stock": None,
                "is_available": False,
                "line_total": None,
            }
        ],
        "subtotal": "0.00",
    }

    remove_response = postgres_client.delete(
        f"/api/v1/cart/items/{cart_item_id}",
        headers=buyer_headers,
    )
    assert remove_response.status_code == 204
    assert postgres_client.get("/api/v1/cart", headers=buyer_headers).json() == {
        "items": [],
        "subtotal": "0.00",
    }


def test_postgres_constraint_blocks_duplicate_product_rows(
    postgres_client: TestClient,
    postgres_engine: Engine,
) -> None:
    product_id = _create_product(postgres_client, stock=5)
    headers = _auth_headers(postgres_client, "postgres-unique-cart-buyer")

    assert (
        postgres_client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": 1},
            headers=headers,
        ).status_code
        == 200
    )
    with Session(postgres_engine) as session:
        cart = session.scalar(
            select(Cart).where(Cart.owner_subject == "postgres-unique-cart-buyer")
        )
        assert cart is not None
        duplicate = CartItem(
            cart_id=cart.id,
            product_id=product_id,
            product_name="Duplicate product",
            quantity=1,
            created_at=cart.created_at,
            updated_at=cart.updated_at,
        )
        session.add(duplicate)
        with pytest.raises(IntegrityError) as error:
            session.commit()
        assert "uq_cart_items_cart_product" in str(error.value)
        session.rollback()


def test_postgres_concurrent_checkout_replays_one_order_for_same_idempotency_key(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    product_id = _create_product(postgres_client, stock=5)
    buyer_subject = "postgres-checkout-idempotent-buyer"
    headers = _auth_headers(postgres_client, buyer_subject)
    cart_response = postgres_client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": 2},
        headers=headers,
    )
    assert cart_response.status_code == 200
    workers = 8
    barrier = Barrier(workers)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(
            executor.map(
                lambda _: _checkout(
                    postgres_engine,
                    barrier,
                    subject=buyer_subject,
                    idempotency_key="parallel-same-key",
                ),
                range(workers),
            )
        )

    statuses = [status_code for status_code, _ in results]
    order_ids = {order_id for _, order_id in results}
    assert statuses.count(201) == 1
    assert statuses.count(200) == workers - 1
    assert len(order_ids) == 1
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 3
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 1
        assert _cart_counts(postgres_engine) == (1, 0, 0)


def test_postgres_competing_buyers_cannot_checkout_last_units(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    available_stock = 3
    product_id = _create_product(postgres_client, stock=available_stock)
    buyer_subjects = [f"postgres-last-stock-buyer-{index}" for index in range(2)]
    for buyer_subject in buyer_subjects:
        response = postgres_client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": available_stock},
            headers=_auth_headers(postgres_client, buyer_subject),
        )
        assert response.status_code == 200
    barrier = Barrier(len(buyer_subjects))

    with ThreadPoolExecutor(max_workers=len(buyer_subjects)) as executor:
        results = list(
            executor.map(
                lambda index: _checkout(
                    postgres_engine,
                    barrier,
                    subject=buyer_subjects[index],
                    idempotency_key=f"last-stock-checkout-{index}",
                ),
                range(len(buyer_subjects)),
            )
        )

    statuses = [status_code for status_code, _ in results]
    assert statuses.count(201) == 1
    assert statuses.count(409) == 1
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 0
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 1
        cart_quantity = session.scalar(select(func.coalesce(func.sum(CartItem.quantity), 0)))
        assert cart_quantity == available_stock


def test_postgres_duplicate_payment_webhook_restores_stock_once(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    product_id = _create_product(postgres_client, stock=5)
    buyer_subject = "postgres-payment-webhook-buyer"
    headers = _auth_headers(postgres_client, buyer_subject)
    assert (
        postgres_client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": 2},
            headers=headers,
        ).status_code
        == 200
    )
    order_response = postgres_client.post(
        "/api/v1/orders",
        headers={**headers, "Idempotency-Key": "postgres-payment-order"},
    )
    assert order_response.status_code == 201
    payment_response = postgres_client.post(
        f"/api/v1/orders/{order_response.json()['id']}/payments",
        headers={**headers, "Idempotency-Key": "postgres-payment-start"},
    )
    assert payment_response.status_code == 201
    payment_reference = payment_response.json()["provider_reference"]
    payment_amount = order_response.json()["total_amount"]
    workers = 6

    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(
            executor.map(
                lambda _: _send_signed_payment_event(
                    postgres_engine,
                    event_id="postgres-payment-failure",
                    payment_reference=payment_reference,
                    status="failed",
                    amount=payment_amount,
                ),
                range(workers),
            )
        )

    assert [status_code for status_code, _ in results] == [200] * workers
    assert sum(duplicate for _, duplicate in results) == workers - 1
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 5
        assert session.scalar(select(func.count()).select_from(PaymentWebhookEvent)) == 1


def test_postgres_concurrent_admin_refunds_restore_inventory_once(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    product_id = _create_product(postgres_client, stock=5)
    buyer_subject = "postgres-admin-refund-buyer"
    buyer_headers = _auth_headers(postgres_client, buyer_subject)
    assert (
        postgres_client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": 2},
            headers=buyer_headers,
        ).status_code
        == 200
    )
    order_response = postgres_client.post(
        "/api/v1/orders",
        headers={**buyer_headers, "Idempotency-Key": "postgres-refund-order"},
    )
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]
    payment_response = postgres_client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**buyer_headers, "Idempotency-Key": "postgres-refund-payment"},
    )
    assert payment_response.status_code == 201
    payment = payment_response.json()
    assert (
        _send_signed_payment_event(
            postgres_engine,
            event_id="postgres-refund-success",
            payment_reference=payment["provider_reference"],
            status="succeeded",
            amount=payment["amount"],
        )[0]
        == 200
    )

    workers = 6
    barrier = Barrier(workers)
    admin_token = _auth_headers(postgres_client, "postgres-refund-admin", ["admin"])

    def refund(_: int) -> int:
        with _client_for_engine(postgres_engine) as client:
            barrier.wait(timeout=10)
            response = client.post(
                f"/api/v1/admin/orders/{order_id}/refund",
                json={"reason": "Concurrent test refund"},
                headers=admin_token,
            )
            return response.status_code

    with ThreadPoolExecutor(max_workers=workers) as executor:
        statuses = list(executor.map(refund, range(workers)))

    assert statuses == [200] * workers
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        order = session.get(CustomerOrder, order_id)
        stored_payment = session.get(Payment, payment["id"])
        refund_event_count = session.scalar(
            select(func.count())
            .select_from(OrderStatusEvent)
            .where(
                OrderStatusEvent.order_id == order_id,
                OrderStatusEvent.action == "admin_refund",
            )
        )
        assert product is not None and product.stock == 5
        assert order is not None and order.status == "cancelled"
        assert stored_payment is not None and stored_payment.status == "refunded"
        assert refund_event_count == 1


def test_postgres_concurrent_return_requests_cannot_exceed_order_item_quantity(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    subject = "postgres-return-race-buyer"
    buyer_headers = _auth_headers(postgres_client, subject)
    product_id = _create_product(postgres_client, stock=5)
    assert (
        postgres_client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": 1},
            headers=buyer_headers,
        ).status_code
        == 200
    )
    order_response = postgres_client.post(
        "/api/v1/orders",
        headers={**buyer_headers, "Idempotency-Key": "postgres-return-race-order"},
    )
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]
    order_item_id = order_response.json()["items"][0]["id"]
    payment_response = postgres_client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**buyer_headers, "Idempotency-Key": "postgres-return-race-payment"},
    )
    assert payment_response.status_code == 201
    payment = payment_response.json()
    assert (
        _send_signed_payment_event(
            postgres_engine,
            event_id="postgres-return-race-success",
            payment_reference=payment["provider_reference"],
            status="succeeded",
            amount=payment["amount"],
        )[0]
        == 200
    )

    admin_headers = _auth_headers(postgres_client, "postgres-return-race-admin", ["admin"])
    for next_status in ("processing", "shipped"):
        assert (
            postgres_client.patch(
                f"/api/v1/admin/orders/{order_id}/status",
                json={"status": next_status},
                headers=admin_headers,
            ).status_code
            == 200
        )

    barrier = Barrier(2)
    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(
            executor.map(
                lambda key: _submit_product_return(
                    postgres_engine,
                    barrier,
                    subject=subject,
                    order_id=order_id,
                    order_item_id=order_item_id,
                    idempotency_key=key,
                ),
                ("postgres-return-race-a", "postgres-return-race-b"),
            )
        )

    assert sorted(statuses) == [201, 409]
    with Session(postgres_engine) as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(ProductReturn)
                .where(ProductReturn.order_id == order_id)
            )
            == 1
        )
        product = session.get(Product, product_id)
        payment_record = session.scalar(select(Payment).where(Payment.order_id == order_id))
        assert product is not None and product.stock == 5
        assert payment_record is not None and payment_record.status == "refunded"


def test_postgres_concurrent_expiry_restores_inventory_once(
    postgres_engine: Engine,
    postgres_client: TestClient,
) -> None:
    product_id = _create_product(postgres_client, stock=5)
    headers = _auth_headers(postgres_client, "postgres-payment-expiry-buyer")
    assert (
        postgres_client.post(
            "/api/v1/cart/items",
            json={"product_id": product_id, "quantity": 2},
            headers=headers,
        ).status_code
        == 200
    )
    order = postgres_client.post(
        "/api/v1/orders",
        headers={**headers, "Idempotency-Key": "postgres-expiry-order"},
    )
    payment = postgres_client.post(
        f"/api/v1/orders/{order.json()['id']}/payments",
        headers={**headers, "Idempotency-Key": "postgres-expiry-payment"},
    )
    payment_id = payment.json()["id"]
    with Session(postgres_engine) as session:
        stored_payment = session.get(Payment, payment_id)
        assert stored_payment is not None
        stored_payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()

    def run_expiry(_: int) -> int:
        with Session(postgres_engine) as session:
            return expire_due_payments(session)

    with ThreadPoolExecutor(max_workers=2) as executor:
        expiry_counts = list(executor.map(run_expiry, range(2)))

    assert sum(expiry_counts) == 1
    with Session(postgres_engine) as session:
        product = session.get(Product, product_id)
        stored_payment = session.get(Payment, payment_id)
        items = session.scalars(
            select(OrderItem).where(OrderItem.order_id == payment.json()["order_id"])
        ).all()
        assert product is not None and product.stock == 5
        assert stored_payment is not None and stored_payment.status == "expired"
        assert len(items) == 1
