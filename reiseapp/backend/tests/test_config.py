from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_cors_origins_parsed_from_comma_separated_env() -> None:
    settings = Settings(cors_origins="https://a.example, https://b.example ,")
    assert settings.cors_origins == ["https://a.example", "https://b.example"]


def test_cors_origins_default_empty() -> None:
    assert Settings(cors_origins="").cors_origins == []


# The two tests above pass a keyword argument, which reaches the init source and
# never touches the env source's JSON decoding. Everything below goes through a
# real environment variable, the way docker compose sets it. That distinction is
# not academic: it is the difference between a green suite and a backend that
# restart-loops on a fresh install.
def test_empty_cors_origins_env_var_does_not_crash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # compose renders `${CORS_ORIGINS:-}` to an empty string, not to an absent
    # variable, so this is the documented default configuration.
    monkeypatch.setenv("REISEAPP_CORS_ORIGINS", "")
    assert Settings().cors_origins == []


def test_cors_origins_env_var_accepts_a_comma_separated_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REISEAPP_CORS_ORIGINS", "https://a.example,https://b.example")
    assert Settings().cors_origins == ["https://a.example", "https://b.example"]


def test_cors_origins_env_var_accepts_a_single_origin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A bare URL is not valid JSON either — the failure mode is the same.
    monkeypatch.setenv("REISEAPP_CORS_ORIGINS", "https://reise.example")
    assert Settings().cors_origins == ["https://reise.example"]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("[]", []), ('["https://a.example"]', ["https://a.example"])],
)
def test_cors_origins_env_var_still_accepts_json(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: list[str]
) -> None:
    # JSON is what pydantic-settings documents; turning off its decoder must not
    # silently reinterpret "[]" as an origin literally named "[]".
    monkeypatch.setenv("REISEAPP_CORS_ORIGINS", raw)
    assert Settings().cors_origins == expected


def test_cors_origins_env_var_rejects_broken_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REISEAPP_CORS_ORIGINS", '["https://a.example"')
    with pytest.raises(ValidationError, match="comma-separated"):
        Settings()


def test_sync_database_url_strips_async_driver() -> None:
    settings = Settings(database_url="postgresql+asyncpg://u:p@db:5432/reiseapp")
    assert settings.sync_database_url == "postgresql://u:p@db:5432/reiseapp"


def test_jwt_secret_is_not_leaked_in_repr() -> None:
    settings = Settings(jwt_secret="super-secret")
    assert "super-secret" not in repr(settings)
    assert settings.jwt_secret.get_secret_value() == "super-secret"


def test_production_rejects_the_dev_jwt_secret() -> None:
    # Passed explicitly: the test environment exports a valid secret.
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(env="production", jwt_secret="dev-only-insecure-secret")


def test_production_rejects_a_short_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(env="production", jwt_secret="too-short")


def test_production_accepts_a_strong_jwt_secret() -> None:
    settings = Settings(env="production", jwt_secret="a" * 64)
    assert settings.is_production


def test_development_tolerates_the_default_secret() -> None:
    # Local runs must stay zero-config.
    assert Settings(env="development").jwt_secret.get_secret_value()
