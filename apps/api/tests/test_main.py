import asyncio
import logging
import time

from fastapi.testclient import TestClient

import shop_api.main as main_module
from shop_api.config import Settings
from shop_api.main import create_app


def test_default_app_engine_lifecycle_serves_openapi_and_disposes_engine(
    tmp_path,
) -> None:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'lifecycle.db'}",
    )
    app = create_app(settings=settings)

    with TestClient(app) as client:
        response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/auth/me" in response.json()["paths"]
    assert "/api/v1/home" in response.json()["paths"]
    assert "/api/v1/products" in response.json()["paths"]
    assert "/api/v1/addresses" in response.json()["paths"]
    assert "/api/v1/orders/{order_id}/returns" in response.json()["paths"]


def test_payment_expiry_worker_lifecycle_is_logged_and_shutdown(
    tmp_path,
    monkeypatch,
    caplog,
) -> None:
    async def idle_worker(_session_factory) -> None:
        await asyncio.Event().wait()

    monkeypatch.setattr(main_module, "payment_expiry_worker", idle_worker)
    app = create_app(
        settings=Settings(database_url=f"sqlite:///{tmp_path / 'worker-lifecycle.db'}")
    )

    with caplog.at_level(logging.INFO, logger="shop_api.main"):
        with TestClient(app) as client:
            assert client.get("/health/live").status_code == 200

    assert "Payment expiry worker started." in caplog.text
    assert "Payment expiry worker stopping." in caplog.text
    assert "Payment expiry worker stopped." in caplog.text
    assert app.state.payment_expiry_worker_status == "stopped"


def test_failed_payment_expiry_worker_is_logged_and_marks_not_ready(
    tmp_path,
    monkeypatch,
    caplog,
) -> None:
    async def failing_worker(_session_factory) -> None:
        raise RuntimeError("private-token customer@example.com")

    monkeypatch.setattr(main_module, "payment_expiry_worker", failing_worker)
    app = create_app(settings=Settings(database_url=f"sqlite:///{tmp_path / 'worker-failure.db'}"))

    with caplog.at_level(logging.ERROR, logger="shop_api.main"):
        with TestClient(app) as client:
            deadline = time.monotonic() + 2
            while (
                app.state.payment_expiry_worker_status != "failed" and time.monotonic() < deadline
            ):
                time.sleep(0.01)
            response = client.get("/health/ready")

    assert app.state.payment_expiry_worker_status == "failed"
    assert response.status_code == 503
    assert response.json()["dependencies"]["payment_expiry_worker"] == "unavailable"
    assert "error_type=RuntimeError" in caplog.text
    assert "private-token" not in caplog.text
    assert "customer@example.com" not in caplog.text
