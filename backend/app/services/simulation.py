"""Background simulator loop: advances the live session, broadcasts ticks, fills orders, evaluates alerts."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.market_data.calendar import history_and_live_dates, market_today
from app.market_data.live import live_market
from app.market_data.provider import market_data
from app.models import SimulatorState
from app.repositories.stocks import registry
from app.services.notifications import notification_bus
from app.websocket.manager import manager

logger = logging.getLogger("quantdesk.simulator")
ORDER_CHECK_EVERY = 3


def init_live_market(seed: int | None = None, regime: str | None = None) -> bool:
    """(Re)build live session state from stored data. Returns False when there is no market data."""
    registry.invalidate()
    market_data.invalidate()
    stocks = registry.all()
    if not stocks:
        return False
    with SessionLocal() as db:
        state = db.execute(select(SimulatorState)).scalar_one_or_none()
    s = get_settings()
    seed = seed if seed is not None else (state.seed if state else s.SIMULATOR_SEED)
    session_date = (state.live_session_date if state and state.live_session_date
                    else history_and_live_dates(market_today(s.MARKET_TODAY))[1].isoformat())
    if regime is None and state is not None:
        regime = state.regime
    instruments = []
    for st in stocks:
        d = market_data.daily_closes(st)
        if d.empty:
            continue
        last = d.iloc[-1]
        sp = st.sim_params or {}
        instruments.append({
            "stock_id": st.id, "symbol": st.symbol, "sector": st.sector, "prev_close": float(last["close"]),
            "data_source": st.data_source, "daily_sigma": sp.get("daily_sigma"), "base_volume": sp.get("base_volume"),
            "beta": sp.get("beta"), "last_volume": int(last["volume"]), "last_open": float(last["open"]),
            "last_high": float(last["high"]), "last_low": float(last["low"]), "last_time": int(last["time"]),
            "prev_prev_close": float(d["close"].iloc[-2]) if len(d) > 1 else float(last["open"]),
        })
    indices = []
    for ix in registry.indices():
        d = market_data.daily_closes(ix)
        if d.empty:
            continue
        members = []
        for sid, w in registry.constituents(ix.id):
            m = registry.by_id(sid)
            if m is not None and m.is_active:
                members.append((m.symbol, w))
        indices.append({"stock_id": ix.id, "symbol": ix.symbol, "name": ix.name, "prev_close": float(d["close"].iloc[-1]),
                        "members": members})
    live_market.initialize(instruments, indices, seed, session_date, regime)
    return True


class SimulationController:
    def __init__(self) -> None:
        self.running = False
        self.tick_interval_ms = 1000
        self.task: asyncio.Task | None = None
        self.started_at = time.time()
        self.last_tick_at: float | None = None
        self.errors = 0
        self.jobs: dict[str, dict] = {}

    def job(self, name: str, status: str, detail: str = "") -> None:
        self.jobs[name] = {"name": name, "status": status, "detail": detail,
                           "last_run": datetime.now(timezone.utc).isoformat()}

    def status(self) -> dict:
        return {
            "running": self.running, "tick_interval_ms": self.tick_interval_ms, "ticks": live_market.ticks,
            "seed": live_market.seed, "regime": live_market.regime, "live_session_date": live_market.session_date,
            "last_tick_at": datetime.fromtimestamp(self.last_tick_at, tz=timezone.utc).isoformat() if self.last_tick_at else None,
            "instruments": len(live_market.quotes), "ws_clients": manager.count, "errors": self.errors,
            "data_source": "SIMULATED",
        }

    def start_loop(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.get_event_loop().create_task(self._loop())

    async def stop_loop(self) -> None:
        if self.task is not None:
            self.task.cancel()
            try:
                await self.task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self.task = None

    def _messages(self) -> tuple[list[dict], list[dict]]:
        ticks = [
            {"type": "tick", "symbol": q.symbol, "price": q.price, "change": round(q.change, 2),
             "change_pct": round(q.change_pct, 4), "volume": q.volume, "time": q.time, "data_source": "SIMULATED"}
            for q in live_market.snapshot().values() if q.ticking
        ]
        idx = [
            {"type": "index", "symbol": li.symbol, "value": li.value, "change": round(li.value - li.prev_close, 2),
             "change_pct": round(100 * (li.value / li.prev_close - 1), 4) if li.prev_close else 0.0, "time": li.time}
            for li in live_market.index_snapshot().values()
        ]
        return ticks, idx

    @staticmethod
    def _process_db_work() -> None:
        from app.paper_trading.engine import process_open_orders
        from app.services.alerts import evaluate_alerts

        prices = {s: q.price for s, q in live_market.snapshot().items()}
        with SessionLocal() as db:
            process_open_orders(db, prices)
        with SessionLocal() as db:
            evaluate_alerts(db)

    def drain_notifications(self) -> None:
        while True:
            try:
                uid, payload = notification_bus.get_nowait()
            except Exception:  # noqa: BLE001 - queue.Empty
                break
            manager.publish_notification(uid, payload)

    async def _loop(self) -> None:
        n = 0
        while True:
            try:
                await asyncio.sleep(self.tick_interval_ms / 1000.0)
                if self.running and live_market.initialized:
                    live_market.step()
                    self.last_tick_at = time.time()
                    if manager.count:
                        ticks, idx = self._messages()
                        manager.publish_ticks(ticks, idx)
                    n += 1
                    if n % ORDER_CHECK_EVERY == 0:
                        await asyncio.to_thread(self._process_db_work)
                self.drain_notifications()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self.errors += 1
                logger.exception("simulator loop error: %s", exc)
                await asyncio.sleep(1)


controller = SimulationController()
