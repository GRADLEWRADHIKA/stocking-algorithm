"""Causal data-processing utilities (no look-ahead: every value at bar t uses data <= t)."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class CleanReport:
    rows_in: int
    rows_out: int
    duplicates_removed: int = 0
    filled_prices: int = 0
    zero_volume_bars: int = 0
    inconsistent_fixed: int = 0
    warnings: list[str] = field(default_factory=list)


def clean_ohlcv(df: pd.DataFrame) -> tuple[pd.DataFrame, CleanReport]:
    """Sort by time, drop duplicate timestamps (keep last), forward-fill missing prices (causal),
    set missing volume to 0 (flagged), and repair high/low so high >= max(o,c), low <= min(o,c)."""
    rep = CleanReport(rows_in=len(df), rows_out=0)
    if df.empty:
        return df.copy(), rep
    out = df.sort_values("time", kind="stable")
    dup = out.duplicated("time", keep="last")
    rep.duplicates_removed = int(dup.sum())
    out = out[~dup].reset_index(drop=True)
    price_cols = ["open", "high", "low", "close"]
    missing = out[price_cols].isna().any(axis=1)
    rep.filled_prices = int(missing.sum())
    if rep.filled_prices:
        out["close"] = out["close"].ffill()
        for c in ("open", "high", "low"):
            out[c] = out[c].fillna(out["close"])
        rep.warnings.append(f"{rep.filled_prices} bar(s) had missing prices; forward-filled from prior close")
    out = out.dropna(subset=["close"]).reset_index(drop=True)
    vol_missing = out["volume"].isna()
    out["volume"] = out["volume"].fillna(0)
    rep.zero_volume_bars = int((out["volume"] == 0).sum())
    if vol_missing.any():
        rep.warnings.append(f"{int(vol_missing.sum())} bar(s) had missing volume; set to 0")
    hi = out[["open", "close", "high"]].max(axis=1)
    lo = out[["open", "close", "low"]].min(axis=1)
    rep.inconsistent_fixed = int(((hi != out["high"]) | (lo != out["low"])).sum())
    out["high"], out["low"] = hi, lo
    rep.rows_out = len(out)
    return out, rep


def simple_returns(close) -> np.ndarray:
    c = np.asarray(close, dtype=float)
    out = np.full(len(c), np.nan)
    if len(c) > 1:
        out[1:] = c[1:] / c[:-1] - 1.0
    return out


def log_returns(close) -> np.ndarray:
    c = np.asarray(close, dtype=float)
    out = np.full(len(c), np.nan)
    if len(c) > 1:
        out[1:] = np.log(c[1:] / c[:-1])
    return out


def rolling_volatility(close, n: int = 20, annualize: float | None = 252.0) -> np.ndarray:
    lr = pd.Series(log_returns(close))
    v = lr.rolling(n, min_periods=n).std(ddof=1)
    if annualize:
        v = v * np.sqrt(annualize)
    return v.to_numpy()


def rolling_stats(values, n: int) -> dict[str, np.ndarray]:
    s = pd.Series(np.asarray(values, dtype=float)).rolling(n, min_periods=n)
    return {"mean": s.mean().to_numpy(), "std": s.std(ddof=0).to_numpy(), "min": s.min().to_numpy(),
            "max": s.max().to_numpy()}


def rolling_zscore(values, n: int = 20) -> np.ndarray:
    """Causal z-score: (x_t - mean(x_{t-n+1..t})) / std(x_{t-n+1..t})."""
    x = np.asarray(values, dtype=float)
    st = rolling_stats(x, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        z = (x - st["mean"]) / st["std"]
    return np.where(st["std"] == 0, 0.0, z)


def expanding_zscore(values, min_periods: int = 20) -> np.ndarray:
    s = pd.Series(np.asarray(values, dtype=float))
    m = s.expanding(min_periods=min_periods).mean()
    sd = s.expanding(min_periods=min_periods).std(ddof=0)
    return ((s - m) / sd.replace(0, np.nan)).to_numpy()


def detect_gaps(times: np.ndarray, expected_seconds: int, tolerance: float = 1.5) -> list[int]:
    """Indices i where times[i]-times[i-1] exceeds expected spacing * tolerance (intraday same-session only)."""
    t = np.asarray(times, dtype=np.int64)
    if len(t) < 2:
        return []
    d = np.diff(t)
    same_day = ((t[1:] + 19800) // 86400) == ((t[:-1] + 19800) // 86400)
    return [int(i + 1) for i in np.where((d > expected_seconds * tolerance) & same_day)[0]]
