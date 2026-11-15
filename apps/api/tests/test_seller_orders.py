from datetime import UTC, datetime
from decimal import Decimal

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session, sessionmaker

from shop_api.models import (
    CustomerOrder,
    OrderFulfillment,
    OrderFulfillmentEvent,
    OrderItem,
    OrderStatusEvent,
    SellerApplication,
)
from shop_api.schemas import store_name_key


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


def create_approved_seller(engine, subject: str, suffix: str) -> str:
    now = datetime.now(UTC)
    store_name = f"Store {suffix}"
    with sessionmaker(bind=engine, class_=Session)() as session:
        session.add(
            SellerApplication(
                owner_subject=subject,
                applicant_type="individual",
                legal_name=f"Seller Owner {suffix}",
                representative_name=None,
                store_name=store_name,
                store_name_key=store_name_key(store_name),
                contact_phone="+905551234567",
                city="Istanbul",
                district="Kadikoy",
                primary_category="Home",
                business_description=f"Seller products for {suffix}",
                status="approved",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
    return store_name


def create_seller_product(client: TestClient, subject: str, suffix: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/products",
        json=product_payload(name=f"Item {suffix}"),
        headers=auth_headers(client, subject, ["buyer", "seller"]),
    )
    assert response.status_code == 201
    return response.json()


def create_paid_multi_seller_order(
    client: TestClient,
    engine,
) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    create_approved_seller(engine, "fulfillment-seller-one", "One")
    create_approved_seller(engine, "fulfillment-seller-two", "Two")
    product_one = create_seller_product(client, "fulfillment-seller-one", "One")
    product_two = create_seller_product(client, "fulfillment-seller-two", "Two")
    buyer_headers = auth_headers(client, "fulfillment-buyer")
    for product in (product_one, product_two):
        response = client.post(
            "/api/v1/cart/items",
            json={"product_id": product["id"], "quantity": 1},
            headers=buyer_headers,
        )
        assert response.status_code == 200
    checkout = client.post(
        "/api/v1/orders",
        json=create_checkout_request(client, buyer_headers),
        headers={**buyer_headers, "Idempotency-Key": "fulfillment-order"},
    )
    assert checkout.status_code == 201
    order = checkout.json()
    assert len(order["fulfillments"]) == 2
    assert len({fulfillment["id"] for fulfillment in order["fulfillments"]}) == 2
    payment = client.post(
        f"/api/v1/orders/{order['id']}/payments",
        headers={**buyer_headers, "Idempotency-Key": "fulfillment-payment"},
    )
    assert payment.status_code == 201
    completed_payment = client.post(payment.json()["checkout_url"], json={"status": "succeeded"})
    assert completed_payment.status_code == 200
    return order, product_one, product_two


def test_seller_fulfillments_are_isolated_and_order_status_is_aggregated(
    client: TestClient,
    engine,
) -> None:
    order, product_one, product_two = create_paid_multi_seller_order(client, engine)
    seller_one_headers = auth_headers(
        client,
        "fulfillment-seller-one",
        ["buyer", "seller"],
    )
    seller_two_headers = auth_headers(
        client,
        "fulfillment-seller-two",
        ["buyer", "seller"],
    )
    seller_one_orders = client.get("/api/v1/seller/orders", headers=seller_one_headers)
    seller_two_orders = client.get("/api/v1/seller/orders", headers=seller_two_headers)

    assert seller_one_orders.status_code == 200
    assert seller_two_orders.status_code == 200
    assert len(seller_one_orders.json()) == len(seller_two_orders.json()) == 1
    seller_one_order = seller_one_orders.json()[0]
    seller_two_order = seller_two_orders.json()[0]
    assert seller_one_order["order_id"] == seller_two_order["order_id"] == order["id"]
    assert seller_one_order["store_name"] == "Store One"
    assert seller_one_order["items"][0]["product_name"] == product_one["name"]
    assert seller_two_order["store_name"] == "Store Two"
    assert seller_two_order["items"][0]["product_name"] == product_two["name"]
    assert "owner_subject" not in seller_one_order
    assert seller_one_order["shipping_address"]["recipient_name"] == "Test Buyer"

    cross_seller_detail = client.get(
        f"/api/v1/seller/orders/{seller_two_order['id']}",
        headers=seller_one_headers,
    )
    cross_seller_update = client.patch(
        f"/api/v1/seller/orders/{seller_two_order['id']}/status",
        json={"status": "processing"},
        headers=seller_one_headers,
    )
    assert cross_seller_detail.status_code == 404
    assert cross_seller_update.status_code == 404

    fulfillment_id = seller_one_order["id"]
    skip_status = client.patch(
        f"/api/v1/seller/orders/{fulfillment_id}/status",
        json={"status": "shipped"},
        headers=seller_one_headers,
    )
    assert skip_status.status_code == 409

    processing = client.patch(
        f"/api/v1/seller/orders/{fulfillment_id}/status",
        json={"status": "processing"},
        headers=seller_one_headers,
    )
    assert processing.status_code == 200
    assert processing.json()["status"] == "processing"
    replay = client.patch(
        f"/api/v1/seller/orders/{fulfillment_id}/status",
        json={"status": "processing"},
        headers=seller_one_headers,
    )
    assert replay.status_code == 200

    buyer_headers = auth_headers(client, "fulfillment-buyer")
    buyer_order = client.get(
        f"/api/v1/orders/{order['id']}",
        headers=buyer_headers,
    ).json()
    assert client.get("/api/v1/orders", headers=buyer_headers).json() == [buyer_order]
    assert buyer_order["status"] == "paid"
    assert sorted(group["status"] for group in buyer_order["fulfillments"]) == [
        "paid",
        "processing",
    ]
    assert all(
        "actor_subject" not in event
        for group in buyer_order["fulfillments"]
        for event in group["history"]
    )

    with Session(engine) as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(OrderFulfillmentEvent)
                .where(
                    OrderFulfillmentEvent.fulfillment_id == fulfillment_id,
                    OrderFulfillmentEvent.action == "seller_status_changed",
                )
            )
            == 1
        )
        stored_order = session.get(CustomerOrder, order["id"])
        assert stored_order is not None
        assert stored_order.status == "paid"

    admin_headers = auth_headers(client, "fulfillment-admin", ["admin"])
    admin_order = client.get(
        f"/api/v1/admin/orders/{order['id']}",
        headers=admin_headers,
    ).json()
    assert client.get("/api/v1/admin/orders", headers=admin_headers).json() == [admin_order]
    assert len(admin_order["fulfillments"]) == 2
    assert any(
        event["actor_subject"] == "fulfillment-seller-one"
        for group in admin_order["fulfillments"]
        for event in group["history"]
    )

    admin_advance = client.patch(
        f"/api/v1/admin/orders/{order['id']}/status",
        json={"status": "processing"},
        headers=admin_headers,
    )
    assert admin_advance.status_code == 200
    assert admin_advance.json()["status"] == "processing"
    assert {group["status"] for group in admin_advance.json()["fulfillments"]} == {"processing"}


def test_seller_endpoints_require_active_seller_authorization(
    client: TestClient,
    engine,
) -> None:
    create_approved_seller(engine, "approved-but-buyer", "Approved")
    buyer_only = auth_headers(client, "approved-but-buyer", ["buyer"])
    unapproved_seller = auth_headers(client, "unapproved-seller", ["buyer", "seller"])
    admin = auth_headers(client, "seller-route-admin", ["admin"])

    assert client.get("/api/v1/seller/orders", headers=buyer_only).status_code == 403
    assert client.get("/api/v1/seller/orders", headers=unapproved_seller).status_code == 403
    assert client.get("/api/v1/seller/orders", headers=admin).status_code == 403


def test_admin_cannot_refund_when_any_seller_fulfillment_is_shipped(
    client: TestClient,
    engine,
) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    seller_headers = auth_headers(
        client,
        "fulfillment-seller-one",
        ["buyer", "seller"],
    )
    fulfillment = client.get("/api/v1/seller/orders", headers=seller_headers).json()[0]
    shipped = client.patch(
        f"/api/v1/seller/orders/{fulfillment['id']}/status",
        json={"status": "processing"},
        headers=seller_headers,
    )
    assert shipped.status_code == 200
    shipped = client.patch(
        f"/api/v1/seller/orders/{fulfillment['id']}/status",
        json={"status": "shipped"},
        headers=seller_headers,
    )
    assert shipped.status_code == 200

    response = client.post(
        f"/api/v1/admin/orders/{order['id']}/refund",
        json={"reason": "Package already shipped"},
        headers=auth_headers(client, "fulfillment-refund-admin", ["admin"]),
    )

    assert response.status_code == 409
    with Session(engine) as session:
        stored_order = session.get(CustomerOrder, order["id"])
        assert stored_order is not None
        assert stored_order.status == "paid"
        assert all(
            fulfillment.status != "cancelled"
            for fulfillment in session.scalars(
                select(OrderFulfillment).where(OrderFulfillment.order_id == order["id"])
            ).all()
        )


def test_order_lists_batch_queries_and_preserve_details_across_batches(
    client: TestClient,
    engine,
) -> None:
    create_approved_seller(engine, "batch-seller", "Batch")
    now = datetime.now(UTC)
    with Session(engine) as session:
        orders = [
            CustomerOrder(
                owner_subject="batch-buyer",
                idempotency_key=f"batch-{index}",
                status="paid",
                total_amount=Decimal("10.00"),
                created_at=now,
            )
            for index in range(501)
        ]
        session.add_all(orders)
        session.flush()
        fulfillments = [
            OrderFulfillment(
                order_id=order.id,
                seller_subject="batch-seller",
                store_name="Store Batch",
                status="paid",
                created_at=now,
                updated_at=now,
            )
            for order in orders
        ]
        session.add_all(fulfillments)
        session.flush()
        session.add_all(
            OrderItem(
                order_id=order.id,
                fulfillment_id=fulfillment.id,
                product_name=f"Item {index}",
                unit_price=Decimal("10.00"),
                quantity=1,
                line_total=Decimal("10.00"),
            )
            for index, (order, fulfillment) in enumerate(zip(orders, fulfillments, strict=True))
        )
        session.add_all(
            OrderFulfillmentEvent(
                fulfillment_id=fulfillment.id,
                action="payment_succeeded",
                from_status="pending_payment",
                to_status="paid",
                actor_subject="private-actor",
                created_at=now,
            )
            for fulfillment in fulfillments
        )
        session.add_all(
            OrderStatusEvent(
                order_id=order.id,
                action="payment_succeeded",
                from_status="pending_payment",
                to_status="paid",
                actor_subject="private-actor",
                created_at=now,
            )
            for order in orders
        )
        session.add(
            CustomerOrder(
                owner_subject="another-buyer",
                idempotency_key="other-order",
                status="paid",
                total_amount=Decimal("10.00"),
                created_at=now,
            )
        )
        session.commit()

    def list_with_count(path: str, headers: dict[str, str]) -> tuple[list, int]:
        statements = []

        def count_selects(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(engine, "before_cursor_execute", count_selects)
        try:
            response = client.get(path, headers=headers)
        finally:
            event.remove(engine, "before_cursor_execute", count_selects)
        assert response.status_code == 200
        return response.json(), len(statements)

    buyer = auth_headers(client, "batch-buyer")
    buyer_list, buyer_queries = list_with_count("/api/v1/orders", buyer)
    assert len(buyer_list) == 501
    assert buyer_queries <= 13
    assert [order["id"] for order in buyer_list] == sorted(
        (order["id"] for order in buyer_list), reverse=True
    )
    for order in (buyer_list[0], buyer_list[500]):
        assert order == client.get(f"/api/v1/orders/{order['id']}", headers=buyer).json()
        assert order["items"] == order["fulfillments"][0]["items"]
        assert "actor_subject" not in order["history"][0]
        assert "actor_subject" not in order["fulfillments"][0]["history"][0]

    admin = auth_headers(client, "batch-admin", ["admin"])
    empty_relations = client.get("/api/v1/admin/orders?limit=1", headers=admin).json()[0]
    assert empty_relations["owner_subject"] == "another-buyer"
    assert empty_relations["fulfillments"] == empty_relations["items"] == []
    assert empty_relations["history"] == empty_relations["returns"] == []
    assert empty_relations["payment_status"] is None
    admin_list, admin_queries = list_with_count("/api/v1/admin/orders?limit=100&offset=1", admin)
    assert len(admin_list) == 100
    assert admin_queries <= 8
    assert (
        admin_list[0]
        == client.get(f"/api/v1/admin/orders/{admin_list[0]['id']}", headers=admin).json()
    )
    assert admin_list[0]["history"][0]["actor_subject"] == "private-actor"

    seller = auth_headers(client, "batch-seller", ["seller"])
    seller_list, seller_queries = list_with_count(
        "/api/v1/seller/orders?limit=100&offset=1", seller
    )
    assert len(seller_list) == 100
    assert seller_queries <= 5
    assert (
        seller_list[0]
        == client.get(f"/api/v1/seller/orders/{seller_list[0]['id']}", headers=seller).json()
    )
    assert "actor_subject" not in seller_list[0]["history"][0]
    assert client.get("/api/v1/orders", headers=auth_headers(client, "no-orders")).json() == []
    assert client.get("/api/v1/seller/orders?offset=9999", headers=seller).json() == []
    assert client.get("/api/v1/admin/orders?offset=9999", headers=admin).json() == []
