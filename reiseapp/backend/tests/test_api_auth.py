from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import get_settings
from app.models import Invite, RefreshToken
from tests.factories import DEFAULT_PASSWORD, as_user, auth, login, make_user

pytestmark = pytest.mark.integration

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"
INVITES = "/api/v1/auth/invites"


async def _make_invite(session: AsyncSession, email: str | None = None, days: int = 7) -> str:
    code = security.generate_opaque_token()
    session.add(
        Invite(
            code_hash=security.fingerprint(code),
            email=email,
            expires_at=datetime.now(UTC) + timedelta(days=days),
        )
    )
    await session.commit()
    return code


def _registration_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "email": f"{uuid.uuid4()}@example.test",
        "display_name": "Neue Person",
        "password": DEFAULT_PASSWORD,
    }
    payload.update(overrides)
    return payload


async def test_registration_is_closed_without_an_invite(api: AsyncClient) -> None:
    response = await api.post(REGISTER, json=_registration_payload())
    assert response.status_code == 403
    assert response.json()["error"]["type"] == "registration_closed"


async def test_registration_with_a_valid_invite(api: AsyncClient, db_session: AsyncSession) -> None:
    code = await _make_invite(db_session)
    response = await api.post(REGISTER, json=_registration_payload(invite_code=code))
    assert response.status_code == 201, response.text
    assert response.json()["is_admin"] is False


async def test_an_invite_works_only_once(api: AsyncClient, db_session: AsyncSession) -> None:
    code = await _make_invite(db_session)
    first = await api.post(REGISTER, json=_registration_payload(invite_code=code))
    assert first.status_code == 201
    second = await api.post(REGISTER, json=_registration_payload(invite_code=code))
    assert second.status_code == 403


async def test_expired_invite_is_rejected(api: AsyncClient, db_session: AsyncSession) -> None:
    code = await _make_invite(db_session, days=-1)
    response = await api.post(REGISTER, json=_registration_payload(invite_code=code))
    assert response.status_code == 403


async def test_invite_bound_to_an_email_rejects_other_addresses(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    code = await _make_invite(db_session, email="wanted@example.test")
    wrong = await api.post(REGISTER, json=_registration_payload(invite_code=code))
    assert wrong.status_code == 403

    right = await api.post(
        REGISTER, json=_registration_payload(invite_code=code, email="Wanted@Example.test")
    )
    assert right.status_code == 201
    # Emails are normalised on the way in.
    assert right.json()["email"] == "wanted@example.test"


async def test_duplicate_email_conflicts(api: AsyncClient, db_session: AsyncSession) -> None:
    existing = await make_user(db_session)
    code = await _make_invite(db_session)
    response = await api.post(
        REGISTER, json=_registration_payload(invite_code=code, email=existing.email)
    )
    assert response.status_code == 409


async def test_open_registration_needs_no_invite(
    api: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "allow_registration", True)
    response = await api.post(REGISTER, json=_registration_payload())
    assert response.status_code == 201


async def test_login_and_me(api: AsyncClient, db_session: AsyncSession) -> None:
    user = await make_user(db_session, display_name="Reisende")
    token = await login(api, user)
    response = await api.get(ME, headers=auth(token))
    assert response.status_code == 200
    assert response.json()["display_name"] == "Reisende"


async def test_login_is_case_insensitive_on_the_email(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    user = await make_user(db_session, email="Mixed@Example.test")
    response = await api.post(
        LOGIN, json={"email": "MIXED@example.TEST", "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 200
    assert user.email == "mixed@example.test"


async def test_login_rejects_wrong_password(api: AsyncClient, db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    response = await api.post(LOGIN, json={"email": user.email, "password": "falsch-falsch-1"})
    assert response.status_code == 401


async def test_login_rejects_unknown_email(api: AsyncClient) -> None:
    response = await api.post(
        LOGIN, json={"email": "nobody@example.test", "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 401


async def test_inactive_account_cannot_log_in(api: AsyncClient, db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    user.is_active = False
    await db_session.commit()
    response = await api.post(LOGIN, json={"email": user.email, "password": DEFAULT_PASSWORD})
    assert response.status_code == 401


async def test_me_requires_a_token(api: AsyncClient) -> None:
    assert (await api.get(ME)).status_code == 401
    assert (await api.get(ME, headers=auth("not-a-token"))).status_code == 401


async def test_refresh_rotates_the_token(api: AsyncClient, db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    tokens = (
        await api.post(LOGIN, json={"email": user.email, "password": DEFAULT_PASSWORD})
    ).json()

    rotated = await api.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != tokens["refresh_token"]

    # The new one keeps working.
    again = await api.post(REFRESH, json={"refresh_token": rotated.json()["refresh_token"]})
    assert again.status_code == 200


async def test_replaying_a_used_refresh_token_kills_the_family(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    user = await make_user(db_session)
    tokens = (
        await api.post(LOGIN, json={"email": user.email, "password": DEFAULT_PASSWORD})
    ).json()
    rotated = (
        await api.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    ).json()

    replay = await api.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401

    # A leaked token means every session of that user is suspect.
    successor = await api.post(REFRESH, json={"refresh_token": rotated["refresh_token"]})
    assert successor.status_code == 401

    alive = await db_session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
        )
    )
    assert alive.scalars().all() == []


async def test_logout_revokes_the_refresh_token(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    user = await make_user(db_session)
    tokens = (
        await api.post(LOGIN, json={"email": user.email, "password": DEFAULT_PASSWORD})
    ).json()

    logout = {"refresh_token": tokens["refresh_token"]}
    assert (await api.post(LOGOUT, json=logout)).status_code == 204
    assert (await api.post(REFRESH, json=logout)).status_code == 401
    # Logging out twice is not an error.
    assert (await api.post(LOGOUT, json=logout)).status_code == 204


async def test_only_admins_can_mint_invites(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    assert (await api.post(INVITES, json={}, headers=headers)).status_code == 403

    _, admin_headers = await as_user(api, db_session, is_admin=True)
    created = await api.post(INVITES, json={"email": "friend@example.test"}, headers=admin_headers)
    assert created.status_code == 201
    code = created.json()["code"]

    # The code is returned once and stored only as a hash.
    listed = await api.get(INVITES, headers=admin_headers)
    assert listed.status_code == 200
    assert all("code" not in item for item in listed.json())

    registered = await api.post(
        REGISTER, json=_registration_payload(invite_code=code, email="friend@example.test")
    )
    assert registered.status_code == 201
