"""Stock registry (cached lightweight view of the stocks table) and candle persistence helpers."""
from __future__ import annotations

import threading
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_engine
from app.models import Exchange, IndexConstituent, MarketCandle, Stock


@dataclass
class StockInfo:
    id: int
    symbol: str
    name: str
    exchange: str
    instrument_type: str
    sector: str
    industry: str | None
    isin: str | None
    description: str | None
    data_source: str
    is_active: bool
    market_cap: float | None
    shares_outstanding: float | None
    pe_ratio: float | None
    pb_ratio: float | None
    eps: float | None
    dividend_yield: float | None
    book_value: float | None
    face_value: float | None
    fundamentals_source: str
    sim_params: dict = field(default_factory=dict)

    @property
    def is_index(self) -> bool:
        return self.instrument_type == "INDEX"


def _f(v) -> float | None:
    return None if v is None else float(v)


def _to_info(s: Stock) -> StockInfo:
    return StockInfo(
        id=s.id, symbol=s.symbol, name=s.name, exchange=s.exchange.code if s.exchange else "NSE",
        instrument_type=s.instrument_type, sector=s.sector, industry=s.industry, isin=s.isin,
        description=s.description, data_source=s.data_source, is_active=s.is_active,
        market_cap=_f(s.market_cap), shares_outstanding=s.shares_outstanding, pe_ratio=_f(s.pe_ratio),
        pb_ratio=_f(s.pb_ratio), eps=_f(s.eps), dividend_yield=_f(s.dividend_yield), book_value=_f(s.book_value),
        face_value=_f(s.face_value), fundamentals_source=s.fundamentals_source, sim_params=dict(s.sim_params or {}),
    )


class StockRegistry:
    """Process-wide cache of instruments. Call invalidate() after any write to stocks."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._by_symbol: dict[str, StockInfo] | None = None
        self._by_id: dict[int, StockInfo] = {}
        self._constituents: dict[int, list[tuple[int, float]]] = {}

    def invalidate(self) -> None:
        with self._lock:
            self._by_symbol = None
            self._by_id = {}
            self._constituents = {}

    def _load(self) -> None:
        with self._lock:
            if self._by_symbol is not None:
                return
            with SessionLocal() as db:
                rows = db.execute(select(Stock).order_by(Stock.symbol)).unique().scalars().all()
                infos = [_to_info(s) for s in rows]
                cons = db.execute(select(IndexConstituent)).scalars().all()
            by_symbol: dict[str, StockInfo] = {}
            for i in infos:
                # prefer NSE listing when the same symbol exists on several exchanges
                if i.symbol not in by_symbol or i.exchange == "NSE":
                    by_symbol[i.symbol] = i
            self._by_symbol = by_symbol
            self._by_id = {i.id: i for i in infos}
            cmap: dict[int, list[tuple[int, float]]] = {}
            for c in cons:
                cmap.setdefault(c.index_id, []).append((c.stock_id, c.weight))
            self._constituents = cmap

    def get(self, symbol: str) -> StockInfo | None:
        self._load()
        assert self._by_symbol is not None
        return self._by_symbol.get(symbol.strip().upper())

    def by_id(self, stock_id: int) -> StockInfo | None:
        self._load()
        return self._by_id.get(stock_id)

    def all(self, include_inactive: bool = False, instrument_type: str | None = "EQUITY") -> list[StockInfo]:
        self._load()
        assert self._by_symbol is not None
        out = [s for s in self._by_id.values() if (include_inactive or s.is_active)]
        if instrument_type:
            out = [s for s in out if s.instrument_type == instrument_type]
        return sorted(out, key=lambda s: s.symbol)

    def indices(self) -> list[StockInfo]:
        return self.all(instrument_type="INDEX")

    def constituents(self, index_id: int) -> list[tuple[int, float]]:
        self._load()
        return self._constituents.get(index_id, [])


registry = StockRegistry()


# ------------------------------------------------------------------ candles
def load_candles_raw(stock_id: int, timeframe: str) -> pd.DataFrame:
    """Load stored candles fast (bypassing ORM type processing). Columns: time, open, high, low, close, volume."""
    sql = (
        "SELECT ts, open, high, low, close, volume FROM market_candles "
        "WHERE stock_id = :sid AND timeframe = :tf ORDER BY ts"
    )
    from sqlalchemy import text

    with get_engine().connect() as conn:
        rows = conn.execute(text(sql), {"sid": stock_id, "tf": timeframe}).fetchall()
    if not rows:
        from app.market_data.resample import empty_frame

        return empty_frame()
    arr = np.array([tuple(float(x) for x in r) for r in rows], dtype=float)
    return pd.DataFrame({
        "time": arr[:, 0].astype(np.int64), "open": arr[:, 1], "high": arr[:, 2], "low": arr[:, 3],
        "close": arr[:, 4], "volume": arr[:, 5].astype(np.int64),
    })


def stored_timeframes(stock_id: int) -> set[str]:
    with SessionLocal() as db:
        rows = db.execute(
            select(MarketCandle.timeframe).where(MarketCandle.stock_id == stock_id).distinct()
        ).scalars().all()
    return set(rows)


def candle_source(stock_id: int) -> str | None:
    with SessionLocal() as db:
        return db.execute(
            select(MarketCandle.data_source).where(MarketCandle.stock_id == stock_id)
            .order_by(MarketCandle.ts.desc()).limit(1)
        ).scalar_one_or_none()


def bulk_insert_candles(conn, stock_id: int, timeframe: str, df: pd.DataFrame, data_source: str,
                        chunk: int = 5000) -> int:
    """Core bulk insert (executemany). df columns: time, open, high, low, close, volume."""
    if df.empty:
        return 0
    t = df["time"].to_numpy(dtype=np.int64)
    o, h, l_, c = (df[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
    v = df["volume"].to_numpy(dtype=np.int64)
    rows = [
        {"stock_id": stock_id, "timeframe": timeframe, "ts": int(t[i]), "open": round(float(o[i]), 4),
         "high": round(float(h[i]), 4), "low": round(float(l_[i]), 4), "close": round(float(c[i]), 4),
         "volume": int(v[i]), "data_source": data_source}
        for i in range(len(t))
    ]
    stmt = insert(MarketCandle.__table__)
    for k in range(0, len(rows), chunk):
        conn.execute(stmt, rows[k:k + chunk])
    return len(rows)


def delete_candles(db: Session, stock_id: int, timeframe: str, ts_list: list[int] | None = None) -> None:
    q = delete(MarketCandle).where(MarketCandle.stock_id == stock_id, MarketCandle.timeframe == timeframe)
    if ts_list is not None:
        q = q.where(MarketCandle.ts.in_(ts_list))
    db.execute(q)


def get_or_create_exchange(db: Session, code: str) -> Exchange:
    code = code.upper()
    ex = db.execute(select(Exchange).where(Exchange.code == code)).scalar_one_or_none()
    if ex is None:
        names = {"NSE": "National Stock Exchange of India", "BSE": "BSE Ltd (Bombay Stock Exchange)"}
        ex = Exchange(code=code, name=names.get(code, code), timezone="Asia/Kolkata")
        db.add(ex)
        db.flush()
    return ex


def count_candles(db: Session) -> int:
    return int(db.execute(select(func.count(MarketCandle.id))).scalar_one())
