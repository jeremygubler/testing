from __future__ import annotations

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
