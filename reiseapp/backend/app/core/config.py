from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process configuration. Every field maps to a REISEAPP_* environment variable."""

    model_config = SettingsConfigDict(
        env_prefix="REISEAPP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["development", "production", "test"] = "development"
    log_level: str = "info"
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://reiseapp:reiseapp@localhost:5432/reiseapp"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    jwt_secret: SecretStr = SecretStr("dev-only-insecure-secret")
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    s3_endpoint_url: str = "http://localhost:9000"
    # URL handed to clients in presigned links – differs from the internal one
    # as soon as the backend talks to MinIO over the compose network.
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "reiseapp-minio"
    s3_secret_key: SecretStr = SecretStr("reiseapp-minio")
    s3_bucket: str = "reiseapp-media"
    s3_region: str = "us-east-1"

    cors_origins: list[str] = Field(default_factory=list)
    run_migrations_on_startup: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        # Compose passes a comma-separated string; pydantic would try JSON otherwise.
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def sync_database_url(self) -> str:
        """psycopg-style URL – alembic's offline mode and tooling want a sync driver."""
        return self.database_url.replace("+asyncpg", "")

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
