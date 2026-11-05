from pathlib import Path

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
        command.upgrade(alembic_config, "head")
        with engine.begin() as connection:
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
                    "VALUES (1, NULL, 'Snapshot product', 12.50, 2, 25.00)"
                )
            )

        with engine.connect() as connection:
            assert (
                connection.scalar(text("SELECT product_name FROM order_items WHERE id = 1"))
                == "Snapshot product"
            )
            assert (
                connection.scalar(text("SELECT version_num FROM alembic_version"))
                == "0008_payments"
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
