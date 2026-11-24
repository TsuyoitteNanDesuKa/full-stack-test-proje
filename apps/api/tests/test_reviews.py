from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from test_admin_orders import auth_headers, create_order

from shop_api.config import get_settings
from shop_api.database import create_database_engine
from shop_api.models import CustomerOrder, OrderFulfillment, OrderItem, Product, ProductReview

PAYLOAD = {"rating": 5, "comment": "  Çok güzel bir ürün.  "}


def deliver(client: TestClient, order_id: int) -> None:
    admin = auth_headers(client, "review-admin", ["admin"])
    for next_status in ("processing", "shipped", "delivered"):
        result = client.patch(
            f"/api/v1/admin/orders/{order_id}/status",
            headers=admin,
            json={"status": next_status},
        )
        assert result.status_code == 200


def test_review_requires_delivered_own_product_and_buyer_role(
    client: TestClient, engine: Engine
) -> None:
    buyer = auth_headers(client, "review-buyer")
    other = auth_headers(client, "review-other")
    seller = auth_headers(client, "review-seller", ["seller"])
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    path = f"/api/v1/products/{product_id}/reviews"
    assert client.get(path).status_code == 401
    assert client.put(f"{path}/me", json=PAYLOAD).status_code == 401
    assert client.delete(f"{path}/me").status_code == 401
    assert client.put(f"{path}/me", headers=seller, json=PAYLOAD).status_code == 403
    assert client.delete(f"{path}/me", headers=seller).status_code == 403
    assert client.put(f"{path}/me", headers=buyer, json=PAYLOAD).status_code == 403
    assert client.get(path, headers=buyer).json()["can_review"] is False
    admin = auth_headers(client, "review-admin", ["admin"])
    for state in ("processing", "shipped"):
        assert (
            client.patch(
                f"/api/v1/admin/orders/{order_id}/status", headers=admin, json={"status": state}
            ).status_code
            == 200
        )
        assert client.put(f"{path}/me", headers=buyer, json=PAYLOAD).status_code == 403
    assert (
        client.patch(
            f"/api/v1/admin/orders/{order_id}/status", headers=admin, json={"status": "delivered"}
        ).status_code
        == 200
    )
    assert client.put(f"{path}/me", headers=other, json=PAYLOAD).status_code == 403
    assert client.get(path, headers=seller).json()["can_review"] is False
    assert client.get(path, headers=buyer).json()["can_review"] is True
    with Session(engine) as db:
        db.get(CustomerOrder, order_id).status = "cancelled"
        db.commit()
    assert client.put(f"{path}/me", headers=buyer, json=PAYLOAD).status_code == 403


def test_review_lifecycle_privacy_pagination_and_cascade(
    client: TestClient, engine: Engine
) -> None:
    buyer = auth_headers(client, "review-owner")
    other = auth_headers(client, "review-reader")
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    deliver(client, order_id)
    path = f"/api/v1/products/{product_id}/reviews"
    result = client.put(f"{path}/me", headers=buyer, json=PAYLOAD)
    assert result.status_code == 200
    first = result.json()
    assert first["comment"] == "Çok güzel bir ürün."
    assert first["is_mine"] is True
    assert "owner_subject" not in first
    edited = client.put(
        f"{path}/me", headers=buyer, json={"rating": 2, "comment": "Fikrimi değiştirdim."}
    ).json()
    assert edited["id"] == first["id"]
    assert edited["rating"] == 2
    assert edited["updated_at"] >= first["updated_at"]
    reader_page = client.get(path, headers=other).json()
    assert reader_page["my_review"] is None
    assert reader_page["items"][0]["is_mine"] is False
    assert "owner_subject" not in reader_page["items"][0]
    assert client.delete(f"{path}/me", headers=other).status_code == 204
    assert client.get(path, headers=buyer).json()["my_review"]["id"] == first["id"]

    with Session(engine) as db:
        db.get(CustomerOrder, order_id).owner_subject = "review-reader"
        db.commit()
    assert (
        client.put(
            f"{path}/me", headers=other, json={"rating": 4, "comment": "Başka bir yorum."}
        ).status_code
        == 200
    )
    assert client.get(path, headers=buyer).json()["can_review"] is False
    assert client.put(f"{path}/me", headers=buyer, json=PAYLOAD).status_code == 403
    page = client.get(f"{path}?limit=1&offset=0", headers=buyer).json()
    assert page["has_more"] is True
    assert page["items"][0]["is_mine"] is False
    assert page["my_review"]["id"] == first["id"]
    page2 = client.get(f"{path}?limit=1&offset=1", headers=buyer).json()
    assert page2["items"][0]["id"] == first["id"]
    assert page2["has_more"] is False
    assert client.delete(f"{path}/me", headers=buyer).status_code == 204
    assert client.delete(f"{path}/me", headers=buyer).status_code == 204
    admin = auth_headers(client, "review-admin", ["admin"])
    assert client.delete(f"/api/v1/products/{product_id}", headers=admin).status_code == 204
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(ProductReview)) == 0
    assert client.get(path, headers=buyer).status_code == 404
    assert client.delete(f"{path}/me", headers=buyer).status_code == 404


def test_delivered_package_is_enough_and_returns_and_seller_changes_do_not_revoke(
    client: TestClient, engine: Engine
) -> None:
    buyer = auth_headers(client, "review-package-owner")
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    path = f"/api/v1/products/{product_id}/reviews"
    with Session(engine) as db:
        item = db.scalar(select(OrderItem).where(OrderItem.order_id == order_id))
        fulfillment_id = item.fulfillment_id
        db.get(OrderFulfillment, fulfillment_id).status = "delivered"
        db.get(Product, product_id).seller_subject = "new-seller"
        db.commit()
    assert client.put(f"{path}/me", headers=buyer, json=PAYLOAD).status_code == 200
    with Session(engine) as db:
        db.get(OrderFulfillment, fulfillment_id).status = "paid"
        db.commit()
    deliver(client, order_id)
    order = client.get(f"/api/v1/orders/{order_id}", headers=buyer).json()
    returned = client.post(
        f"/api/v1/orders/{order_id}/returns",
        headers={**buyer, "Idempotency-Key": "review-return"},
        json={"order_item_id": order["items"][0]["id"], "quantity": 1, "reason": "Not suitable"},
    )
    assert returned.status_code == 201
    assert client.put(f"{path}/me", headers=buyer, json=PAYLOAD).status_code == 200
    assert client.get(path, headers=buyer).json()["my_review"] is not None


@pytest.mark.parametrize(
    "payload",
    [
        {"rating": 0, "comment": "Uzun bir yorum"},
        {"rating": 6, "comment": "Uzun bir yorum"},
        {"rating": True, "comment": "Uzun bir yorum"},
        {"rating": 2.5, "comment": "Uzun bir yorum"},
        {"rating": 4, "comment": "   kısa   "},
        {"rating": 4, "comment": "x" * 1001},
        {"rating": 4, "comment": "a" * 10 + "\x00"},
    ],
)
def test_review_input_validation(client: TestClient, payload: dict[str, object]) -> None:
    buyer = auth_headers(client, "review-validation")
    assert (
        client.put("/api/v1/products/1/reviews/me", headers=buyer, json=payload).status_code == 422
    )


def test_review_accepts_rating_and_comment_boundaries(client: TestClient) -> None:
    buyer = auth_headers(client, "review-boundaries")
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    deliver(client, order_id)
    path = f"/api/v1/products/{product_id}/reviews/me"
    for rating, comment in ((1, "x" * 10), (5, "🌟" * 1000)):
        result = client.put(path, headers=buyer, json={"rating": rating, "comment": comment})
        assert result.status_code == 200
        assert (result.json()["rating"], result.json()["comment"]) == (rating, comment)


def test_concurrent_first_reviews_do_not_create_duplicates(
    client: TestClient, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    buyer = auth_headers(client, "review-race")
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    deliver(client, order_id)
    barrier = Barrier(2)
    commit = Session.commit

    def synchronized_commit(session: Session) -> None:
        if any(isinstance(item, ProductReview) for item in session.new):
            barrier.wait(timeout=10)
        commit(session)

    monkeypatch.setattr(Session, "commit", synchronized_commit)
    path = f"/api/v1/products/{product_id}/reviews/me"
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(
            pool.map(lambda _: client.put(path, headers=buyer, json=PAYLOAD).status_code, range(2))
        )
    assert sorted(statuses) == [200, 409]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(ProductReview)) == 1


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "offset=2147483648"])
def test_review_page_bounds(client: TestClient, query: str) -> None:
    assert (
        client.get(
            f"/api/v1/products/1/reviews?{query}", headers=auth_headers(client, "review-bounds")
        ).status_code
        == 422
    )


def test_reviews_migration_upgrade_and_downgrade(tmp_path: Path, monkeypatch) -> None:
    url = f"sqlite:///{tmp_path / 'reviews.db'}"
    monkeypatch.setenv("SHOP_DATABASE_URL", url)
    get_settings.cache_clear()
    root = Path(__file__).parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    engine = create_database_engine(url)
    try:
        command.upgrade(config, "0014_favorites")
        command.upgrade(config, "head")
        assert (
            inspect(engine).get_foreign_keys("product_reviews")[0]["options"]["ondelete"]
            == "CASCADE"
        )
        command.downgrade(config, "0014_favorites")
        assert "product_reviews" not in inspect(engine).get_table_names()
        command.upgrade(config, "head")
        assert "product_reviews" in inspect(engine).get_table_names()
    finally:
        engine.dispose()
        get_settings.cache_clear()


@pytest.mark.parametrize("existing", [False, True])
def test_unrelated_integrity_errors_propagate(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, existing: bool
) -> None:
    buyer = auth_headers(client, "review-integrity")
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    deliver(client, order_id)
    if existing:
        assert (
            client.put(
                f"/api/v1/products/{product_id}/reviews/me", headers=buyer, json=PAYLOAD
            ).status_code
            == 200
        )

    def fail_commit(_session: Session) -> None:
        raise IntegrityError("insert", {}, Exception("unrelated integrity failure"))

    monkeypatch.setattr(Session, "commit", fail_commit)
    with pytest.raises(IntegrityError):
        client.put(f"/api/v1/products/{product_id}/reviews/me", headers=buyer, json=PAYLOAD)
