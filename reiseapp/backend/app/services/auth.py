from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import get_settings
from app.core.errors import (
    AuthenticationError,
    ConflictError,
    NotFoundError,
    RegistrationClosedError,
)
from app.models import Invite, RefreshToken, User
from app.schemas.auth import InviteCreate, RegisterRequest

# Verified against a throwaway hash when the email is unknown, so that a wrong
# address and a wrong password take the same time to answer.
_DUMMY_HASH = security.hash_password("dummy-password-for-constant-time-login")


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(
        select(User).where(User.email == security.normalize_email(email))
    )
    return result.scalar_one_or_none()


async def _consume_invite(session: AsyncSession, code: str, email: str) -> Invite:
    result = await session.execute(
        select(Invite).where(Invite.code_hash == security.fingerprint(code)).with_for_update()
    )
    invite = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if invite is None or not invite.is_usable(now):
        raise RegistrationClosedError("Invite code is invalid, used or expired")
    if invite.email is not None and security.normalize_email(invite.email) != email:
        raise RegistrationClosedError("Invite code was issued for a different email address")
    invite.used_at = now
    return invite


async def register_user(session: AsyncSession, data: RegisterRequest) -> User:
    settings = get_settings()
    email = security.normalize_email(data.email)

    invite: Invite | None = None
    if not settings.allow_registration:
        if not data.invite_code:
            raise RegistrationClosedError("Registration is invite-only on this instance")
        invite = await _consume_invite(session, data.invite_code, email)

    if await get_user_by_email(session, email) is not None:
        raise ConflictError("An account with this email already exists")

    user = User(
        email=email,
        display_name=data.display_name.strip(),
        password_hash=security.hash_password(data.password),
    )
    session.add(user)
    await session.flush()
    if invite is not None:
        invite.used_by_id = user.id
    return user


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    user = await get_user_by_email(session, email)
    password_hash = user.password_hash if user is not None else _DUMMY_HASH
    valid = security.verify_password(password_hash, password)
    if user is None or not valid or not user.is_active:
        raise AuthenticationError("Invalid email or password")
    if security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(password)
    return user


async def issue_tokens(
    session: AsyncSession, user: User, user_agent: str | None = None
) -> tuple[str, str, datetime]:
    settings = get_settings()
    access_token, expires_at = security.create_access_token(user.id)
    raw_refresh = security.generate_opaque_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=security.fingerprint(raw_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
            user_agent=(user_agent or "")[:200] or None,
        )
    )
    await session.flush()
    return access_token, raw_refresh, expires_at


async def _revoke_all_for_user(session: AsyncSession, user_id: UUID, now: datetime) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


async def rotate_refresh_token(
    session: AsyncSession, raw_token: str, user_agent: str | None = None
) -> tuple[str, str, datetime]:
    now = datetime.now(UTC)
    result = await session.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == security.fingerprint(raw_token))
        .with_for_update()
    )
    token = result.scalar_one_or_none()
    if token is None:
        raise AuthenticationError("Invalid refresh token")

    if token.revoked_at is not None:
        # A revoked token being replayed means it leaked (or the client is badly
        # out of sync). Drop the whole family and force a fresh login.
        await _revoke_all_for_user(session, token.user_id, now)
        raise AuthenticationError("Refresh token was already used; please sign in again")
    if token.expires_at <= now:
        raise AuthenticationError("Refresh token expired")

    user = await session.get(User, token.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Account is not active")

    access_token, raw_refresh, expires_at = await issue_tokens(session, user, user_agent)
    successor = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == security.fingerprint(raw_refresh))
    )
    token.revoked_at = now
    token.replaced_by_id = successor.scalar_one().id
    return access_token, raw_refresh, expires_at


async def revoke_refresh_token(session: AsyncSession, raw_token: str) -> None:
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == security.fingerprint(raw_token))
    )
    token = result.scalar_one_or_none()
    # Logout is idempotent: an unknown or already dead token is not an error.
    if token is not None and token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)


async def create_invite(
    session: AsyncSession, creator: User, data: InviteCreate
) -> tuple[Invite, str]:
    settings = get_settings()
    code = security.generate_opaque_token()
    invite = Invite(
        code_hash=security.fingerprint(code),
        created_by_id=creator.id,
        email=security.normalize_email(data.email) if data.email else None,
        expires_at=datetime.now(UTC)
        + timedelta(days=data.ttl_days or settings.invite_ttl_days),
    )
    session.add(invite)
    await session.flush()
    return invite, code


async def get_user(session: AsyncSession, user_id: UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    return user
