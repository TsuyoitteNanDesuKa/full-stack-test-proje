from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import Settings, get_settings
from shop_api.database import create_database_engine
from shop_api.routes import auth, home, products


def create_app(settings: Settings | None = None, db_engine: Engine | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    secret_key = app_settings.signing_key()
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
        description="API for customer login, the storefront, and its product catalog.",
        lifespan=lifespan,
    )
    app.state.secret_key = secret_key
    app.state.access_token_expire_minutes = app_settings.access_token_expire_minutes
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
