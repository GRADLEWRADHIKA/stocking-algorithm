"""Seed QuantDesk with SIMULATED market data, demo users, a watchlist, a paper account and a signal scan.

Usage:
    python -m app.scripts.seed            # idempotent: only creates what is missing
    python -m app.scripts.seed --reset    # drop all tables and rebuild everything
    python -m app.scripts.seed --seed 7   # different simulator seed
"""
from __future__ import annotations

import argparse
import csv
import logging
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.db import Base, SessionLocal, create_all, get_engine
from app.market_data.calendar import IST, daily_bar_ts, history_and_live_dates, market_today, session_close_dt, trading_days
from app.market_data.provider import SimulatedMarketDataService, market_data
from app.market_data.simulator import aggregate_index
from app.market_data.universe import INDICES, UNIVERSE, UniverseStock, index_members
from app.models import (
    IndexConstituent,
    MarketCandle,
    PaperAccount,
    SimulatorState,
    Stock,
    User,
    Watchlist,
    WatchlistItem,
)
from app.repositories.stocks import bulk_insert_candles, get_or_create_exchange, registry

logger = logging.getLogger("quantdesk.seed")

DEMO_USERS = [
    ("demo@quantdesk.local", "Demo@12345", "Demo Trader", "USER"),
    ("admin@quantdesk.local", "Admin@12345", "QuantDesk Admin", "ADMIN"),
]
DEFAULT_WATCHLIST = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC"]


def _frame(ts, o, h, lo, c, v) -> pd.DataFrame:
    return pd.DataFrame({"time": np.asarray(ts, dtype=np.int64), "open": o, "high": h, "low": lo, "close": c,
                         "volume": np.asarray(v, dtype=np.int64)})


def generate_market_data(seed: int, universe: list[UniverseStock] | None = None, today: date | None = None,
                         years: float | None = None, intraday_sessions: int | None = None,
                         export_dir: Path | None = None) -> dict:
    """Create/refresh exchanges, simulated stocks, indices and their candles. Existing stock rows are reused
    (matched by symbol) so user data referencing them stays valid; their SIMULATED candles are replaced."""
    s = get_settings()
    universe = universe or UNIVERSE
    today = today or market_today(s.MARKET_TODAY)
    years = years if years is not None else s.HISTORY_YEARS
    intraday_sessions = intraday_sessions if intraday_sessions is not None else s.INTRADAY_SESSIONS
    history_end, live_date = history_and_live_dates(today)
    start = history_end - timedelta(days=int(365.25 * years))
    days = trading_days(start, history_end)
    t0 = time.time()
    sim = SimulatedMarketDataService.generate(universe, days, intraday_sessions, seed)
    daily_ts = np.array([daily_bar_ts(d) for d in days], dtype=np.int64)

    with SessionLocal() as db:
        nse = get_or_create_exchange(db, "NSE")
        get_or_create_exchange(db, "BSE")
        existing = {st.symbol: st for st in db.execute(select(Stock).where(Stock.exchange_id == nse.id)).unique().scalars()}
        stock_ids: dict[str, int] = {}
        for u in universe:
            ser = sim.series[u.symbol]
            price = float(ser.close[-1])
            shares = u.mcap_crore * 1e7 / u.anchor_price
            mcap = shares * price / 1e7
            st = existing.get(u.symbol) or Stock(symbol=u.symbol, exchange_id=nse.id)
            st.name, st.sector, st.industry, st.isin = u.name, u.sector, u.industry, u.isin
            st.instrument_type = "EQUITY"
            st.market_cap = round(mcap, 2)
            st.shares_outstanding = shares
            st.pe_ratio = u.pe
            st.pb_ratio = u.pb
            st.eps = round(price / u.pe, 4)
            st.book_value = round(price / u.pb, 4)
            st.dividend_yield = u.div_yield
            st.face_value = u.face_value
            st.fundamentals_source = "SIMULATED"
            st.data_source = "SIMULATED"
            st.is_active = True
            st.description = (
                f"{u.name} — {u.industry} ({u.sector}). Real company identity for realism only: all prices, volumes and "
                "fundamentals shown in QuantDesk for this symbol are SIMULATED and are not real NSE/BSE data."
            )
            st.sim_params = {"beta": u.beta, "daily_sigma": ser.daily_sigma, "base_volume": ser.base_volume,
                             "anchor_price": u.anchor_price, "seed": seed}
            db.add(st)
            db.flush()
            stock_ids[u.symbol] = st.id
        # indices as instruments
        index_ids: dict[str, int] = {}
        index_series = {}
        for ix in INDICES:
            members = index_members(ix, universe)
            if not members:
                continue
            shares = [m.mcap_crore * 1e7 / m.anchor_price for m in members]
            agg = aggregate_index([sim.series[m.symbol] for m in members], shares, ix.target_level)
            index_series[ix.symbol] = agg
            st = existing.get(ix.symbol) or Stock(symbol=ix.symbol, exchange_id=nse.id)
            st.name, st.sector, st.industry, st.isin = ix.name, "Index", "Index", None
            st.instrument_type = "INDEX"
            st.data_source = "SIMULATED"
            st.fundamentals_source = "SIMULATED"
            st.is_active = True
            st.description = (f"{ix.name}: cap-weighted aggregate of {len(members)} simulated constituents, rebased to a "
                              "plausible level. Derived from simulated prices; not the official index.")
            st.sim_params = {"target_level": ix.target_level, "members": [m.symbol for m in members]}
            db.add(st)
            db.flush()
            index_ids[ix.symbol] = st.id
            db.execute(delete(IndexConstituent).where(IndexConstituent.index_id == st.id))
            for m, sh in zip(members, shares):
                db.add(IndexConstituent(index_id=st.id, stock_id=stock_ids[m.symbol], weight=sh))
        all_ids = list(stock_ids.values()) + list(index_ids.values())
        db.execute(delete(MarketCandle).where(MarketCandle.stock_id.in_(all_ids)))
        state = db.execute(select(SimulatorState)).scalar_one_or_none() or SimulatorState()
        state.seed = seed
        state.history_start = days[0].isoformat()
        state.history_end = days[-1].isoformat()
        state.live_session_date = live_date.isoformat()
        state.seeded_at = datetime.now(timezone.utc)
        state.tick_interval_ms = state.tick_interval_ms or s.SIMULATOR_TICK_MS
        state.is_running = True if state.is_running is None else state.is_running
        state.extra = {"regime_path_tail": sim.regimes[-20:], "universe_size": len(universe)}
        db.add(state)
        db.commit()

    rows = 0
    with get_engine().begin() as conn:
        for sym, sid in stock_ids.items():
            ser = sim.series[sym]
            rows += bulk_insert_candles(conn, sid, "1d", _frame(daily_ts, ser.open, ser.high, ser.low, ser.close, ser.volume), "SIMULATED")
            if len(ser.minute_ts):
                rows += bulk_insert_candles(conn, sid, "1m", _frame(ser.minute_ts, ser.m_open, ser.m_high, ser.m_low,
                                                                  ser.m_close, ser.m_volume), "SIMULATED")
        for sym, sid in index_ids.items():
            ser = index_series[sym]
            rows += bulk_insert_candles(conn, sid, "1d", _frame(daily_ts, ser.open, ser.high, ser.low, ser.close, ser.volume), "SIMULATED")
            if len(ser.minute_ts):
                rows += bulk_insert_candles(conn, sid, "1m", _frame(ser.minute_ts, ser.m_open, ser.m_high, ser.m_low,
                                                                  ser.m_close, ser.m_volume), "SIMULATED")
    registry.invalidate()
    market_data.invalidate()
    if export_dir is not None:
        export_csv(sim, universe, daily_ts, export_dir)
    logger.info("Generated %d candles for %d stocks + %d indices in %.1fs", rows, len(stock_ids), len(index_ids), time.time() - t0)
    return {"candles": rows, "stocks": len(stock_ids), "indices": len(index_ids), "history_start": days[0].isoformat(),
            "history_end": days[-1].isoformat(), "live_session_date": live_date.isoformat(), "seed": seed}


def export_csv(sim, universe: list[UniverseStock], daily_ts: np.ndarray, export_dir: Path) -> Path:
    export_dir.mkdir(parents=True, exist_ok=True)
    path = export_dir / "simulated_daily_ohlcv.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume", "symbol", "exchange", "data_source"])
        dates = [datetime.fromtimestamp(int(t), tz=IST).date().isoformat() for t in daily_ts]
        for u in universe:
            ser = sim.series[u.symbol]
            for i, d in enumerate(dates):
                w.writerow([d, f"{ser.open[i]:.2f}", f"{ser.high[i]:.2f}", f"{ser.low[i]:.2f}", f"{ser.close[i]:.2f}",
                            int(ser.volume[i]), u.symbol, "NSE", "SIMULATED"])
    (export_dir / "README.txt").write_text(
        "simulated_daily_ohlcv.csv is generated by `python -m app.scripts.seed` from QuantDesk's deterministic market\n"
        f"simulator (seed {sim.seed}). Every value is SIMULATED; tickers/names refer to real companies for realism only.\n",
        encoding="utf-8",
    )
    return path


def write_sample_dataset(path: Path) -> Path:
    """Small synthetic CSV for exercising the import pipeline (includes one duplicate row and one zero-volume bar)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(2024)
    days = trading_days(date(2024, 1, 1), date(2024, 4, 30))
    rows = []
    for sym, p0 in (("SAMPLEA", 250.0), ("SAMPLEB", 1180.0)):
        p = p0
        for d in days:
            o = p * np.exp(rng.normal(0, 0.004))
            c = o * np.exp(rng.normal(0.0004, 0.014))
            h = max(o, c) * np.exp(abs(rng.normal(0, 0.006)))
            lo = min(o, c) * np.exp(-abs(rng.normal(0, 0.006)))
            rows.append([d.isoformat(), f"{o:.2f}", f"{h:.2f}", f"{lo:.2f}", f"{c:.2f}", int(rng.integers(50_000, 400_000)), sym, "NSE"])
            p = c
    rows[10][5] = 0  # zero-volume bar -> warning
    rows.insert(21, list(rows[20]))  # duplicate timestamp -> removed
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume", "symbol", "exchange"])
        w.writerows(rows)
    return path


def seed_users(db) -> dict[str, User]:
    from app.services.auth import create_user

    out = {}
    for email, pw, name, role in DEMO_USERS:
        u = db.execute(select(User).where(User.email == email)).unique().scalar_one_or_none()
        if u is None:
            u = create_user(db, email, pw, name, role)
        out[email] = u
    db.commit()
    return out


def seed_watchlist(db, user: User) -> None:
    if db.execute(select(Watchlist).where(Watchlist.user_id == user.id)).first():
        return
    wl = Watchlist(user_id=user.id, name="My Watchlist")
    db.add(wl)
    db.flush()
    pos = 0
    for sym in DEFAULT_WATCHLIST:
        st = registry.get(sym)
        if st is not None:
            db.add(WatchlistItem(watchlist_id=wl.id, stock_id=st.id, position=pos))
            pos += 1
    db.commit()


def seed_paper_account(db, user: User) -> None:
    from app.paper_trading.engine import create_account, place_order

    if db.execute(select(PaperAccount).where(PaperAccount.user_id == user.id)).first():
        return
    st0 = registry.get("RELIANCE") or (registry.all()[0] if registry.all() else None)
    if st0 is None:
        return
    d = market_data.daily_closes(st0)
    if len(d) < 50:
        return
    day_list = [datetime.fromtimestamp(int(t), tz=IST).date() for t in d["time"].to_numpy()]
    opened = session_close_dt(day_list[-45]) - timedelta(hours=7)
    acc = create_account(db, user.id, "Demo Portfolio", 1_000_000, when=opened)
    db.commit()
    plan = [(-40, "RELIANCE", "BUY", 60), (-35, "TCS", "BUY", 25), (-28, "HDFCBANK", "BUY", 150), (-20, "INFY", "BUY", 80),
            (-12, "RELIANCE", "SELL", 30), (-6, "ITC", "BUY", 300), (-3, "INFY", "SELL", 80)]
    for offset, sym, side, qty in plan:
        st = registry.get(sym)
        if st is None:
            continue
        dd = market_data.daily_closes(st)
        i = len(dd) + offset
        if i < 0:
            continue
        bar_day = datetime.fromtimestamp(int(dd["time"].iloc[i]), tz=IST).date()
        when = session_close_dt(bar_day) - timedelta(minutes=30)
        place_order(db, acc, symbol=sym, side=side, order_type="MARKET", quantity=qty,
                    price_override=float(dd["close"].iloc[i]), when=when)
    db.commit()


def run_initial_scan() -> int:
    from app.services.analysis import scan

    with SessionLocal() as db:
        return len(scan(db, None, "1d"))


def seed_all(reset: bool = False, seed: int | None = None, universe: list[UniverseStock] | None = None,
             today: date | None = None, years: float | None = None, intraday_sessions: int | None = None,
             export: bool = True, scan: bool = True) -> dict:
    s = get_settings()
    import app.models  # noqa: F401

    if reset:
        Base.metadata.drop_all(get_engine())
    create_all()
    seed = seed if seed is not None else s.SIMULATOR_SEED
    summary: dict = {"reset": reset}
    with SessionLocal() as db:
        has_market = db.execute(select(Stock.id).limit(1)).first() is not None
    if not has_market:
        export_dir = Path(s.LOCAL_DATA_DIRECTORY) / "simulated" if export else None
        summary["market"] = generate_market_data(seed, universe, today, years, intraday_sessions, export_dir)
        if export:
            write_sample_dataset(Path(s.LOCAL_DATA_DIRECTORY) / "historical" / "sample_ohlcv.csv")
    else:
        summary["market"] = "existing market data kept"
    registry.invalidate()
    market_data.invalidate()
    with SessionLocal() as db:
        users = seed_users(db)
        demo = users["demo@quantdesk.local"]
        seed_watchlist(db, demo)
        seed_paper_account(db, demo)
    if scan and not has_market:
        summary["signals"] = run_initial_scan()
    return summary


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="Seed QuantDesk (simulated data)")
    ap.add_argument("--reset", action="store_true", help="drop all tables and rebuild")
    ap.add_argument("--seed", type=int, default=None, help="simulator seed (default SIMULATOR_SEED / 42)")
    ap.add_argument("--no-export", action="store_true", help="skip CSV export to datasets/")
    args = ap.parse_args()
    t0 = time.time()
    summary = seed_all(reset=args.reset, seed=args.seed, export=not args.no_export)
    print(f"Seed complete in {time.time() - t0:.1f}s: {summary}")


if __name__ == "__main__":
    main()
