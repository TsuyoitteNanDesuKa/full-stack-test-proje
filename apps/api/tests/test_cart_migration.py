from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from shop_api.config import get_settings
from shop_api.database import create_database_engine


def test_cart_migration_preserves_items_when_products_are_deleted_and_downgrades(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "cart-migration.db"
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
                    "INSERT INTO products "
                    "(name, name_key, category, description, price, stock) "
                    "VALUES ('Cart product', 'cart product', 'Home Care', "
                    "'A product for cart migration tests.', 10.00, 5)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO carts (owner_subject, created_at, updated_at) "
                    "VALUES ('migration-buyer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO cart_items "
                    "(cart_id, product_id, product_name, quantity, created_at, updated_at) "
                    "VALUES (1, 1, 'Cart product', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(text("DELETE FROM products WHERE id = 1"))

        with engine.connect() as connection:
            assert connection.scalar(text("SELECT product_id FROM cart_items WHERE id = 1")) is None
            assert (
                connection.scalar(text("SELECT product_name FROM cart_items WHERE id = 1"))
                == "Cart product"
            )

        command.downgrade(alembic_config, "0005_seller_applications_and_product_ownership")
        with engine.connect() as connection:
            tables = set(
                connection.scalars(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            )
        assert "carts" not in tables
        assert "cart_items" not in tables
    finally:
        engine.dispose()
        get_settings.cache_clear()
