"""Consistent error JSON: {detail: str, code: str, ...extra}."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("quantdesk.errors")


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, detail: str, *, code: str | None = None, status_code: int | None = None, **extra: Any):
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.extra = extra


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ValidationAppError(AppError):
    status_code = 400
    code = "validation_error"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class AuthError(AppError):
    status_code = 401
    code = "not_authenticated"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class InsufficientDataError(AppError):
    status_code = 422
    code = "insufficient_data"


_STATUS_CODES = {
    400: "bad_request", 401: "not_authenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
    409: "conflict", 413: "payload_too_large", 422: "validation_error", 429: "rate_limited", 500: "internal_error",
}


def error_body(detail: str, code: str, **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"detail": detail, "code": code}
    body.update(extra)
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_req: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.detail, exc.code, **exc.extra))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_req: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        headers = getattr(exc, "headers", None)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(detail, _STATUS_CODES.get(exc.status_code, "error")),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_req: Request, exc: RequestValidationError):
        errors = []
        for e in exc.errors():
            loc = ".".join(str(p) for p in e.get("loc", ()) if p != "body")
            errors.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
        detail = "; ".join(errors) or "Invalid request"
        return JSONResponse(status_code=422, content=error_body(detail, "validation_error", errors=errors))

    @app.exception_handler(Exception)
    async def _unhandled(_req: Request, exc: Exception):  # pragma: no cover - safety net
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(status_code=500, content=error_body("Internal server error", "internal_error"))
