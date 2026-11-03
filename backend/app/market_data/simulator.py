"""Deterministic market simulator (all output is SIMULATED data).

Model (daily):
  * Market regime: 4-state Markov chain (BULL, BEAR, SIDEWAYS, HIGH_VOL) with persistent transitions.
    Each regime has an annual drift and a volatility multiplier.
  * Market factor: GARCH(1,1) volatility clustering with Student-t(5) innovations (unit variance).
  * Sector factor: i.i.d. t-noise + slowly-varying AR(1) sector drift (sector rotation).
  * Stock return: r_i = beta_i * r_m + loading * sector_i + AR(1) idiosyncratic drift + GARCH(1,1) idio noise.
    The shared market + sector factors make indices and sectors coherent with their constituents.
  * OHLC: overnight gap is part of the return (open = prev_close * exp(gap)); high >= max(open, close)
    and low <= min(open, close) via half-normal wicks scaled by the conditional volatility.
  * Volume: lognormal noise around a base volume, increasing with |return| / sigma.
  * Each price path is rebased so the final close matches a plausible magnitude (anchor price).

Intraday (last K sessions): 375 one-minute bars per session generated as a Brownian bridge (U-shaped
intraday volatility profile, common minute market shock) that starts at the daily open and ends exactly
at the daily close; daily high/low/volume for those sessions are then re-derived from the minute bars
so both timeframes are consistent.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import numpy as np

from app.market_data.calendar import SESSION_MINUTES, session_open_ts
from app.market_data.universe import UniverseStock

REGIMES = ["BULL", "BEAR", "SIDEWAYS", "HIGH_VOL"]
REGIME_DRIFT = np.array([0.22, -0.20, 0.03, -0.08])  # annualized
REGIME_VOLMULT = np.array([0.90, 1.25, 0.75, 2.00])
TRANSITION = np.array([
    [0.975, 0.008, 0.012, 0.005],
    [0.010, 0.965, 0.015, 0.010],
    [0.012, 0.010, 0.970, 0.008],
    [0.020, 0.030, 0.020, 0.930],
])


@dataclass
class SimulatedSeries:
    symbol: str
    days: list[date]
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray
    # intraday (may be empty)
    minute_ts: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.int64))
    m_open: np.ndarray = field(default_factory=lambda: np.zeros(0))
    m_high: np.ndarray = field(default_factory=lambda: np.zeros(0))
    m_low: np.ndarray = field(default_factory=lambda: np.zeros(0))
    m_close: np.ndarray = field(default_factory=lambda: np.zeros(0))
    m_volume: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.int64))
    daily_sigma: float = 0.015
    base_volume: float = 1e6


@dataclass
class SimulationResult:
    seed: int
    days: list[date]
    regimes: list[str]
    series: dict[str, SimulatedSeries]


def _t_innov(rng: np.random.Generator, size, df: int = 5) -> np.ndarray:
    return rng.standard_t(df, size=size) * np.sqrt((df - 2) / df)


def _round_px(x: np.ndarray) -> np.ndarray:
    return np.round(x, 2)


def simulate_universe(
    universe: list[UniverseStock],
    days: list[date],
    intraday_sessions: int = 5,
    seed: int = 42,
) -> SimulationResult:
    rng = np.random.default_rng(seed)
    D, N = len(days), len(universe)
    if D < 2:
        raise ValueError("Need at least 2 trading days to simulate")

    # ---- regime chain
    reg = np.zeros(D, dtype=int)
    reg[0] = 2
    u = rng.random(D)
    cum = TRANSITION.cumsum(axis=1)
    for t in range(1, D):
        reg[t] = int(np.searchsorted(cum[reg[t - 1]], u[t]))
    drift = REGIME_DRIFT[reg] / 252.0
    vmult = REGIME_VOLMULT[reg]

    # ---- market factor with GARCH(1,1)
    sig_m, a_m, b_m = 0.0075, 0.08, 0.90
    omega_m = sig_m**2 * (1 - a_m - b_m)
    z_m = _t_innov(rng, D)
    h = sig_m**2
    r_m = np.zeros(D)
    for t in range(D):
        base = np.sqrt(h) * z_m[t]  # GARCH shock (stationary: a + b < 1)
        r_m[t] = drift[t] + base * vmult[t]  # regime scales the realized shock only
        h = min(omega_m + a_m * base**2 + b_m * h, (sig_m * 3) ** 2)
    # Keep regime/GARCH shape but pin the cumulative market drift to a plausible ~12%/yr so that
    # rebased starting levels stay realistic regardless of the sampled regime path.
    target = np.log(1.12) * D / 252.0
    r_m += (target - r_m[1:].sum()) / max(D - 1, 1)

    # ---- sector factors
    sectors = sorted({s.sector for s in universe})
    S = len(sectors)
    sec_idx = np.array([sectors.index(s.sector) for s in universe])
    sec_noise = _t_innov(rng, (D, S)) * 0.0055 * vmult[:, None]
    sec_drift = np.zeros((D, S))
    dk = rng.normal(0, 0.0004, S)
    sec_shocks = rng.normal(0, 0.00006, (D, S))
    for t in range(D):
        dk = 0.985 * dk + sec_shocks[t]
        sec_drift[t] = dk
    sec_ret = sec_noise + sec_drift

    # ---- stocks
    betas = np.array([s.beta for s in universe])
    sig_i = 0.0080 + 0.004 * np.clip(betas - 0.5, 0, None) + rng.uniform(0, 0.003, N)
    a_i, b_i = 0.06, 0.92
    omega_i = sig_i**2 * (1 - a_i - b_i)
    z_i = _t_innov(rng, (D, N))
    h_i = sig_i**2
    idio = np.zeros((D, N))
    cond_sigma = np.zeros((D, N))
    di = rng.normal(0, 0.0002, N)
    di_shocks = rng.normal(0, 0.00004, (D, N))
    for t in range(D):
        di = 0.995 * di + di_shocks[t]
        base = np.sqrt(h_i) * z_i[t]
        idio[t] = di + base * np.sqrt(vmult[t])
        h_i = np.minimum(omega_i + a_i * base**2 + b_i * h_i, (sig_i * 3) ** 2)
        cond_sigma[t] = np.sqrt(betas**2 * sig_m**2 * vmult[t] ** 2 + h_i + 0.0055**2)

    r = betas[None, :] * r_m[:, None] + 0.8 * sec_ret[:, sec_idx] + idio
    r[0] = 0.0
    logc = np.cumsum(r, axis=0)
    anchors = np.array([s.anchor_price for s in universe])
    close = anchors[None, :] * np.exp(logc - logc[-1][None, :])

    gap = 0.3 * r + rng.normal(0, 1, (D, N)) * 0.25 * cond_sigma
    prev_close = np.vstack([close[0:1] * np.exp(-r[0:1]), close[:-1]])
    open_ = prev_close * np.exp(gap)
    open_[0] = close[0] * np.exp(rng.normal(0, 0.004, N))
    upper = np.maximum(open_, close) * np.exp(np.abs(rng.normal(0, 1, (D, N))) * 0.45 * cond_sigma)
    lower = np.minimum(open_, close) * np.exp(-np.abs(rng.normal(0, 1, (D, N))) * 0.45 * cond_sigma)

    turnover_cr = np.array([s.mcap_crore for s in universe]) * 0.0022  # daily traded value, crore
    base_vol = turnover_cr * 1e7 / anchors
    z_abs = np.abs(r) / np.maximum(cond_sigma, 1e-6)
    volume = base_vol[None, :] * np.exp(0.45 * z_abs - 0.36 + rng.normal(0, 0.28, (D, N)))
    volume = (close / anchors[None, :]) ** -0.3 * volume  # cheaper price -> slightly more shares

    o, hi, lo, c = _round_px(open_), _round_px(upper), _round_px(lower), _round_px(close)
    hi = np.maximum(hi, np.maximum(o, c))
    lo = np.minimum(lo, np.minimum(o, c))
    vol = np.maximum(volume.round(), 1).astype(np.int64)

    series: dict[str, SimulatedSeries] = {}
    for j, s in enumerate(universe):
        series[s.symbol] = SimulatedSeries(
            symbol=s.symbol, days=list(days), open=o[:, j].copy(), high=hi[:, j].copy(), low=lo[:, j].copy(),
            close=c[:, j].copy(), volume=vol[:, j].copy(), daily_sigma=float(sig_i[j] * 1.1 + betas[j] * sig_m),
            base_volume=float(base_vol[j]),
        )

    # ---- intraday minute bars for the last K sessions
    K = min(intraday_sessions, D)
    if K > 0:
        M = SESSION_MINUTES
        m_idx = np.arange(M)
        profile = 1.0 + 1.3 * ((m_idx - (M - 1) / 2) / ((M - 1) / 2)) ** 2  # U-shape
        vol_profile = profile / profile.sum()
        for k in range(K):
            t = D - K + k
            d = days[t]
            base_ts = session_open_ts(d) + 60 * m_idx
            z_common = rng.normal(0, 1, M) * np.sqrt(profile)
            for j, s in enumerate(universe):
                ser = series[s.symbol]
                o_d, c_d = float(o[t, j]), float(c[t, j])
                R = np.log(c_d / o_d)
                sig_min = float(cond_sigma[t, j]) * 0.85 / np.sqrt(M)
                shocks = (betas[j] * 0.6 * z_common + rng.normal(0, 1, M) * np.sqrt(profile)) * sig_min
                X = np.cumsum(shocks)
                frac = (m_idx + 1) / M
                path = X - frac * X[-1] + frac * R  # bridge ends exactly at log(c/o)
                m_close = o_d * np.exp(path)
                m_open = np.concatenate([[o_d], m_close[:-1]])
                wick = np.abs(rng.normal(0, 1, (2, M))) * sig_min * 0.6
                m_high = np.maximum(m_open, m_close) * np.exp(wick[0])
                m_low = np.minimum(m_open, m_close) * np.exp(-wick[1])
                m_open, m_close = _round_px(m_open), _round_px(m_close)
                m_close[-1] = c_d
                m_high = np.maximum(_round_px(m_high), np.maximum(m_open, m_close))
                m_low = np.minimum(_round_px(m_low), np.minimum(m_open, m_close))
                mv = float(vol[t, j]) * vol_profile * np.exp(rng.normal(0, 0.35, M) + 2.0 * np.abs(shocks) / sig_min * 0.1)
                mv = np.maximum(mv.round(), 1).astype(np.int64)
                ser.minute_ts = np.concatenate([ser.minute_ts, base_ts.astype(np.int64)])
                ser.m_open = np.concatenate([ser.m_open, m_open])
                ser.m_high = np.concatenate([ser.m_high, m_high])
                ser.m_low = np.concatenate([ser.m_low, m_low])
                ser.m_close = np.concatenate([ser.m_close, m_close])
                ser.m_volume = np.concatenate([ser.m_volume, mv])
                # re-derive daily bar from minutes so 1m and 1d agree
                ser.high[t] = float(m_high.max())
                ser.low[t] = float(m_low.min())
                ser.volume[t] = int(mv.sum())

    return SimulationResult(seed=seed, days=list(days), regimes=[REGIMES[i] for i in reg], series=series)


def aggregate_index(
    member_series: list[SimulatedSeries], shares: list[float], target_level: float
) -> SimulatedSeries:
    """Cap-weighted aggregate: level_t = k * sum_i shares_i * price_i,t, rebased so last close = target.

    Index high/low use the share-weighted sum of constituent highs/lows (an upper/lower bound of the true
    intraday extreme), which keeps high >= max(open, close) and low <= min(open, close).
    """
    w = np.asarray(shares, dtype=float)

    def agg(attr: str) -> np.ndarray:
        return np.sum([wi * getattr(s, attr) for wi, s in zip(w, member_series)], axis=0)

    c = agg("close")
    k = target_level / c[-1]
    first = member_series[0]
    out = SimulatedSeries(
        symbol="", days=list(first.days), open=_round_px(agg("open") * k), high=_round_px(agg("high") * k),
        low=_round_px(agg("low") * k), close=_round_px(c * k),
        volume=np.sum([s.volume for s in member_series], axis=0).astype(np.int64),
    )
    if len(first.minute_ts):
        out.minute_ts = first.minute_ts.copy()
        out.m_open = _round_px(agg("m_open") * k)
        out.m_high = _round_px(agg("m_high") * k)
        out.m_low = _round_px(agg("m_low") * k)
        out.m_close = _round_px(agg("m_close") * k)
        out.m_volume = np.sum([s.m_volume for s in member_series], axis=0).astype(np.int64)
    out.high = np.maximum(out.high, np.maximum(out.open, out.close))
    out.low = np.minimum(out.low, np.minimum(out.open, out.close))
    if len(out.m_open):
        out.m_high = np.maximum(out.m_high, np.maximum(out.m_open, out.m_close))
        out.m_low = np.minimum(out.m_low, np.minimum(out.m_open, out.m_close))
    return out
