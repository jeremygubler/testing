"""Unit tests for hashing and tokens – no database involved."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core import security
from app.core.config import get_settings


def test_password_hash_roundtrip() -> None:
    hashed = security.hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert hashed.startswith("$argon2")
    assert security.verify_password(hashed, "correct horse battery staple")
    assert not security.verify_password(hashed, "wrong password")


def test_password_hashes_are_salted() -> None:
    assert security.hash_password("same") != security.hash_password("same")


def test_verify_password_rejects_garbage_hash() -> None:
    # A corrupted row must fail the login, not raise.
    assert not security.verify_password("not-a-hash", "whatever")


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token, expires_at = security.create_access_token(user_id)
    payload = security.decode_access_token(token)
    assert payload.user_id == user_id
    assert payload.expires_at == pytest.approx(expires_at, abs=timedelta(seconds=1))


def test_access_token_rejects_wrong_signature() -> None:
    token, _ = security.create_access_token(uuid.uuid4())
    tampered = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")
    with pytest.raises(security.TokenError):
        security.decode_access_token(tampered)


def test_expired_access_token_is_rejected() -> None:
    settings = get_settings()
    past = datetime.now(UTC) - timedelta(minutes=5)
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "exp": int(past.timestamp()),
            "iat": int((past - timedelta(minutes=1)).timestamp()),
            "type": "access",
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(security.TokenError):
        security.decode_access_token(token)


def test_non_access_token_type_is_rejected() -> None:
    # A token minted for another purpose must not open the API.
    settings = get_settings()
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
            "type": "refresh",
        },
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(security.TokenError):
        security.decode_access_token(token)


def test_opaque_tokens_are_unique_and_long() -> None:
    tokens = {security.generate_opaque_token() for _ in range(100)}
    assert len(tokens) == 100
    assert all(len(token) >= 40 for token in tokens)


def test_fingerprint_is_stable_and_hex() -> None:
    token = security.generate_opaque_token()
    assert security.fingerprint(token) == security.fingerprint(token)
    assert len(security.fingerprint(token)) == 64
    assert security.fingerprint(token) != security.fingerprint(security.generate_opaque_token())


def test_normalize_email() -> None:
    assert security.normalize_email("  Me@Example.COM ") == "me@example.com"
