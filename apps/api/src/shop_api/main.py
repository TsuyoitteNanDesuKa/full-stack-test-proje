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
from shop_api.routes import auth, home, products


def create_app(settings: Settings | None = None, db_engine: Engine | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    engine = db_engine or create_database_engine(app_settings.database_url)
    owns_engine = db_engine is None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
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
    return app
