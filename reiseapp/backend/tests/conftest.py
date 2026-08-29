from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

import pytest
from httpx import ASGITransport, AsyncClient

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession

os.environ.setdefault("REISEAPP_ENV", "test")
os.environ.setdefault("REISEAPP_JWT_SECRET", "test-secret-" + "0" * 32)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """App without a database – for routing, validation and error-envelope tests."""
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# --- database-backed fixtures (integration tests only) ----------------------


@pytest.fixture
async def db_engine() -> AsyncIterator[AsyncEngine]:
    """One NullPool engine per test.

    pytest-asyncio gives every test a fresh event loop; a pooled asyncpg
    connection from a previous loop fails with "attached to a different loop".
    """
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import get_settings

    engine = create_async_engine(
        get_settings().database_url,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": "public"}},
    )
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_connection(db_engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    """A connection with an open transaction that is rolled back after the test.

    Every session in the test — the fixtures' and the app's — joins this
    transaction via savepoints, so the database is left exactly as it was found.
    """
    async with db_engine.connect() as connection:
        transaction = await connection.begin()
        yield connection
        await transaction.rollback()


@pytest.fixture
async def db_session(db_connection: AsyncConnection) -> AsyncIterator[AsyncSession]:
    from sqlalchemy.ext.asyncio import AsyncSession

    async with AsyncSession(
        bind=db_connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    ) as session:
        yield session


@pytest.fixture
async def api(db_connection: AsyncConnection) -> AsyncIterator[AsyncClient]:
    """HTTP client whose requests run inside the test transaction."""
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.session import get_session
    from app.main import create_app

    app = create_app()

    async def _session_override() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(
            bind=db_connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        ) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_session] = _session_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
