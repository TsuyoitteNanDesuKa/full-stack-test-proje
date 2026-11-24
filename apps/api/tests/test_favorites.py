from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.config import get_settings
from shop_api.database import create_database_engine
from shop_api.models import Favorite


def headers(client: TestClient, subject: str, roles: list[str] | None = None) -> dict[str, str]:
    token = create_test_token(client, subject=subject, roles=roles or ["buyer"])
    return {"Authorization": f"Bearer {token}"}


def create_product(client: TestClient, name: str) -> int:
    response = client.post(
        "/api/v1/products",
        headers=headers(client, "admin", ["admin"]),
        json={**product_payload(), "name": name},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_favorites_are_private_idempotent_paginated_and_follow_product_changes(
    client: TestClient,
    engine: Engine,
) -> None:
    first = create_product(client, "Favorite first")
    second = create_product(client, "Favorite second")
    buyer = headers(client, "buyer-a")
    other = headers(client, "buyer-b")
    admin = headers(client, "admin", ["admin"])

    assert client.put(f"/api/v1/favorites/{first}", headers=buyer).status_code == 204
    assert client.put(f"/api/v1/favorites/{first}", headers=buyer).status_code == 204
    assert client.put(f"/api/v1/favorites/{second}", headers=buyer).status_code == 204
    assert client.put(f"/api/v1/favorites/{first}", headers=other).status_code == 204
    page = client.get("/api/v1/favorites?limit=1", headers=buyer).json()
    assert [product["id"] for product in page["items"]] == [second]
    assert (page["limit"], page["offset"], page["has_more"]) == (1, 0, True)
    last = client.get("/api/v1/favorites?limit=1&offset=1", headers=buyer).json()
    assert [product["id"] for product in last["items"]] == [first]
    assert last["has_more"] is False
    assert client.delete(f"/api/v1/favorites/{first}", headers=other).status_code == 204
    assert client.delete(f"/api/v1/favorites/{first}", headers=other).status_code == 204
    assert len(client.get("/api/v1/favorites", headers=buyer).json()["items"]) == 2
    assert client.get("/api/v1/favorites", headers=other).json()["items"] == []

    updated = {**product_payload(), "name": "Favorite renamed", "stock": 0}
    assert client.put(f"/api/v1/products/{second}", json=updated, headers=admin).status_code == 200
    item = client.get("/api/v1/favorites?limit=1", headers=buyer).json()["items"][0]
    assert (item["name"], item["stock"]) == ("Favorite renamed", 0)
    assert client.delete(f"/api/v1/products/{second}", headers=admin).status_code == 204
    with Session(engine) as session:
        assert (
            session.scalar(
                select(func.count()).select_from(Favorite).where(Favorite.product_id == second)
            )
            == 0
        )
    assert [
        item["id"] for item in client.get("/api/v1/favorites", headers=buyer).json()["items"]
    ] == [first]
    assert client.put(f"/api/v1/favorites/{second}", headers=buyer).status_code == 404
    assert client.delete(f"/api/v1/favorites/{second}", headers=buyer).status_code == 204


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/favorites"),
        ("put", "/api/v1/favorites/1"),
        ("delete", "/api/v1/favorites/1"),
    ],
)
def test_favorites_require_buyer(client: TestClient, method: str, path: str) -> None:
    request = getattr(client, method)
    assert request(path).status_code == 401
    assert request(path, headers=headers(client, "seller", ["seller"])).status_code == 403
    assert request(path, headers=headers(client, "admin", ["admin"])).status_code == 403


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/favorites?limit=0",
        "/api/v1/favorites?limit=101",
        "/api/v1/favorites?offset=-1",
        "/api/v1/favorites?offset=2147483648",
    ],
)
def test_favorite_page_rejects_invalid_bounds(client: TestClient, path: str) -> None:
    assert client.get(path, headers=headers(client, "buyer")).status_code == 422


def test_invalid_product_ids_are_rejected(client: TestClient) -> None:
    buyer = headers(client, "buyer")
    assert client.put("/api/v1/favorites/0", headers=buyer).status_code == 422
    assert client.delete("/api/v1/favorites/-1", headers=buyer).status_code == 422
    assert client.put("/api/v1/favorites/2147483648", headers=buyer).status_code == 422
    assert client.put("/api/v1/favorites/999999", headers=buyer).status_code == 404


def test_favorites_migration_upgrade_and_downgrade(tmp_path: Path, monkeypatch) -> None:
    url = f"sqlite:///{tmp_path / 'favorites.db'}"
    monkeypatch.setenv("SHOP_DATABASE_URL", url)
    get_settings.cache_clear()
    root = Path(__file__).parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "migrations"))
    engine = create_database_engine(url)
    try:
        command.upgrade(config, "0013_buyer_cancellation")
        command.upgrade(config, "head")
        assert "favorites" in inspect(engine).get_table_names()
        foreign_key = inspect(engine).get_foreign_keys("favorites")[0]
        assert foreign_key["referred_table"] == "products"
        assert foreign_key["options"]["ondelete"] == "CASCADE"
        command.downgrade(config, "0013_buyer_cancellation")
        assert "favorites" not in inspect(engine).get_table_names()
        command.upgrade(config, "head")
        assert "favorites" in inspect(engine).get_table_names()
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_buyer_with_seller_role_can_use_favorites(client: TestClient) -> None:
    product_id = create_product(client, "Buyer and seller favorite")
    buyer_seller = headers(client, "buyer-seller", ["buyer", "seller"])
    assert client.put(f"/api/v1/favorites/{product_id}", headers=buyer_seller).status_code == 204
    assert (
        client.get("/api/v1/favorites", headers=buyer_seller).json()["items"][0]["id"] == product_id
    )


def test_unrelated_integrity_errors_are_not_hidden(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    product_id = create_product(client, "Integrity failure")

    def fail_commit(_session: Session) -> None:
        raise IntegrityError("insert", {}, Exception("unrelated integrity failure"))

    monkeypatch.setattr(Session, "commit", fail_commit)
    with pytest.raises(IntegrityError):
        client.put(f"/api/v1/favorites/{product_id}", headers=headers(client, "buyer"))
