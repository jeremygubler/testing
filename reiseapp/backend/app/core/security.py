"""Password hashing (Argon2) and tokens.

Access tokens are short-lived JWTs; refresh tokens are opaque random strings whose
SHA-256 lives in the database. That split is deliberate: a JWT cannot be revoked
before it expires, and a self-hosted instance needs a working logout.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()

ACCESS_TOKEN_TYPE = "access"


class TokenError(Exception):
    """Raised for any token that must not be trusted."""


@dataclass(frozen=True)
class AccessTokenPayload:
    user_id: uuid.UUID
    expires_at: datetime


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return True


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash uses weaker parameters than the current policy."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def create_access_token(user_id: uuid.UUID) -> tuple[str, datetime]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_ttl_minutes)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": secrets.token_urlsafe(12),
        "type": ACCESS_TOKEN_TYPE,
    }
    token = jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return token, expires_at


def decode_access_token(token: str) -> AccessTokenPayload:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    if payload.get("type") != ACCESS_TOKEN_TYPE:
        # A refresh token must never be usable as a bearer token.
        raise TokenError("wrong token type")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise TokenError("malformed subject") from exc
    return AccessTokenPayload(
        user_id=user_id, expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC)
    )


def generate_opaque_token() -> str:
    """Refresh tokens and invite codes – 256 bits of entropy, URL-safe."""
    return secrets.token_urlsafe(32)


def fingerprint(token: str) -> str:
    """SHA-256 of a token; only this is stored.

    No salt and no Argon2 on purpose: these are high-entropy random strings, not
    guessable secrets, and the lookup has to be an indexed equality match.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()
