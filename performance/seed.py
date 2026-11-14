import argparse
import json
import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from shop_api.models import (
    Base,
    CustomerAddress,
    CustomerOrder,
    OrderFulfillment,
    OrderFulfillmentEvent,
    OrderItem,
    OrderStatusEvent,
    Product,
    SellerApplication,
)

ISSUER = "http://127.0.0.1:18082/realms/e2e"
SELLER = "perf-seller"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if not output.is_dir():
        raise SystemExit("Output directory must already exist.")
    fixture_path = output / "fixtures.json"
    jwks_path = output / "jwks.json"
    if fixture_path.exists() or jwks_path.exists():
        raise SystemExit("Refusing to overwrite existing performance credentials.")

    database_url = os.environ.get("SHOP_DATABASE_URL")
    if not database_url:
        raise SystemExit("SHOP_DATABASE_URL must explicitly identify the isolated performance DB.")
    url = make_url(database_url)
    if (
        url.drivername != "postgresql+psycopg"
        or url.host not in ("localhost", "127.0.0.1")
        or url.port != 15432
        or url.database != "shop_perf_test"
    ):
        raise SystemExit("Expected the isolated local PostgreSQL shop_perf_test on port 15432.")

    engine = create_engine(url)
    now = datetime.now(UTC)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    public_key.update({"kid": "perf-key", "alg": "RS256", "use": "sig"})

    def token(subject: str, roles: list[str]) -> str:
        return jwt.encode(
            {
                "iss": ISSUER,
                "aud": "shop-api",
                "sub": subject,
                "iat": now,
                "exp": now + timedelta(hours=4),
                "realm_access": {"roles": roles},
            },
            key,
            algorithm="RS256",
            headers={"kid": "perf-key"},
        )

    fixtures = {
        "catalog_token": token("perf-catalog", ["buyer"]),
        "seller_token": token(SELLER, ["seller"]),
        "buyer_tokens": {
            str(count): token(f"perf-history-{count}", ["buyer"]) for count in (10, 100, 1000)
        },
        "checkout": [],
    }

    with Session(engine) as db, db.begin():
        tables = set(inspect(db.connection()).get_table_names())
        expected_tables = set(Base.metadata.tables)
        if tables != expected_tables | {"alembic_version"}:
            raise SystemExit("Expected only the migrated application schema in the isolated DB.")
        if any(db.execute(select(table).limit(1)).first() for table in Base.metadata.sorted_tables):
            raise SystemExit("Refusing to seed a nonempty performance database.")

        db.add(
            SellerApplication(
                owner_subject=SELLER,
                applicant_type="individual",
                legal_name="Performance Seller",
                store_name="Performance Store",
                store_name_key="performance store",
                contact_phone="+905551234567",
                city="Istanbul",
                district="Kadikoy",
                primary_category="Perf",
                business_description="Synthetic performance test seller.",
                status="approved",
                created_at=now,
                updated_at=now,
            )
        )
        products = [
            Product(
                name=f"Perf Product {i:04d}",
                name_key=f"perf product {i:04d}",
                category="Perf" if i % 2 == 0 else "Other",
                description="Synthetic catalog product for performance testing.",
                price=Decimal("12.50"),
                stock=999999,
                seller_subject=SELLER,
            )
            for i in range(1000)
        ]
        db.add_all(products)
        db.flush()
        for i in range(10):
            subject = f"perf-checkout-{i + 1}"
            address = CustomerAddress(
                owner_subject=subject,
                label="Test",
                recipient_name="Test Buyer",
                phone="+905551234567",
                city="Istanbul",
                district="Kadikoy",
                address_line="Synthetic Street 10",
                postal_code="34710",
                is_default=True,
                created_at=now,
                updated_at=now,
            )
            db.add(address)
            db.flush()
            fixtures["checkout"].append(
                {
                    "token": token(subject, ["buyer"]),
                    "address_id": address.id,
                    "product_id": products[i].id,
                }
            )

        for count in (10, 100, 1000):
            for index in range(count):
                order = CustomerOrder(
                    owner_subject=f"perf-history-{count}",
                    idempotency_key=f"seed-{count}-{index}",
                    status="paid",
                    total_amount=Decimal("25.00"),
                    created_at=now,
                )
                db.add(order)
                db.flush()
                fulfillment = OrderFulfillment(
                    order_id=order.id,
                    seller_subject=SELLER,
                    store_name="Performance Store",
                    status="paid",
                    created_at=now,
                    updated_at=now,
                )
                db.add(fulfillment)
                db.flush()
                db.add_all(
                    [
                        OrderStatusEvent(
                            order_id=order.id,
                            action="created",
                            to_status="pending_payment",
                            created_at=now,
                        ),
                        OrderFulfillmentEvent(
                            fulfillment_id=fulfillment.id,
                            action="created",
                            to_status="pending_payment",
                            created_at=now,
                        ),
                        *[
                            OrderItem(
                                order_id=order.id,
                                fulfillment_id=fulfillment.id,
                                product_id=products[item].id,
                                product_name=products[item].name,
                                unit_price=Decimal("12.50"),
                                quantity=1,
                                line_total=Decimal("12.50"),
                            )
                            for item in (20, 21)
                        ],
                    ]
                )
    engine.dispose()
    for path, content in (
        (fixture_path, fixtures),
        (jwks_path, {"keys": [public_key]}),
    ):
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output_file:
            json.dump(content, output_file)
    print("Seeded 1,000 products and 1,110 orders; credentials written to the output directory.")


if __name__ == "__main__":
    main()
