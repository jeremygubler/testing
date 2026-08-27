from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.ddl  # noqa: F401  registriert Trigger/Index-DDL an der Metadata
from app.config import get_settings

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
