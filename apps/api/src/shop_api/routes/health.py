from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from shop_api.request_context import get_logger

logger = get_logger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health/live", include_in_schema=False)
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready", include_in_schema=False, response_model=None)
def readiness(request: Request) -> dict[str, object] | JSONResponse:
    dependencies: dict[str, str] = {}
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        dependencies["database"] = "available"
    except SQLAlchemyError:
        dependencies["database"] = "unavailable"
        logger.warning("Readiness check failed (dependency=database).")

    worker_task = request.app.state.payment_expiry_worker_task
    worker_status = request.app.state.payment_expiry_worker_status
    if worker_status != "running" or worker_task is None or worker_task.done():
        dependencies["payment_expiry_worker"] = "unavailable"
        logger.warning("Readiness check failed (dependency=payment-expiry-worker).")
    else:
        dependencies["payment_expiry_worker"] = "running"

    if all(value != "unavailable" for value in dependencies.values()):
        return {"status": "ok", "dependencies": dependencies}
    return JSONResponse(
        status_code=503,
        content={"status": "not_ready", "dependencies": dependencies},
    )
