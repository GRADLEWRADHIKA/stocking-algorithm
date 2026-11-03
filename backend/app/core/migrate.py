"""Programmatic Alembic upgrade used at startup (falls back to metadata.create_all on failure)."""
from __future__ import annotations

import logging

from app.core.config import BACKEND_DIR, get_settings

logger = logging.getLogger("quantdesk.migrate")


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    cfg.attributes["skip_logging_config"] = True
    command.upgrade(cfg, "head")


def ensure_schema() -> None:
    from app.core.db import create_all

    if get_settings().RUN_MIGRATIONS_ON_STARTUP:
        try:
            run_migrations()
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("Alembic upgrade failed (%s); falling back to create_all()", exc)
    create_all()
