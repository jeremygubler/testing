"""Helpers for the database-backed API tests."""

from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models import User

DEFAULT_PASSWORD = "ein-sicheres-passwort"


async def make_user(
    session: AsyncSession,
    *,
    email: str | None = None,
    display_name: str = "Test User",
    password: str = DEFAULT_PASSWORD,
    is_admin: bool = False,
) -> User:
    user = User(
        email=email or f"{uuid.uuid4()}@example.test",
        display_name=display_name,
        password_hash=security.hash_password(password),
        is_admin=is_admin,
    )
    session.add(user)
    await session.commit()
    return user


async def login(api: AsyncClient, user: User, password: str = DEFAULT_PASSWORD) -> str:
    response = await api.post(
        "/api/v1/auth/login", json={"email": user.email, "password": password}
    )
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def as_user(
    api: AsyncClient, session: AsyncSession, **kwargs: object
) -> tuple[User, dict[str, str]]:
    """Create a user and return them together with a ready-to-use auth header."""
    user = await make_user(session, **kwargs)  # type: ignore[arg-type]
    return user, auth(await login(api, user))
