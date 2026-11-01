from datetime import UTC, datetime
from decimal import Decimal

import pytest
from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from shop_api.models import Product, SellerApplication, User
from shop_api.schemas import product_name_key, store_name_key

PRODUCT_PAYLOAD = product_payload()


def access_token(client: TestClient, user: User) -> str:
    return create_test_token(
        client,
        subject=f"user-{user.id}",
        email=user.email,
        roles=["admin"] if user.is_admin else ["buyer"],
    )


def test_list_products_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/products")

    assert response.status_code == 401


def test_delete_product_rejects_invalid_bearer_token(client: TestClient) -> None:
    response = client.delete(
        "/api/v1/products/1",
        headers={"Authorization": "Bearer invalid"},
    )

    assert response.status_code == 401


def test_list_products_returns_empty_page_for_customer(
    client: TestClient,
    customer: User,
) -> None:
    response = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert response.status_code == 200
    assert response.json() == {"products": [], "total": 0, "limit": 20, "offset": 0}


def test_admin_can_create_product_and_customer_can_list_it(
    client: TestClient,
    admin: User,
    customer: User,
) -> None:
    admin_token = access_token(client, admin)
    create_response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert create_response.status_code == 201
    created_product = create_response.json()
    assert created_product == {
        "id": 1,
        **PRODUCT_PAYLOAD,
        "price": PRODUCT_PAYLOAD["price"],
        "updated_at": None,
        "can_manage": True,
    }

    list_response = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert list_response.status_code == 200
    assert list_response.json() == {
        "products": [{**created_product, "can_manage": False}],
        "total": 1,
        "limit": 20,
        "offset": 0,
    }


def test_product_name_is_unique_after_case_and_whitespace_normalization(
    client: TestClient,
    admin: User,
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    first_response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers=headers,
    )
    duplicate_response = client.post(
        "/api/v1/products",
        json={**PRODUCT_PAYLOAD, "name": f"  {PRODUCT_PAYLOAD['name'].upper()}  "},
        headers=headers,
    )

    assert first_response.status_code == 201
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["detail"] == "Bu ürün adı katalogda zaten kullanılıyor."
    product_list = client.get("/api/v1/products", headers=headers).json()
    assert product_list["total"] == 1


def test_product_name_is_unique_after_unicode_nfc_normalization(
    client: TestClient,
    admin: User,
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    first_response = client.post(
        "/api/v1/products",
        json={**PRODUCT_PAYLOAD, "name": f"Café {PRODUCT_PAYLOAD['name']}"},
        headers=headers,
    )
    duplicate_response = client.post(
        "/api/v1/products",
        json={**PRODUCT_PAYLOAD, "name": f"Cafe\u0301 {PRODUCT_PAYLOAD['name']}"},
        headers=headers,
    )

    assert first_response.status_code == 201
    assert duplicate_response.status_code == 409
    assert client.get("/api/v1/products", headers=headers).json()["total"] == 1


def test_concurrent_duplicate_product_name_returns_conflict(
    client: TestClient,
    admin: User,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def commit_duplicate(session: Session) -> None:
        session.rollback()
        with engine.begin() as connection:
            connection.execute(
                Product.__table__.insert(),
                {
                    **PRODUCT_PAYLOAD,
                    "name_key": product_name_key(str(PRODUCT_PAYLOAD["name"])),
                },
            )
        raise IntegrityError("INSERT products", {}, Exception("unique constraint"))

    monkeypatch.setattr(Session, "commit", commit_duplicate)
    response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {access_token(client, admin)}"},
    )

    assert response.status_code == 409
    assert (
        client.get(
            "/api/v1/products",
            headers={"Authorization": f"Bearer {access_token(client, admin)}"},
        ).json()["total"]
        == 1
    )


def test_unrelated_integrity_error_is_not_converted_to_duplicate_conflict(
    client: TestClient,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def commit_with_integrity_error(_session: Session) -> None:
        raise IntegrityError("INSERT products", {}, Exception("unrelated constraint"))

    monkeypatch.setattr(Session, "commit", commit_with_integrity_error)

    with pytest.raises(IntegrityError, match="unrelated constraint"):
        client.post(
            "/api/v1/products",
            json=PRODUCT_PAYLOAD,
            headers={"Authorization": f"Bearer {access_token(client, admin)}"},
        )


def test_customer_cannot_create_products(
    client: TestClient,
    customer: User,
) -> None:
    response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Bu işlem için onaylı satıcı veya yönetici yetkisi gereklidir."
    )
    assert (
        client.get(
            "/api/v1/products",
            headers={"Authorization": f"Bearer {access_token(client, customer)}"},
        ).json()["total"]
        == 0
    )


def test_admin_can_delete_product_and_removed_product_is_no_longer_listed(
    client: TestClient,
    admin: User,
    customer: User,
) -> None:
    admin_headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    customer_headers = {"Authorization": f"Bearer {access_token(client, customer)}"}
    create_response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers=admin_headers,
    )
    product_id = create_response.json()["id"]

    delete_response = client.delete(
        f"/api/v1/products/{product_id}",
        headers=admin_headers,
    )

    assert create_response.status_code == 201
    assert delete_response.status_code == 204
    assert delete_response.content == b""
    assert client.get("/api/v1/products", headers=admin_headers).json() == {
        "products": [],
        "total": 0,
        "limit": 20,
        "offset": 0,
    }
    assert client.get("/api/v1/products", headers=customer_headers).json()["products"] == []

    recreated_response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers=admin_headers,
    )
    assert recreated_response.status_code == 201


def test_delete_product_requires_admin_and_existing_product(
    client: TestClient,
    admin: User,
    customer: User,
) -> None:
    admin_headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    customer_headers = {"Authorization": f"Bearer {access_token(client, customer)}"}
    created = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers=admin_headers,
    )
    product_id = created.json()["id"]

    unauthenticated_response = client.delete(f"/api/v1/products/{product_id}")
    customer_response = client.delete(
        f"/api/v1/products/{product_id}",
        headers=customer_headers,
    )
    missing_product_response = client.delete(
        f"/api/v1/products/{product_id + 1}",
        headers=admin_headers,
    )

    assert unauthenticated_response.status_code == 401
    assert customer_response.status_code == 403
    assert missing_product_response.status_code == 404
    assert client.get("/api/v1/products", headers=admin_headers).json()["products"] == [
        created.json()
    ]


def test_admin_can_update_all_product_fields_and_customers_see_the_updated_product(
    client: TestClient,
    admin: User,
    customer: User,
) -> None:
    admin_headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    customer_headers = {"Authorization": f"Bearer {access_token(client, customer)}"}
    created = client.post("/api/v1/products", json=PRODUCT_PAYLOAD, headers=admin_headers)
    updated_payload = product_payload()

    response = client.put(
        f"/api/v1/products/{created.json()['id']}",
        json=updated_payload,
        headers=admin_headers,
    )

    assert response.status_code == 200
    updated_product = response.json()
    assert {
        key: updated_product[key] for key in ("name", "category", "description", "price", "stock")
    } == {**updated_payload, "price": f"{float(str(updated_payload['price'])):.2f}"}
    assert datetime.fromisoformat(updated_product["updated_at"])
    listed_product = client.get("/api/v1/products", headers=customer_headers).json()["products"][0]
    assert listed_product == {**updated_product, "can_manage": False}


def test_admin_can_update_product_without_changing_its_name(
    client: TestClient,
    admin: User,
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    created = client.post("/api/v1/products", json=PRODUCT_PAYLOAD, headers=headers)
    updated_payload = {**PRODUCT_PAYLOAD, "stock": product_payload()["stock"]}

    response = client.put(
        f"/api/v1/products/{created.json()['id']}",
        json=updated_payload,
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == PRODUCT_PAYLOAD["name"]
    assert response.json()["stock"] == updated_payload["stock"]
    assert response.json()["updated_at"] is not None


def test_admin_cannot_update_product_to_another_products_name(
    client: TestClient,
    admin: User,
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    first = client.post("/api/v1/products", json=PRODUCT_PAYLOAD, headers=headers)
    second_payload = product_payload()
    second = client.post("/api/v1/products", json=second_payload, headers=headers)

    response = client.put(
        f"/api/v1/products/{second.json()['id']}",
        json=PRODUCT_PAYLOAD,
        headers=headers,
    )

    assert first.status_code == second.status_code == 201
    assert response.status_code == 409
    assert (
        client.get("/api/v1/products", headers=headers).json()["products"][1]["name"]
        == second_payload["name"]
    )


@pytest.mark.parametrize(
    "updates",
    [
        pytest.param({"name": "P"}, id="name-shorter-than-minimum"),
        pytest.param({"name": " P "}, id="name-too-short-after-normalization"),
        pytest.param({"name": "P" * 33}, id="name-longer-than-maximum"),
        pytest.param({"name": "Ürün!"}, id="name-contains-unsupported-punctuation"),
        pytest.param({"name": " "}, id="name-is-only-whitespace"),
        pytest.param({"category": "C"}, id="category-shorter-than-minimum"),
        pytest.param(
            {"category": " C "},
            id="category-too-short-after-normalization",
        ),
        pytest.param({"category": "C" * 41}, id="category-longer-than-maximum"),
        pytest.param(
            {"category": "Bakım!"},
            id="category-contains-unsupported-punctuation",
        ),
        pytest.param({"description": "D" * 9}, id="description-shorter-than-minimum"),
        pytest.param(
            {"description": "         x"},
            id="description-too-short-after-trimming",
        ),
        pytest.param({"description": "D" * 501}, id="description-longer-than-maximum"),
        pytest.param(
            {"description": "Geçersiz\x00 açıklama"},
            id="description-control-character",
        ),
        pytest.param({"price": "0"}, id="zero-price"),
        pytest.param({"price": "-0.01"}, id="negative-price"),
        pytest.param({"price": "1.999"}, id="price-has-too-many-decimal-places"),
        pytest.param({"price": "1000000.00"}, id="price-exceeds-maximum"),
        pytest.param({"price": "not-a-price"}, id="price-is-not-numeric"),
        pytest.param({"price": True}, id="price-must-not-be-boolean"),
        pytest.param({"stock": -1}, id="negative-stock"),
        pytest.param({"stock": 1000000}, id="stock-exceeds-maximum"),
        pytest.param({"stock": 1.5}, id="fractional-stock"),
        pytest.param({"stock": "24"}, id="stock-must-be-an-integer"),
        pytest.param({"name": 24}, id="name-must-be-a-string"),
        pytest.param({"category": 24}, id="category-must-be-a-string"),
        pytest.param({"description": 24}, id="description-must-be-a-string"),
    ],
)
def test_invalid_product_update_does_not_change_existing_product(
    client: TestClient,
    admin: User,
    updates: dict[str, object],
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    created = client.post("/api/v1/products", json=PRODUCT_PAYLOAD, headers=headers)

    response = client.put(
        f"/api/v1/products/{created.json()['id']}",
        json={**PRODUCT_PAYLOAD, **updates},
        headers=headers,
    )

    assert response.status_code == 422
    unchanged_product = client.get("/api/v1/products", headers=headers).json()["products"][0]
    assert unchanged_product == created.json()


def test_update_product_requires_admin_and_existing_product(
    client: TestClient,
    customer: User,
    admin: User,
) -> None:
    response_without_auth = client.put("/api/v1/products/1", json=PRODUCT_PAYLOAD)
    customer_response = client.put(
        "/api/v1/products/1",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )
    missing_product_response = client.put(
        "/api/v1/products/404",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {access_token(client, admin)}"},
    )

    assert response_without_auth.status_code == 401
    assert customer_response.status_code == 403
    assert missing_product_response.status_code == 404


def test_concurrent_duplicate_name_update_returns_conflict(
    client: TestClient,
    admin: User,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    original = client.post(
        "/api/v1/products",
        json=product_payload(),
        headers=headers,
    ).json()
    update_payload = product_payload()

    def commit_duplicate(session: Session) -> None:
        session.rollback()
        with engine.begin() as connection:
            connection.execute(
                Product.__table__.insert(),
                {
                    **update_payload,
                    "name_key": product_name_key(str(update_payload["name"])),
                },
            )
        raise IntegrityError("UPDATE products", {}, Exception("unique constraint"))

    monkeypatch.setattr(Session, "commit", commit_duplicate)
    response = client.put(
        f"/api/v1/products/{original['id']}",
        json=update_payload,
        headers=headers,
    )

    assert response.status_code == 409
    product_list = client.get("/api/v1/products", headers=headers).json()["products"]
    assert product_list[0]["name"] == original["name"]
    assert product_list[0]["updated_at"] is None


def test_unrelated_update_integrity_error_is_not_converted_to_conflict(
    client: TestClient,
    admin: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = {"Authorization": f"Bearer {access_token(client, admin)}"}
    product = client.post("/api/v1/products", json=PRODUCT_PAYLOAD, headers=headers).json()

    def commit_with_integrity_error(_session: Session) -> None:
        raise IntegrityError("UPDATE products", {}, Exception("unrelated constraint"))

    monkeypatch.setattr(Session, "commit", commit_with_integrity_error)

    with pytest.raises(IntegrityError, match="unrelated constraint"):
        client.put(
            f"/api/v1/products/{product['id']}",
            json={**PRODUCT_PAYLOAD, "stock": 99},
            headers=headers,
        )


def test_create_products_rejects_missing_authentication(
    client: TestClient,
) -> None:
    response = client.post("/api/v1/products", json=PRODUCT_PAYLOAD)

    assert response.status_code == 401


@pytest.mark.parametrize(
    "updates",
    [
        pytest.param({"name": "x"}, id="name-too-short"),
        pytest.param({"name": " A "}, id="name-too-short-after-normalization"),
        pytest.param({"category": "x"}, id="category-too-short"),
        pytest.param({"category": " C "}, id="category-too-short-after-normalization"),
        pytest.param({"description": ""}, id="empty-description"),
        pytest.param({"price": "0"}, id="zero-price"),
        pytest.param({"price": "1.999"}, id="too-many-decimals"),
        pytest.param({"price": "1000000.00"}, id="price-out-of-range"),
        pytest.param({"price": True}, id="price-must-not-be-boolean"),
        pytest.param({"price": "-0.01"}, id="negative-price"),
        pytest.param({"stock": -1}, id="negative-stock"),
        pytest.param({"stock": 1.5}, id="fractional-stock"),
        pytest.param({"name": "N" * 33}, id="name-too-long"),
        pytest.param({"name": "Ürün!"}, id="name-invalid-format"),
        pytest.param({"category": "C" * 41}, id="category-too-long"),
        pytest.param({"category": "Bakım!"}, id="category-invalid-format"),
        pytest.param({"description": "Kısa"}, id="description-too-short"),
        pytest.param(
            {"description": "         x"},
            id="description-too-short-after-trimming",
        ),
        pytest.param({"description": "D" * 501}, id="description-too-long"),
        pytest.param(
            {"description": "Geçersiz\x00 açıklama"},
            id="description-control-character",
        ),
    ],
)
def test_admin_cannot_create_product_with_invalid_fields(
    client: TestClient,
    admin: User,
    updates: dict[str, object],
) -> None:
    payload = {**PRODUCT_PAYLOAD, **updates}
    response = client.post(
        "/api/v1/products",
        json=payload,
        headers={"Authorization": f"Bearer {access_token(client, admin)}"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]
    catalog = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {access_token(client, admin)}"},
    )
    assert catalog.json()["total"] == 0


@pytest.mark.parametrize(
    "updates",
    [
        pytest.param({"name": "N" * 33}, id="name-over-32-characters"),
        pytest.param({"category": "C" * 41}, id="category-over-40-characters"),
        pytest.param({"description": "D" * 9}, id="description-under-10-characters"),
        pytest.param({"description": "D" * 501}, id="description-over-500-characters"),
        pytest.param({"price": Decimal("0.00")}, id="price-below-minimum"),
        pytest.param({"price": Decimal("1000000.00")}, id="price-above-maximum"),
        pytest.param({"stock": 1000000}, id="stock-above-maximum"),
    ],
)
def test_database_constraints_reject_invalid_products(
    engine,
    updates: dict[str, object],
) -> None:
    product_data: dict[str, object] = {
        **PRODUCT_PAYLOAD,
        "name_key": product_name_key(str(PRODUCT_PAYLOAD["name"])),
    }
    product_data.update(updates)
    if "name" in updates:
        product_data["name_key"] = str(updates["name"]).casefold()

    session_factory = sessionmaker(bind=engine, class_=Session)
    with session_factory() as session:
        session.add(Product(**product_data))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.scalar(select(func.count()).select_from(Product)) == 0


def test_database_enforces_product_name_key_uniqueness(engine) -> None:
    session_factory = sessionmaker(bind=engine, class_=Session)
    with session_factory() as session:
        session.add(
            Product(
                **PRODUCT_PAYLOAD,
                name_key=product_name_key(str(PRODUCT_PAYLOAD["name"])),
            )
        )
        session.commit()
        duplicate_payload = product_payload(name=str(PRODUCT_PAYLOAD["name"]).upper())
        session.add(
            Product(
                **duplicate_payload,
                name_key=product_name_key(str(PRODUCT_PAYLOAD["name"])),
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.scalar(select(func.count()).select_from(Product)) == 1


def test_list_products_supports_stable_pagination(
    client: TestClient,
    admin: User,
) -> None:
    token = access_token(client, admin)
    pagination_products = [product_payload() for _ in range(3)]
    for product in pagination_products:
        response = client.post(
            "/api/v1/products",
            json=product,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201

    response = client.get(
        "/api/v1/products?limit=1&offset=1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert response.json()["limit"] == 1
    assert response.json()["offset"] == 1
    assert response.json()["products"][0]["name"] == pagination_products[1]["name"]


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1"])
def test_list_products_rejects_invalid_pagination(
    client: TestClient,
    customer: User,
    query: str,
) -> None:
    response = client.get(
        f"/api/v1/products?{query}",
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("method", ["get", "post"])
def test_product_endpoints_reject_invalid_bearer_token(
    client: TestClient,
    method: str,
) -> None:
    request = getattr(client, method)
    if method == "get":
        response = request("/api/v1/products", headers={"Authorization": "Bearer invalid"})
    else:
        response = request(
            "/api/v1/products",
            json=PRODUCT_PAYLOAD,
            headers={"Authorization": "Bearer invalid"},
        )

    assert response.status_code == 401


def create_approved_seller_application(engine, subject: str, suffix: str) -> None:
    now = datetime.now(UTC)
    with sessionmaker(bind=engine, class_=Session)() as session:
        session.add(
            SellerApplication(
                owner_subject=subject,
                applicant_type="individual",
                legal_name=f"Seller Owner {suffix}",
                representative_name=None,
                store_name=f"Store {suffix}",
                store_name_key=store_name_key(f"Store {suffix}"),
                contact_phone="+905551234567",
                city="Istanbul",
                district="Kadikoy",
                primary_category="Home",
                business_description=f"Seller products and catalog {suffix}",
                status="approved",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()


def test_seller_without_approved_application_cannot_create_products(
    client: TestClient,
) -> None:
    token = create_test_token(
        client,
        subject="unapproved-seller",
        roles=["buyer", "seller"],
    )
    response = client.post(
        "/api/v1/products",
        json=product_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert (
        client.get(
            "/api/v1/products",
            headers={"Authorization": f"Bearer {token}"},
        ).json()["total"]
        == 0
    )


def test_seller_can_manage_only_owned_products_and_buyers_see_shared_catalog(
    client: TestClient,
    engine,
) -> None:
    create_approved_seller_application(engine, "seller-one", "One")
    create_approved_seller_application(engine, "seller-two", "Two")
    seller_one_token = create_test_token(
        client,
        subject="seller-one",
        roles=["buyer", "seller"],
    )
    seller_two_token = create_test_token(
        client,
        subject="seller-two",
        roles=["buyer", "seller"],
    )
    seller_one_headers = {"Authorization": f"Bearer {seller_one_token}"}
    seller_two_headers = {"Authorization": f"Bearer {seller_two_token}"}
    create_response = client.post(
        "/api/v1/products",
        json=product_payload(),
        headers=seller_one_headers,
    )
    product = create_response.json()

    assert create_response.status_code == 201
    with sessionmaker(bind=engine, class_=Session)() as session:
        stored_product = session.get(Product, product["id"])
        assert stored_product is not None
        assert stored_product.seller_subject == "seller-one"

    buyer_token = create_test_token(client, subject="catalog-buyer", roles=["buyer"])
    buyer_catalog = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {buyer_token}"},
    )
    assert buyer_catalog.status_code == 200
    assert buyer_catalog.json()["products"] == [{**product, "can_manage": False}]

    another_seller_update = client.put(
        f"/api/v1/products/{product['id']}",
        json=product_payload(),
        headers=seller_two_headers,
    )
    another_seller_delete = client.delete(
        f"/api/v1/products/{product['id']}",
        headers=seller_two_headers,
    )
    assert another_seller_update.status_code == 404
    assert another_seller_delete.status_code == 404

    updated_payload = product_payload()
    update_response = client.put(
        f"/api/v1/products/{product['id']}",
        json=updated_payload,
        headers=seller_one_headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == updated_payload["name"]

    delete_response = client.delete(
        f"/api/v1/products/{product['id']}",
        headers=seller_one_headers,
    )
    assert delete_response.status_code == 204
