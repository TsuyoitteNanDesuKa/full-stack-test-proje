import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from jwt import PyJWKClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from shop_api.config import Settings, get_settings
from shop_api.database import create_database_engine
from shop_api.keycloak_admin import KeycloakRoleProvisioner
from shop_api.payment_expiry import payment_expiry_worker
from shop_api.payment_providers import MockPaymentProvider
from shop_api.request_context import bind_request_id, get_logger, reset_request_id
from shop_api.routes import (
    addresses,
    auth,
    cart,
    favorites,
    health,
    home,
    orders,
    payments,
    products,
    reviews,
    seller_applications,
    seller_orders,
)

logger = get_logger(__name__)


def create_app(settings: Settings | None = None, db_engine: Engine | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    engine = db_engine or create_database_engine(app_settings.database_url)
    owns_engine = db_engine is None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async def run_expiry_worker() -> None:
            try:
                await payment_expiry_worker(app.state.session_factory)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                app.state.payment_expiry_worker_status = "failed"
                logger.error(
                    "Payment expiry worker failed (error_type=%s).",
                    type(error).__name__,
                )
            else:
                app.state.payment_expiry_worker_status = "stopped"
                logger.warning("Payment expiry worker exited unexpectedly.")

        app.state.payment_expiry_worker_status = "running"
        expiry_task = asyncio.create_task(
            run_expiry_worker(),
            name="payment-expiry-worker",
        )
        app.state.payment_expiry_worker_task = expiry_task
        logger.info("Payment expiry worker started.")
        try:
            yield
        finally:
            if app.state.payment_expiry_worker_status == "running":
                app.state.payment_expiry_worker_status = "stopping"
            logger.info("Payment expiry worker stopping.")
            expiry_task.cancel()
            try:
                await expiry_task
            except asyncio.CancelledError:
                pass
            finally:
                if app.state.payment_expiry_worker_status != "failed":
                    app.state.payment_expiry_worker_status = "stopped"
                if owns_engine:
                    engine.dispose()
                logger.info("Payment expiry worker stopped.")

    app = FastAPI(
        title="Online Store API",
        version="0.1.0",
        description="API for Keycloak-authenticated storefront and product catalog access.",
        lifespan=lifespan,
    )
    app.state.oidc_issuer = app_settings.oidc_issuer
    app.state.oidc_audience = app_settings.oidc_audience
    app.state.settings = app_settings
    app.state.engine = engine
    app.state.payment_expiry_worker_status = "starting"
    app.state.payment_expiry_worker_task = None
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

    @app.middleware("http")
    async def correlate_request(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        request_id = uuid4().hex
        request.state.request_id = request_id
        token = bind_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            logger.info(
                "Request completed (method=%s, status_code=%s).",
                request.method,
                response.status_code,
            )
            return response
        finally:
            reset_request_id(token)

    @app.exception_handler(Exception)
    async def internal_error_handler(
        request: Request,
        error: Exception,
    ) -> PlainTextResponse:
        request_id = getattr(request.state, "request_id", None)
        if isinstance(request_id, str):
            token = bind_request_id(request_id)
            try:
                logger.error(
                    "Request failed (method=%s, error_type=%s).",
                    request.method,
                    type(error).__name__,
                )
            finally:
                reset_request_id(token)
            headers = {"X-Request-ID": request_id}
        else:
            logger.error(
                "Request failed (method=%s, error_type=%s).",
                request.method,
                type(error).__name__,
            )
            headers = {}
        return PlainTextResponse(
            "Internal Server Error",
            status_code=500,
            headers=headers,
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
    app.include_router(health.router)
    app.include_router(home.router)
    app.include_router(products.router)
    app.include_router(favorites.router)
    app.include_router(reviews.router)
    app.include_router(addresses.router)
    app.include_router(seller_applications.router)
    app.include_router(seller_orders.router)
    app.include_router(cart.router)
    app.include_router(orders.router)
    app.include_router(orders.admin_router)
    app.include_router(payments.router)
    return app
