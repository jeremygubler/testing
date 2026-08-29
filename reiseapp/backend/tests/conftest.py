from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("REISEAPP_ENV", "test")
os.environ.setdefault("REISEAPP_JWT_SECRET", "test-secret")


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Trigger lifespan-free startup: create_app() has no side effects that
        # need the DB, so the ASGI transport is enough for unit-level tests.
        yield ac
