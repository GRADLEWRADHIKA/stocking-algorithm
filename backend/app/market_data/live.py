"""Live simulated session state (single source for REST quotes and WebSocket ticks).

Each tick advances one simulated minute of the live session on top of the last stored daily close:
  r_i = beta_i * z_m * sigma_m + 0.8 * z_sector * sigma_s + z_i * sigma_i + drift(regime) - kappa * log(P/prev_close)
with per-tick volatilities = daily volatility / sqrt(375) and a weak mean-reversion term (kappa) that keeps
the intraday excursion bounded during long-running demos. Indices are recomputed from constituents
(cap-weighted with stored share counts) so they stay coherent with the stock ticks. Deterministic for a
given seed and live-session date. Instruments that only have imported HISTORICAL_DATASET data do not tick:
their quote is the last stored close vs the previous close.
"""
from __future__ import annotations

import math
import threading
import time
from dataclasses import asdict, dataclass

import numpy as np

from app.market_data.calendar import SESSION_MINUTES

REGIME_TICK = {  # (annual drift, vol multiplier)
    None: (0.0, 1.0), "bull": (0.35, 0.9), "bear": (-0.35, 1.2), "sideways": (0.0, 0.7), "high_vol": (0.0, 2.2),
}


@dataclass
class LiveQuote:
    stock_id: int
    symbol: str
    prev_close: float
    open: float
    high: float
    low: float
    price: float
    volume: int
    time: int
    data_source: str
    ticking: bool

    @property
    def change(self) -> float:
        return self.price - self.prev_close

    @property
    def change_pct(self) -> float:
        return 100.0 * (self.price / self.prev_close - 1.0) if self.prev_close else 0.0


@dataclass
class LiveIndex:
    stock_id: int
    symbol: str
    name: str
    prev_close: float
    value: float
    open: float
    high: float
    low: float
    time: int
    members: list[tuple[str, float]]  # (symbol, shares)


class LiveMarket:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.quotes: dict[str, LiveQuote] = {}
        self.indices: dict[str, LiveIndex] = {}
        self.params: dict[str, dict] = {}
        self.sector_of: dict[str, str] = {}
        self.seed = 42
        self.session_date: str | None = None
        self.ticks = 0
        self.regime: str | None = None
        self.initialized = False
        self._rng = np.random.default_rng(42)

    # ------------------------------------------------------------ setup
    def initialize(self, instruments: list[dict], indices: list[dict], seed: int, session_date: str,
                   regime: str | None = None) -> None:
        """instruments: dicts {stock_id, symbol, sector, prev_close, data_source, daily_sigma, base_volume, beta,
        last_volume, last_open, last_high, last_low}; indices: {stock_id, symbol, name, prev_close, members}."""
        with self._lock:
            self.seed = seed
            self.session_date = session_date
            self.regime = regime
            self.ticks = 0
            y, m, d = (int(x) for x in session_date.split("-"))
            self._rng = np.random.default_rng([seed, y * 10000 + m * 100 + d])
            now = int(time.time())
            self.quotes = {}
            self.params = {}
            self.sector_of = {}
            for ins in instruments:
                sym = ins["symbol"]
                ticking = ins["data_source"] == "SIMULATED"
                prev = float(ins["prev_close"])
                if ticking:
                    sig = float(ins.get("daily_sigma") or 0.015)
                    open_ = round(prev * math.exp(self._rng.normal(0, 0.3 * sig)), 2)
                    self.quotes[sym] = LiveQuote(ins["stock_id"], sym, prev, open_, open_, open_, open_, 0, now,
                                                 "SIMULATED", True)
                    self.params[sym] = {"sigma": sig, "beta": float(ins.get("beta") or 1.0),
                                        "base_volume": float(ins.get("base_volume") or 1e6)}
                else:
                    # static quote from the last two stored bars
                    self.quotes[sym] = LiveQuote(
                        ins["stock_id"], sym, float(ins.get("prev_prev_close") or prev),
                        float(ins.get("last_open") or prev), float(ins.get("last_high") or prev),
                        float(ins.get("last_low") or prev), prev, int(ins.get("last_volume") or 0),
                        int(ins.get("last_time") or now), ins["data_source"], False,
                    )
                self.sector_of[sym] = ins.get("sector") or "Unclassified"
            self.indices = {}
            for ix in indices:
                li = LiveIndex(ix["stock_id"], ix["symbol"], ix["name"], float(ix["prev_close"]), float(ix["prev_close"]),
                               float(ix["prev_close"]), float(ix["prev_close"]), float(ix["prev_close"]), now,
                               [(s, float(w)) for s, w in ix["members"] if s in self.quotes])
                self.indices[ix["symbol"]] = li
            self._recompute_indices(now, first=True)
            self.initialized = True

    def _recompute_indices(self, now: int, first: bool = False) -> None:
        for li in self.indices.values():
            if not li.members:
                continue
            num = sum(w * self.quotes[s].price for s, w in li.members)
            den = sum(w * self.quotes[s].prev_close for s, w in li.members)
            if den <= 0:
                continue
            v = round(li.prev_close * num / den, 2)
            li.value = v
            if first:
                li.open = li.high = li.low = v
            li.high = max(li.high, v)
            li.low = min(li.low, v)
            li.time = now

    # ------------------------------------------------------------ simulation
    def step(self) -> int:
        with self._lock:
            if not self.initialized:
                return 0
            now = int(time.time())
            drift_a, vm = REGIME_TICK.get(self.regime, (0.0, 1.0))
            per_tick = 1.0 / (252.0 * SESSION_MINUTES)
            z_m = self._rng.standard_normal()
            sectors = sorted(set(self.sector_of.values()))
            z_s = dict(zip(sectors, self._rng.standard_normal(len(sectors))))
            sig_m = 0.0085 / math.sqrt(SESSION_MINUTES)
            sig_s = 0.0055 / math.sqrt(SESSION_MINUTES)
            for sym, q in self.quotes.items():
                if not q.ticking:
                    continue
                p = self.params[sym]
                sig_i = p["sigma"] / math.sqrt(SESSION_MINUTES)
                r = (p["beta"] * z_m * sig_m + 0.8 * z_s[self.sector_of[sym]] * sig_s
                     + self._rng.standard_normal() * sig_i * 0.8) * vm
                r += drift_a * per_tick - 0.002 * math.log(q.price / q.prev_close)
                price = round(max(q.price * math.exp(r), 0.05), 2)
                vol = p["base_volume"] / SESSION_MINUTES * math.exp(self._rng.normal(0, 0.4)) * (1 + 2 * abs(r) / sig_i)
                q.price = price
                q.high = max(q.high, price)
                q.low = min(q.low, price)
                q.volume += int(vol)
                q.time = now
            self._recompute_indices(now)
            self.ticks += 1
            return self.ticks

    # ------------------------------------------------------------ reads
    def get(self, symbol: str) -> LiveQuote | None:
        with self._lock:
            q = self.quotes.get(symbol)
            return None if q is None else LiveQuote(**asdict(q))

    def price(self, symbol: str) -> float | None:
        with self._lock:
            q = self.quotes.get(symbol)
            return None if q is None else q.price

    def snapshot(self) -> dict[str, LiveQuote]:
        with self._lock:
            return {s: LiveQuote(**asdict(q)) for s, q in self.quotes.items()}

    def index_snapshot(self) -> dict[str, LiveIndex]:
        with self._lock:
            return {s: LiveIndex(**{**asdict(li), "members": list(li.members)}) for s, li in self.indices.items()}

    def remove(self, symbol: str) -> None:
        """Stop ticking an instrument (e.g. after its data source changed to an imported dataset)."""
        with self._lock:
            self.quotes.pop(symbol, None)
            self.params.pop(symbol, None)
            for li in self.indices.values():
                li.members = [(s, w) for s, w in li.members if s != symbol]

    def set_price_for_test(self, symbol: str, price: float) -> None:
        """Deterministically set a live price (used by tests and admin tooling)."""
        with self._lock:
            q = self.quotes[symbol]
            q.price = round(price, 2)
            q.high = max(q.high, q.price)
            q.low = min(q.low, q.price)
            self._recompute_indices(int(time.time()))


live_market = LiveMarket()
