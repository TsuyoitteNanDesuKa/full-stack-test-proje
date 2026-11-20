import logging
from contextvars import ContextVar, Token
from typing import Any

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


class RequestContextLogger(logging.LoggerAdapter):
    def process(self, message: Any, kwargs: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
        request_id = _request_id.get()
        if request_id is None:
            return message, kwargs
        return f"request_id={request_id} {message}", kwargs


def get_logger(name: str) -> logging.LoggerAdapter:
    return RequestContextLogger(logging.getLogger(name), {})


def bind_request_id(request_id: str) -> Token[str | None]:
    return _request_id.set(request_id)


def reset_request_id(token: Token[str | None]) -> None:
    _request_id.reset(token)
