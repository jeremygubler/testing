from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_cors_origins_parsed_from_comma_separated_env() -> None:
    settings = Settings(cors_origins="https://a.example, https://b.example ,")
    assert settings.cors_origins == ["https://a.example", "https://b.example"]


def test_cors_origins_default_empty() -> None:
    assert Settings(cors_origins="").cors_origins == []


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
