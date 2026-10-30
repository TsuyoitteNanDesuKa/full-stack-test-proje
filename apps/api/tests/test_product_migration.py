from pathlib import Path

from alembic import command
from alembic.config import Config
from factories import make_test_label, product_payload
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
    legacy_base_name = make_test_label("Legacy")
    legacy_name = f"  {'   '.join(legacy_base_name.split('-'))}  "
    legacy_name_key = " ".join(legacy_base_name.split("-")).casefold()
    legacy_product = product_payload(
        name=legacy_name,
        category=make_test_label("Category"),
        description=f"Legacy description {make_test_label('Catalog')}",
    )

    try:
        command.upgrade(alembic_config, "0002_add_products_and_admin")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO products "
                    "(name, category, description, price, stock) "
                    "VALUES (:name, :category, :description, :price, :stock)"
                ),
                legacy_product,
            )

        command.upgrade(alembic_config, "head")

        with engine.connect() as connection:
            assert (
                connection.scalar(text("SELECT name_key FROM products WHERE id = 1"))
                == legacy_name_key
            )
            assert connection.scalar(text("SELECT updated_at FROM products WHERE id = 1")) is None
        command.downgrade(alembic_config, "0002_add_products_and_admin")
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT name FROM products WHERE id = 1")) == legacy_name
            columns = connection.execute(text("PRAGMA table_info(products)")).all()
            assert "name_key" not in {column[1] for column in columns}
            assert "updated_at" not in {column[1] for column in columns}
    finally:
        engine.dispose()
        get_settings.cache_clear()
