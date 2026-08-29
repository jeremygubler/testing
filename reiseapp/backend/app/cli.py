"""Admin CLI – the way to bootstrap an invite-only instance.

    docker compose exec backend python -m app.cli create-user --email me@example.com \
        --display-name "Me" --admin
    docker compose exec backend python -m app.cli create-invite --email friend@example.com
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core import security
from app.core.config import get_settings
from app.models import Invite, User


async def _session() -> tuple[AsyncSession, AsyncEngine]:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    return AsyncSession(engine, expire_on_commit=False), engine


async def create_user(email: str, display_name: str, password: str, is_admin: bool) -> int:
    session, engine = await _session()
    async with session:
        normalized = security.normalize_email(email)
        existing = await session.execute(select(User).where(User.email == normalized))
        if existing.scalar_one_or_none() is not None:
            print(f"error: a user with {normalized} already exists", file=sys.stderr)
            return 1
        user = User(
            email=normalized,
            display_name=display_name.strip(),
            password_hash=security.hash_password(password),
            is_admin=is_admin,
        )
        session.add(user)
        await session.commit()
        print(f"created user {user.email} (admin={user.is_admin}) id={user.id}")
    await engine.dispose()
    return 0


async def create_invite(email: str | None, ttl_days: int) -> int:
    session, engine = await _session()
    async with session:
        code = security.generate_opaque_token()
        invite = Invite(
            code_hash=security.fingerprint(code),
            email=security.normalize_email(email) if email else None,
            expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
        )
        session.add(invite)
        await session.commit()
        print(f"invite code: {code}")
        print(f"valid until: {invite.expires_at.isoformat()}")
        if invite.email:
            print(f"bound to:    {invite.email}")
    await engine.dispose()
    return 0


async def promote(email: str) -> int:
    session, engine = await _session()
    async with session:
        normalized = security.normalize_email(email)
        result = await session.execute(select(User).where(User.email == normalized))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"error: no user with {normalized}", file=sys.stderr)
            return 1
        user.is_admin = True
        await session.commit()
        print(f"{user.email} is now an administrator")
    await engine.dispose()
    return 0


def _read_password(given: str | None) -> str:
    password = given or getpass.getpass("Password: ")
    if len(password) < 10:
        raise SystemExit("error: password must be at least 10 characters")
    return password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="reiseapp admin CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_user = sub.add_parser("create-user", help="create an account (bypasses invites)")
    p_user.add_argument("--email", required=True)
    p_user.add_argument("--display-name", required=True)
    p_user.add_argument("--password", help="prompted for when omitted")
    p_user.add_argument("--admin", action="store_true", help="may issue invites")

    p_invite = sub.add_parser("create-invite", help="mint a registration code")
    p_invite.add_argument("--email", help="bind the code to one address")
    p_invite.add_argument("--ttl-days", type=int, default=None)

    p_promote = sub.add_parser("promote", help="grant administrator rights")
    p_promote.add_argument("--email", required=True)

    args = parser.parse_args(argv)

    if args.command == "create-user":
        return asyncio.run(
            create_user(
                args.email, args.display_name, _read_password(args.password), args.admin
            )
        )
    if args.command == "create-invite":
        ttl = args.ttl_days or get_settings().invite_ttl_days
        return asyncio.run(create_invite(args.email, ttl))
    return asyncio.run(promote(args.email))


if __name__ == "__main__":
    raise SystemExit(main())
