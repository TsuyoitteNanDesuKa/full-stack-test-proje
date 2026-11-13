from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from shop_api.config import get_settings
from shop_api.database import create_database_engine


def test_order_and_payment_migrations_create_tables_and_downgrade(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "order-migration.db"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("SHOP_DATABASE_URL", database_url)
    get_settings.cache_clear()
    api_path = Path(__file__).parents[1]
    alembic_config = Config(str(api_path / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(api_path / "migrations"))
    engine = create_database_engine(database_url)

    try:
        command.upgrade(alembic_config, "0008_payments")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO products "
                    "(id, name, name_key, category, description, price, stock, seller_subject) "
                    "VALUES (1, 'Seller product', 'seller product', 'Care', "
                    "'Migration snapshot', 12.50, 5, 'migration-seller')"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO seller_applications "
                    "(id, owner_subject, applicant_type, legal_name, store_name, store_name_key, "
                    "contact_phone, city, district, primary_category, business_description, "
                    "status, created_at, updated_at) VALUES "
                    "(1, 'migration-seller', 'individual', 'Migration Seller', "
                    "'Migration Store', 'migration store', '05551234567', 'Istanbul', "
                    "'Kadikoy', 'Care', 'Migration app', 'approved', CURRENT_TIMESTAMP, "
                    "CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO orders "
                    "(owner_subject, idempotency_key, status, total_amount, created_at) "
                    "VALUES ('migration-buyer', 'migration-key', 'pending_payment', "
                    "25.00, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO order_items "
                    "(order_id, product_id, product_name, unit_price, quantity, line_total) "
                    "VALUES (1, 1, 'Snapshot product', 12.50, 2, 25.00)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO order_items "
                    "(order_id, product_id, product_name, unit_price, quantity, line_total) "
                    "VALUES (1, NULL, 'Platform product', 5.00, 1, 5.00)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO payments "
                    "(order_id, owner_subject, provider, provider_reference, idempotency_key, "
                    "status, amount, currency, expires_at, created_at, updated_at) "
                    "VALUES (1, 'migration-buyer', 'mock', 'mock-ref', 'payment-key', "
                    "'pending', 25.00, 'TRY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, "
                    "CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO payment_webhook_events "
                    "(payment_id, provider, event_id, payload_sha256, received_at) "
                    "VALUES (1, 'mock', 'migration-event', "
                    "'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', "
                    "CURRENT_TIMESTAMP)"
                )
            )

        command.upgrade(alembic_config, "head")
        with engine.begin() as connection:
            assert (
                connection.scalar(text("SELECT product_name FROM order_items WHERE id = 1"))
                == "Snapshot product"
            )
            assert (
                connection.scalar(text("SELECT version_num FROM alembic_version"))
                == "0013_buyer_cancellation"
            )
            table_names = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
            assert "product_returns" in table_names
            assert "customer_addresses" in table_names
            assert "order_fulfillments" in table_names
            assert "order_fulfillment_events" in table_names
            seller_fulfillment_id = connection.scalar(
                text("SELECT fulfillment_id FROM order_items WHERE id = 1")
            )
            assert seller_fulfillment_id is not None
            assert (
                connection.scalar(
                    text("SELECT store_name FROM order_fulfillments WHERE id = :id"),
                    {"id": seller_fulfillment_id},
                )
                == "Migration Store"
            )
            assert (
                connection.scalar(
                    text("SELECT seller_subject FROM order_fulfillments WHERE id = :id"),
                    {"id": seller_fulfillment_id},
                )
                == "migration-seller"
            )
            platform_fulfillment_id = connection.scalar(
                text("SELECT fulfillment_id FROM order_items WHERE id = 2")
            )
            assert platform_fulfillment_id is not None
            assert (
                connection.scalar(
                    text("SELECT store_name FROM order_fulfillments WHERE id = :id"),
                    {"id": platform_fulfillment_id},
                )
                == "Liva"
            )
            assert (
                connection.scalar(
                    text("SELECT status FROM order_fulfillments WHERE id = :id"),
                    {"id": seller_fulfillment_id},
                )
                == "pending_payment"
            )
            order_columns = {
                column["name"]
                for column in connection.execute(text("PRAGMA table_info(orders)")).mappings()
            }
            assert "delivery_fee" in order_columns
            assert (
                connection.scalar(text("SELECT shipping_address_label FROM orders WHERE id = 1"))
                is None
            )
            assert (
                connection.scalar(text("SELECT action FROM order_status_events WHERE order_id = 1"))
                == "legacy_import"
            )
            connection.execute(text("UPDATE orders SET status = 'processing' WHERE id = 1"))
            connection.execute(
                text("UPDATE payments SET status = 'partially_refunded' WHERE id = 1")
            )
            connection.execute(
                text(
                    "INSERT INTO order_status_events "
                    "(order_id, action, to_status, created_at) "
                    "VALUES (1, 'buyer_cancelled', 'cancelled', CURRENT_TIMESTAMP)"
                )
            )

        with pytest.raises(RuntimeError, match="buyer cancellation audit records"):
            command.downgrade(alembic_config, "0012_order_fulfillments")
        with engine.begin() as connection:
            assert (
                connection.scalar(
                    text(
                        "SELECT COUNT(*) FROM order_status_events WHERE action = 'buyer_cancelled'"
                    )
                )
                == 1
            )
            connection.execute(
                text("DELETE FROM order_status_events WHERE action = 'buyer_cancelled'")
            )
        command.downgrade(alembic_config, "0010_product_returns")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
            assert "customer_addresses" not in tables
            assert "product_returns" in tables
            assert "order_fulfillments" not in tables
            assert "order_fulfillment_events" not in tables
            order_columns = {
                column["name"]
                for column in connection.execute(text("PRAGMA table_info(orders)")).mappings()
            }
            assert "delivery_fee" not in order_columns
            item_columns = {
                column["name"]
                for column in connection.execute(text("PRAGMA table_info(order_items)")).mappings()
            }
            assert "fulfillment_id" not in item_columns

        command.downgrade(alembic_config, "0009_order_lifecycle")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
            assert "product_returns" not in tables
            assert "order_status_events" in tables
            assert (
                connection.scalar(text("SELECT status FROM payments WHERE id = 1")) == "succeeded"
            )

        command.downgrade(alembic_config, "0008_payments")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
            assert "order_status_events" not in tables
            assert "payments" in tables

        command.downgrade(alembic_config, "0007_customer_orders")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
        assert "payments" not in tables
        assert "payment_webhook_events" not in tables

        command.downgrade(alembic_config, "0006_customer_carts")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
        assert "orders" not in tables
        assert "order_items" not in tables
    finally:
        engine.dispose()
        get_settings.cache_clear()
