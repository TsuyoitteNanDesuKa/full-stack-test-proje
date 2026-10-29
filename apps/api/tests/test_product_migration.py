from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from shop_api.config import get_settings


def test_product_constraints_migration_backfills_normalized_name_keys(
    tmp_path: Path,
    monkeypatch,
) -> None:
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("SHOP_DATABASE_URL", database_url)
    get_settings.cache_clear()
    api_path = Path(__file__).parents[1]
    alembic_config = Config(str(api_path / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(api_path / "migrations"))
    engine = create_engine(database_url)

    try:
        command.upgrade(alembic_config, "0002_add_products_and_admin")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO products "
                    "(name, category, description, price, stock) "
                    "VALUES (:name, :category, :description, :price, :stock)"
                ),
                {
                    "name": "  Legacy   Product  ",
                    "category": "Legacy",
                    "description": "A valid legacy product description.",
                    "price": "12.50",
                    "stock": 3,
                },
            )

        command.upgrade(alembic_config, "head")

        with engine.connect() as connection:
            assert (
                connection.scalar(text("SELECT name_key FROM products WHERE id = 1"))
                == "legacy product"
            )
        command.downgrade(alembic_config, "0002_add_products_and_admin")
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT name FROM products WHERE id = 1")) == (
                "  Legacy   Product  "
            )
            columns = connection.execute(text("PRAGMA table_info(products)")).all()
            assert "name_key" not in {column[1] for column in columns}
    finally:
        engine.dispose()
        get_settings.cache_clear()
