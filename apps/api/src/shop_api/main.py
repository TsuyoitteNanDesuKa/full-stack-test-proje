import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import Settings, get_settings
from shop_api.database import create_database_engine
from shop_api.keycloak_admin import KeycloakRoleProvisioner
from shop_api.payment_expiry import payment_expiry_worker
from shop_api.payment_providers import MockPaymentProvider
from shop_api.routes import auth, cart, home, orders, payments, products, seller_applications


def create_app(settings: Settings | None = None, db_engine: Engine | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    engine = db_engine or create_database_engine(app_settings.database_url)
    owns_engine = db_engine is None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        expiry_task = asyncio.create_task(payment_expiry_worker(app.state.session_factory))
        try:
            yield
        finally:
            expiry_task.cancel()
            try:
                await expiry_task
            except asyncio.CancelledError:
                pass
            if owns_engine:
                engine.dispose()

    app = FastAPI(
        title="Online Store API",
        version="0.1.0",
        description="API for Keycloak-authenticated storefront and product catalog access.",
        lifespan=lifespan,
    )
    app.state.oidc_issuer = app_settings.oidc_issuer
    app.state.oidc_audience = app_settings.oidc_audience
    app.state.settings = app_settings
    if app_settings.payment_provider != "mock":
        raise ValueError(f"Unsupported payment provider: {app_settings.payment_provider}")
    app.state.payment_provider = MockPaymentProvider(app_settings.payment_webhook_secret)
    app.state.keycloak_role_provisioner = KeycloakRoleProvisioner(app_settings)
    app.state.jwks_client = PyJWKClient(app_settings.jwks_endpoint())
    app.state.session_factory = sessionmaker(
        bind=engine,
        class_=Session,
        autoflush=False,
        expire_on_commit=False,
    )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        details = [
            {key: value for key, value in item.items() if key not in {"input", "ctx"}}
            for item in error.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": details})

    app.include_router(auth.router)
    app.include_router(home.router)
    app.include_router(products.router)
    app.include_router(seller_applications.router)
    app.include_router(cart.router)
    app.include_router(orders.router)
    app.include_router(payments.router)
    return app
