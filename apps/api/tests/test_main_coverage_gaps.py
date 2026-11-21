"""Coverage gap tests for main.py: unsupported payment provider and expiry worker failure state."""

import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import shop_api.main as main_module
from shop_api.config import Settings
from shop_api.main import create_app


def test_settings_reject_unsupported_payment_provider_before_app_creation(tmp_path) -> None:
    with pytest.raises(ValidationError, match="Only the mock sandbox provider"):
        Settings(
            database_url=f"sqlite:///{tmp_path / 'unsupported-provider.db'}",
            payment_provider="stripe",
        )


def test_worker_that_returns_unexpectedly_is_marked_stopped_and_warned(
    tmp_path,
    monkeypatch,
    caplog,
) -> None:
    async def returning_worker(_session_factory) -> None:
        return None

    monkeypatch.setattr(main_module, "payment_expiry_worker", returning_worker)
    app = create_app(settings=Settings(database_url=f"sqlite:///{tmp_path / 'worker-returns.db'}"))

    with caplog.at_level(logging.WARNING, logger="shop_api.main"):
        with TestClient(app) as client:
            assert client.get("/health/live").status_code == 200

    assert "Payment expiry worker exited unexpectedly." in caplog.text
    assert app.state.payment_expiry_worker_status == "stopped"


def test_worker_failure_during_lifespan_is_logged_without_message_text(
    tmp_path,
    monkeypatch,
    caplog,
) -> None:
    async def failing_worker(_session_factory) -> None:
        raise RuntimeError("secret-detail-do-not-log")

    monkeypatch.setattr(main_module, "payment_expiry_worker", failing_worker)
    app = create_app(settings=Settings(database_url=f"sqlite:///{tmp_path / 'worker-failure.db'}"))

    with caplog.at_level(logging.ERROR, logger="shop_api.main"):
        with TestClient(app) as client:
            assert client.get("/health/live").status_code == 200

    assert "Payment expiry worker failed (error_type=RuntimeError)." in caplog.text
    assert "secret-detail-do-not-log" not in caplog.text
    assert app.state.payment_expiry_worker_status == "failed"
