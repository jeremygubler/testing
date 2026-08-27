from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Laufzeit-Konfiguration. Alle Werte ueber BUDGET_*-Umgebungsvariablen setzbar."""

    model_config = SettingsConfigDict(env_prefix="BUDGET_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/budget.db"
    default_currency: str = "CHF"
    default_locale: str = "de-CH"
    default_timezone: str = "Europe/Zurich"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
    # Version 1 kennt genau einen Haushalt pro Installation.
    single_household_id: int = 1


@lru_cache
def get_settings() -> Settings:
    return Settings()
