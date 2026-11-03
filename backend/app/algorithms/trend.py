"""Rule-based trend detection and market-regime classification (deterministic, causal)."""
from __future__ import annotations

import math

import numpy as np


def _ok(x) -> bool:
    return x is not None and not (isinstance(x, float) and math.isnan(x))


def trend_direction(close: float, ema20: float | None, ema50: float | None, slope20_pct: float | None) -> str:
    if not (_ok(ema20) and _ok(ema50)):
        return "SIDEWAYS"
    up = ema20 > ema50 and close > ema50 and (slope20_pct or 0) > 0
    down = ema20 < ema50 and close < ema50 and (slope20_pct or 0) < 0
    return "UPTREND" if up else "DOWNTREND" if down else "SIDEWAYS"


def trend_strength(adx: float | None, slope20_pct: float | None) -> str:
    if _ok(adx):
        return "STRONG" if adx >= 40 else "MODERATE" if adx >= 20 else "WEAK"
    s = abs(slope20_pct or 0)
    return "STRONG" if s > 3 else "MODERATE" if s > 1 else "WEAK"


def slope_pct(series: np.ndarray, lookback: int = 5) -> float | None:
    s = np.asarray(series, dtype=float)
    if len(s) <= lookback or np.isnan(s[-1]) or np.isnan(s[-1 - lookback]) or s[-1 - lookback] == 0:
        return None
    return float(100.0 * (s[-1] / s[-1 - lookback] - 1.0))


def volatility_state(hv_series: np.ndarray, lookback: int = 250) -> str:
    hv = np.asarray(hv_series, dtype=float)
    hist = hv[-lookback:]
    hist = hist[~np.isnan(hist)]
    if len(hist) < 20 or np.isnan(hv[-1]):
        return "NORMAL"
    p25, p75 = np.percentile(hist, [25, 75])
    return "LOW" if hv[-1] < p25 else "HIGH" if hv[-1] > p75 else "NORMAL"


def classify_regime(direction: str, adx: float | None, hv_series: np.ndarray) -> tuple[str, str]:
    hv = np.asarray(hv_series, dtype=float)
    hist = hv[-250:]
    hist = hist[~np.isnan(hist)]
    if len(hist) >= 40 and not np.isnan(hv[-1]) and hv[-1] > 1.5 * float(np.median(hist)):
        return "HIGH_VOLATILITY", (
            f"20-bar historical volatility ({hv[-1]:.1f}%) is more than 1.5x its 250-bar median "
            f"({np.median(hist):.1f}%)."
        )
    adx_ok = _ok(adx) and adx >= 20
    if direction == "UPTREND" and adx_ok:
        return "BULL_TREND", f"EMA20 > EMA50 with rising slope and ADX {adx:.1f} >= 20 (trending)."
    if direction == "DOWNTREND" and adx_ok:
        return "BEAR_TREND", f"EMA20 < EMA50 with falling slope and ADX {adx:.1f} >= 20 (trending)."
    adx_txt = f"ADX {adx:.1f}" if _ok(adx) else "ADX unavailable"
    return "RANGE_BOUND", f"No confirmed directional trend ({direction.lower()}, {adx_txt})."
