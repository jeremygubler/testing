from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.ddl  # noqa: F401  registriert Trigger/Index-DDL an der Metadata
from app.config import get_settings
from app.routers import (
    analytics,
    budgets,
    calendar,
    categories,
    households,
    io,
    members,
    recurring,
    savings,
    transactions,
)
from app.services.splits import SplitError

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(
    title="Haushaltsbudget API",
    version="0.1.0",
    description=(
        "Alle Geldbetraege werden als ganzzahlige Minoreinheiten (Rappen/Cent) "
        "uebertragen. Die Formatierung passiert im Frontend."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(SplitError)
async def _split_error_handler(_request: Request, exc: SplitError) -> JSONResponse:
    """Fachliche Fehler der Aufteilungslogik werden zu 422 mit lesbarer Meldung."""
    return JSONResponse(
        status_code=422, content={"detail": str(exc)}
    )


app.include_router(households.router)
app.include_router(members.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(budgets.router)
app.include_router(analytics.router)
app.include_router(recurring.router)
app.include_router(savings.router)
app.include_router(calendar.router)
app.include_router(io.router)
