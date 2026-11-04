import os
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
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
from shop_api.models import Base, Cart, CartItem, Product

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
