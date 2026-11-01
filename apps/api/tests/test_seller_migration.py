from pathlib import Path

from alembic import command
from alembic.config import Config
from factories import make_test_label, product_payload
from sqlalchemy import create_engine, text

from shop_api.config import get_settings


def test_seller_migration_preserves_products_and_downgrades_cleanly(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "seller-migration.db"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("SHOP_DATABASE_URL", database_url)
    get_settings.cache_clear()
    api_path = Path(__file__).parents[1]
    alembic_config = Config(str(api_path / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(api_path / "migrations"))
    engine = create_engine(database_url)
    product = product_payload(
        name=make_test_label("LegacyProduct"),
        category=make_test_label("Category"),
        description=f"Legacy product {make_test_label('Description')}",
    )

    try:
        command.upgrade(alembic_config, "0004_track_product_updates")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO products "
                    "(name, name_key, category, description, price, stock) "
                    "VALUES (:name, :name_key, :category, :description, :price, :stock)"
                ),
                {**product, "name_key": product["name"].casefold()},
            )

        command.upgrade(alembic_config, "head")
        with engine.connect() as connection:
            assert (
                connection.scalar(text("SELECT seller_subject FROM products WHERE id = 1")) is None
            )
            tables = {
                row[0]
                for row in connection.execute(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                )
            }
            assert {"seller_applications", "seller_application_audit"} <= tables
            application_indexes = {
                row[1] for row in connection.execute(text("PRAGMA index_list(seller_applications)"))
            }
            assert {
                "uq_seller_applications_active_owner",
                "uq_seller_applications_active_store_name",
            } <= application_indexes

        command.downgrade(alembic_config, "0004_track_product_updates")
        with engine.connect() as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                )
            }
            columns = {row[1] for row in connection.execute(text("PRAGMA table_info(products)"))}
            assert "seller_applications" not in tables
            assert "seller_application_audit" not in tables
            assert "seller_subject" not in columns
            assert (
                connection.scalar(text("SELECT name FROM products WHERE id = 1")) == product["name"]
            )
    finally:
        engine.dispose()
        get_settings.cache_clear()
