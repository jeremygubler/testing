from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.v1 import health
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import dispose_engine

logger = logging.getLogger("reiseapp")


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "type": exc.type, "message": exc.message}},
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "type": "http_error", "message": exc.detail}},
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": 422,
                "type": "validation_error",
                "message": "Validation failed",
                # jsonable_encoder is required, not cosmetic: a ValueError raised
                # inside a pydantic validator lands in ctx and JSONResponse cannot
                # serialise it – the handler itself would then fail with a 500.
                "details": jsonable_encoder(exc.errors()),
            }
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "type": "internal_error",
                "message": "Internal server error",
            }
        },
    )


def _mount_viewer(app: FastAPI, viewer_path: str) -> None:
    """Serves the read-only web viewer from the same origin as the API.

    Same origin on purpose: a shared link then needs no CORS, no second
    hostname and no second certificate — on a homelab that is three fewer
    things to get wrong.
    """
    root = Path(viewer_path)
    if not root.is_absolute():
        root = (Path(__file__).resolve().parent.parent / viewer_path).resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.info("web viewer not found at %s – serving API only", root)
        return

    app.mount("/viewer", StaticFiles(directory=root), name="viewer")

    @app.get("/s/{token}", include_in_schema=False)
    async def shared_page(token: str) -> FileResponse:
        # The token is never read here; the page fetches it from the API itself,
        # which keeps it out of server-side rendering and logs.
        return FileResponse(index)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    logger.info("reiseapp backend %s starting (env=%s)", __version__, settings.env)
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="reiseapp",
        version=__version__,
        summary="Self-hosted travel tracking backend",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url="/openapi.json" if not settings.is_production else None,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(api_router, prefix=settings.api_prefix)
    # Unprefixed probes for Docker/Kubernetes healthchecks.
    app.include_router(health.router, prefix="/health", include_in_schema=False)

    _mount_viewer(app, settings.viewer_path)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app


app = create_app()
