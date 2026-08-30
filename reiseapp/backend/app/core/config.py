from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_JWT_SECRET = "dev-only-insecure-secret"


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

    jwt_secret: SecretStr = SecretStr(_DEV_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # "s3" talks to MinIO; "filesystem" writes to a plain directory for setups
    # that would rather not run an object store at all.
    storage_backend: Literal["s3", "filesystem"] = "s3"
    storage_path: str = "/srv/media"
    max_upload_bytes: int = 64 * 1024 * 1024
    # Google Timeline takeouts are routinely hundreds of megabytes.
    max_import_bytes: int = 256 * 1024 * 1024
    thumbnail_max_px: int = 512

    s3_endpoint_url: str = "http://localhost:9000"
    # URL handed to clients in presigned links – differs from the internal one
    # as soon as the backend talks to MinIO over the compose network.
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "reiseapp-minio"
    s3_secret_key: SecretStr = SecretStr("reiseapp-minio")
    s3_bucket: str = "reiseapp-media"
    s3_region: str = "us-east-1"

    # Invite-only by default: a self-hosted instance on the open internet must not
    # hand out accounts to anyone who finds the URL.
    allow_registration: bool = False
    invite_ttl_days: int = 14

    # Tile source for the web viewer. The MapLibre demo tiles are fine to start
    # with and explicitly not meant for production; point this at a tileserver in
    # the homelab to keep the map self-hosted too.
    viewer_map_style_url: str = "https://demotiles.maplibre.org/style.json"
    viewer_path: str = "../web"

    # NoDecode is load-bearing: without it the env source JSON-decodes the raw
    # value before any validator runs, so a comma-separated list is a parse error
    # and an empty REISEAPP_CORS_ORIGINS="" crashes the process at startup —
    # which is exactly what compose passes when CORS_ORIGINS is unset.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    run_migrations_on_startup: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value.strip()
        # NoDecode turned off the automatic JSON parsing, but a JSON array is
        # what pydantic-settings documents and what earlier versions of this file
        # accepted, so keep honouring it alongside the comma-separated form.
        if text.startswith("["):
            try:
                return json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    "REISEAPP_CORS_ORIGINS looks like JSON but does not parse; "
                    "use a comma-separated list instead"
                ) from exc
        return [item.strip() for item in text.split(",") if item.strip()]

    @model_validator(mode="after")
    def _reject_weak_production_secrets(self) -> Settings:
        # PyJWT only warns about a short HMAC key. On an instance that is reachable
        # from the internet, a guessable secret means forgeable access tokens.
        if self.env == "production":
            secret = self.jwt_secret.get_secret_value()
            if secret == _DEV_JWT_SECRET or len(secret) < 32:
                raise ValueError(
                    "REISEAPP_JWT_SECRET must be at least 32 characters in production "
                    "(generate one with: openssl rand -hex 32)"
                )
        return self

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
