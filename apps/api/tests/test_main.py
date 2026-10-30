from fastapi.testclient import TestClient

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
