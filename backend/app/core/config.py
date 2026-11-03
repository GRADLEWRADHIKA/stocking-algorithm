"""Application settings (pydantic-settings). Only app-owned settings; no third-party credentials."""
from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
DEFAULT_SQLITE_PATH = BACKEND_DIR / "quantdesk.db"

logger = logging.getLogger("quantdesk.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "QuantDesk API"
    VERSION: str = "1.0.0"
    ENV: str = "development"
    DATABASE_URL: str | None = None
    SECRET_KEY: str | None = None
    ACCESS_TOKEN_MINUTES: int = 30
    REFRESH_TOKEN_DAYS: int = 14
    PASSWORD_RESET_MINUTES: int = 30
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://localhost:19006"
    LOCAL_DATA_DIRECTORY: str = str(REPO_ROOT / "datasets")
    SIMULATOR_SEED: int = 42
    SIMULATOR_TICK_MS: int = 1000
    SIMULATOR_AUTOSTART: bool = True
    AUTO_SEED: bool = True
    RUN_MIGRATIONS_ON_STARTUP: bool = True
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 600
    AUTH_RATE_LIMIT_PER_MINUTE: int = 30
    HISTORY_YEARS: int = 3
    INTRADAY_SESSIONS: int = 5
    # Optional fixed "today" (YYYY-MM-DD) used by seeding; defaults to the real current date.
    MARKET_TODAY: str | None = None

    @field_validator("DATABASE_URL")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            return None
        return v

    @property
    def database_url(self) -> str:
        url = self.DATABASE_URL
        if not url or url.startswith("sqlite") and url.strip() in ("sqlite", "sqlite://", "sqlite:///"):
            return f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
        if url.startswith("postgresql://"):
            # Use psycopg v3 driver.
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.ENV.lower() in ("development", "dev", "local", "test")

    @property
    def secret_key(self) -> str:
        return _secret_key(self.SECRET_KEY)


_generated_key: str | None = None


def _secret_key(configured: str | None) -> str:
    global _generated_key
    if configured:
        return configured
    if _generated_key is None:
        _generated_key = secrets.token_urlsafe(48)
        logger.warning(
            "SECRET_KEY is not set; generated a random development key. Tokens will be invalid after restart. "
            "Set SECRET_KEY in .env for persistent sessions."
        )
    return _generated_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
