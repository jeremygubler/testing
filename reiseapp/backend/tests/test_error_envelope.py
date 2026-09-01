"""The error envelope must survive every kind of failure – no database needed."""

from __future__ import annotations

import json

import pytest
from fastapi.exceptions import RequestValidationError
from httpx import AsyncClient
from pydantic import BaseModel, model_validator

from app.core.errors import ConflictError, NotFoundError
from app.main import app_error_handler, validation_exception_handler


class _Model(BaseModel):
    a: int

    @model_validator(mode="after")
    def _always_fails(self) -> _Model:
        raise ValueError("nope")


async def test_validation_errors_are_json_serialisable() -> None:
    # Regression: a ValueError from a validator ends up in the error's ctx.
    # Without jsonable_encoder the handler itself blows up with a 500.
    try:
        _Model(a=1)
    except Exception as exc:  # noqa: BLE001 – pydantic raises ValidationError
        error = RequestValidationError(errors=exc.errors())  # type: ignore[attr-defined]

    response = await validation_exception_handler(None, error)  # type: ignore[arg-type]
    assert response.status_code == 422
    body = json.loads(bytes(response.body))
    assert body["error"]["type"] == "validation_error"
    detail = body["error"]["details"][0]
    assert detail["msg"] == "Value error, nope"
    # The ValueError object is encoded to an empty dict rather than crashing the
    # handler; the readable text survives in "msg".
    assert detail["ctx"] == {"error": {}}


@pytest.mark.parametrize(
    ("error", "status", "type_"),
    [(NotFoundError("gone"), 404, "not_found"), (ConflictError("dup"), 409, "conflict")],
)
async def test_domain_errors_map_to_the_envelope(
    error: Exception, status: int, type_: str
) -> None:
    response = await app_error_handler(None, error)  # type: ignore[arg-type]
    assert response.status_code == status
    body = json.loads(bytes(response.body))
    assert body["error"] == {"code": status, "type": type_, "message": str(error)}


async def test_unknown_route_uses_the_envelope(client: AsyncClient) -> None:
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["type"] == "http_error"
