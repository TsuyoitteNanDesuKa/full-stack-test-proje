import logging
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from shop_api.config import Settings
from shop_api.main import create_app


@pytest.mark.smoke
def test_readiness_returns_ok_when_dependencies_are_available(
    client: TestClient,
) -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "dependencies": {
            "database": "available",
            "payment_expiry_worker": "running",
        },
    }


@pytest.mark.smoke
def test_liveness_is_independent_of_database(client: TestClient, monkeypatch) -> None:
    def fail_connect():
        raise OperationalError("SELECT 1", {}, Exception("private-db-password"))

    monkeypatch.setattr(client.app.state.engine, "connect", fail_connect)

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.smoke
def test_readiness_returns_safe_503_when_database_is_unavailable(
    client: TestClient,
    monkeypatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def fail_connect():
        raise OperationalError(
            "SELECT 1",
            {},
            Exception("private-db-password customer@example.com"),
        )

    monkeypatch.setattr(client.app.state.engine, "connect", fail_connect)

    with caplog.at_level(logging.WARNING):
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "dependencies": {
            "database": "unavailable",
            "payment_expiry_worker": "running",
        },
    }
    assert response.headers["X-Request-ID"] in caplog.text
    assert "private-db-password" not in response.text + caplog.text
    assert "customer@example.com" not in response.text + caplog.text


@pytest.mark.smoke
def test_request_id_is_generated_returned_and_logs_omit_request_data(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="shop_api.main"):
        response = client.get(
            "/health/live?email=customer@example.com",
            headers={
                "Authorization": "Bearer private-token",
                "X-Request-ID": "caller-controlled-id",
            },
        )

    request_id = response.headers["X-Request-ID"]
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert request_id in caplog.text
    assert "caller-controlled-id" not in caplog.text
    assert "private-token" not in caplog.text
    assert "customer@example.com" not in caplog.text


@pytest.mark.smoke
def test_unhandled_error_returns_request_id_without_exception_details(
    engine,
    tmp_path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def fail() -> None:
        raise RuntimeError("private-token customer@example.com")

    app = create_app(
        settings=Settings(database_url=f"sqlite:///{tmp_path / 'unhandled-error.db'}"),
        db_engine=engine,
    )
    app.add_api_route("/_test/unhandled-error", fail)

    with caplog.at_level(logging.ERROR, logger="shop_api.main"):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/_test/unhandled-error")

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert response.headers["X-Request-ID"] in caplog.text
    assert "private-token" not in caplog.text
    assert "customer@example.com" not in caplog.text
