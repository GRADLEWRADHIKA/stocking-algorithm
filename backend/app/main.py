"""QuantDesk API entry point: `uvicorn app.main:app --reload --port 8000`."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import admin, auth, market, strategies, trading, user_data
from app.core.config import get_settings
from app.core.db import SessionLocal, init_engine
from app.core.errors import install_error_handlers
from app.core.rate_limit import RateLimitMiddleware
from app.services.simulation import controller, init_live_market
from app.websocket import routes as ws_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("quantdesk")


def _startup_sync() -> None:
    from app.core.migrate import ensure_schema
    from app.models import SimulatorState, Stock

    s = get_settings()
    ensure_schema()
    with SessionLocal() as db:
        empty = db.execute(select(Stock.id).limit(1)).first() is None
    if empty and s.AUTO_SEED:
        from app.scripts.seed import seed_all

        logger.info("Empty database: auto-seeding SIMULATED market data and demo users (one-time)...")
        logger.info("Seed summary: %s", seed_all())
    if init_live_market():
        with SessionLocal() as db:
            st = db.execute(select(SimulatorState)).scalar_one_or_none()
        controller.tick_interval_ms = (st.tick_interval_ms if st else None) or s.SIMULATOR_TICK_MS
        controller.running = bool(s.SIMULATOR_AUTOSTART and (st.is_running if st else True))
    else:
        logger.warning("No market data found; run `python -m app.scripts.seed` to create simulated data.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine()
    await asyncio.to_thread(_startup_sync)
    controller.start_loop()
    logger.info("QuantDesk API ready (simulator running=%s)", controller.running)
    yield
    await controller.stop_loop()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title=s.APP_NAME, version=s.VERSION, lifespan=lifespan,
        description=("Local-first algorithmic stock analysis and paper-trading API for NSE/BSE-style markets. "
                     "All market data is SIMULATED (or user-imported HISTORICAL_DATASET) and labelled via data_source. "
                     "Nothing here is investment advice."),
    )
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    install_error_handlers(app)
    for r in (admin.public, auth.router, auth.users, market.router, strategies.router, trading.backtests, trading.paper,
              trading.portfolio, user_data.watchlists, user_data.alerts, user_data.notifications,
              user_data.assistant_router, admin.router, ws_routes.router):
        app.include_router(r)
    return app


app = create_app()
