"""Market data providers.

MarketDataProvider (ABC)
  ├─ HistoricalDataService       stored candles (simulated history or imported CSV) from the DB, cached
  └─ SimulatedMarketDataService  same stored history + live simulated session quotes (LiveMarket);
                                 also exposes the deterministic generator used by seeding.
MarketDataService picks the provider per instrument from its data_source.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

import numpy as np
import pandas as pd

from app.core.errors import NotFoundError, ValidationAppError
from app.market_data.cache import market_cache
from app.market_data.live import LiveQuote, live_market
from app.market_data.resample import (
    ALL_TIMEFRAMES,
    INTRADAY_MINUTES,
    available_timeframes,
    empty_frame,
    resample_daily,
    resample_intraday,
)
from app.market_data.simulator import SimulationResult, simulate_universe
from app.market_data.universe import UniverseStock
from app.repositories.stocks import StockInfo, load_candles_raw, registry, stored_timeframes


class MarketDataProvider(ABC):
    data_source: str = "SIMULATED"

    @abstractmethod
    def get_candles(self, stock: StockInfo, timeframe: str) -> pd.DataFrame: ...

    @abstractmethod
    def get_quote(self, stock: StockInfo) -> LiveQuote | None: ...

    @abstractmethod
    def available_timeframes(self, stock: StockInfo) -> list[str]: ...


class HistoricalDataService(MarketDataProvider):
    data_source = "HISTORICAL_DATASET"
    TTL = 600.0

    def _raw(self, stock_id: int, tf: str) -> pd.DataFrame:
        return market_cache.get_or_set(("raw", stock_id, tf), lambda: load_candles_raw(stock_id, tf), self.TTL)

    def stored(self, stock: StockInfo) -> set[str]:
        return market_cache.get_or_set(("stored", stock.id), lambda: stored_timeframes(stock.id), self.TTL)

    def available_timeframes(self, stock: StockInfo) -> list[str]:
        s = self.stored(stock)
        return available_timeframes("1m" in s, "1d" in s)

    def get_candles(self, stock: StockInfo, timeframe: str) -> pd.DataFrame:
        if timeframe not in ALL_TIMEFRAMES:
            raise ValidationAppError(f"Unsupported timeframe '{timeframe}'", code="invalid_timeframe")
        if timeframe not in self.available_timeframes(stock):
            raise ValidationAppError(
                f"Timeframe {timeframe} is not available for {stock.symbol}; available: "
                f"{', '.join(self.available_timeframes(stock)) or 'none'}", code="timeframe_unavailable",
            )

        def build() -> pd.DataFrame:
            if timeframe in INTRADAY_MINUTES:
                return resample_intraday(self._raw(stock.id, "1m"), timeframe)
            return resample_daily(self._raw(stock.id, "1d"), timeframe)

        return market_cache.get_or_set(("tf", stock.id, timeframe), build, self.TTL)

    def get_quote(self, stock: StockInfo) -> LiveQuote | None:
        q = live_market.get(stock.symbol)
        if q is not None:
            return q
        d = self._raw(stock.id, "1d")
        if d.empty:
            return None
        last = d.iloc[-1]
        prev = float(d["close"].iloc[-2]) if len(d) > 1 else float(last["open"])
        return LiveQuote(stock.id, stock.symbol, prev, float(last["open"]), float(last["high"]), float(last["low"]),
                         float(last["close"]), int(last["volume"]), int(last["time"]), stock.data_source, False)


class SimulatedMarketDataService(HistoricalDataService):
    data_source = "SIMULATED"

    def get_quote(self, stock: StockInfo) -> LiveQuote | None:
        q = live_market.get(stock.symbol)
        return q if q is not None else super().get_quote(stock)

    @staticmethod
    def generate(universe: list[UniverseStock], days: list[date], intraday_sessions: int, seed: int) -> SimulationResult:
        return simulate_universe(universe, days, intraday_sessions, seed)


class MarketDataService:
    def __init__(self) -> None:
        self.historical = HistoricalDataService()
        self.simulated = SimulatedMarketDataService()

    def provider(self, stock: StockInfo) -> MarketDataProvider:
        return self.simulated if stock.data_source == "SIMULATED" else self.historical

    def stock(self, symbol: str, include_inactive: bool = False) -> StockInfo:
        s = registry.get(symbol)
        if s is None or (not s.is_active and not include_inactive):
            raise NotFoundError(f"Unknown symbol '{symbol}'", code="unknown_symbol")
        return s

    def candles(self, stock: StockInfo, timeframe: str) -> pd.DataFrame:
        return self.provider(stock).get_candles(stock, timeframe)

    def quote(self, stock: StockInfo) -> LiveQuote | None:
        return self.provider(stock).get_quote(stock)

    def available_timeframes(self, stock: StockInfo) -> list[str]:
        return self.provider(stock).available_timeframes(stock)

    def data_source(self, stock: StockInfo) -> str:
        return stock.data_source

    def daily_closes(self, stock: StockInfo) -> pd.DataFrame:
        if "1d" not in self.available_timeframes(stock):
            return empty_frame()
        return self.candles(stock, "1d")

    @staticmethod
    def invalidate(stock_id: int | None = None) -> None:
        if stock_id is None:
            market_cache.invalidate()
        else:
            market_cache.invalidate(lambda k: isinstance(k, tuple) and len(k) > 1 and k[1] == stock_id)


market_data = MarketDataService()


def filter_range(df: pd.DataFrame, start: int | None, end: int | None, limit: int | None) -> pd.DataFrame:
    out = df
    if start is not None:
        out = out[out["time"] >= start]
    if end is not None:
        out = out[out["time"] <= end]
    if limit:
        out = out.iloc[-limit:]
    return out.reset_index(drop=True)


def candles_payload(df: pd.DataFrame) -> list[dict]:
    t = df["time"].to_numpy(dtype=np.int64)
    o, h, lo, c = (np.round(df[k].to_numpy(dtype=float), 4) for k in ("open", "high", "low", "close"))
    v = df["volume"].to_numpy(dtype=np.int64)
    return [
        {"time": int(t[i]), "open": float(o[i]), "high": float(h[i]), "low": float(lo[i]), "close": float(c[i]),
         "volume": int(v[i])}
        for i in range(len(t))
    ]
