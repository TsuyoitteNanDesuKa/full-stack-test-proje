from shop_api.database import create_database_engine


def test_sqlite_engine_uses_thread_safe_connection_option() -> None:
    engine = create_database_engine("sqlite:///:memory:")
    try:
        with engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT 1").scalar_one() == 1
    finally:
        engine.dispose()


def test_postgresql_engine_uses_configured_driver_without_connecting() -> None:
    engine = create_database_engine("postgresql+psycopg://user:password@localhost/shop")
    try:
        assert engine.dialect.name == "postgresql"
        assert engine.url.database == "shop"
    finally:
        engine.dispose()
