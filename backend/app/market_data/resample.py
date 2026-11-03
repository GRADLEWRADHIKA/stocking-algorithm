"""Session-aware OHLCV resampling.

Candle frames use columns: time (UNIX seconds, bar open), open, high, low, close, volume.
Intraday buckets are anchored at the 09:15 IST session open and never span two sessions
(e.g. 1h bars: 09:15, 10:15, ... 15:15 (15-minute final bar); 4h bars: 09:15, 13:15).
Weekly bars group by ISO week, monthly bars by calendar month (bar time = first bar in the group).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

INTRADAY_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240}
ALL_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
DAILY_DERIVED = ["1d", "1w", "1M"]
IST_OFFSET = 19800
SESSION_OPEN_OFFSET = 9 * 3600 + 15 * 60
COLUMNS = ["time", "open", "high", "low", "close", "volume"]


def empty_frame() -> pd.DataFrame:
    return pd.DataFrame({c: pd.Series(dtype="int64" if c in ("time", "volume") else "float64") for c in COLUMNS})


def _agg(df: pd.DataFrame, key: np.ndarray, time_key: np.ndarray | None = None) -> pd.DataFrame:
    g = df.assign(_k=key).groupby("_k", sort=True)
    out = pd.DataFrame({
        "time": g["time"].first() if time_key is None else pd.Series(time_key, index=df.index).groupby(key).first(),
        "open": g["open"].first(),
        "high": g["high"].max(),
        "low": g["low"].min(),
        "close": g["close"].last(),
        "volume": g["volume"].sum(),
    })
    out = out.reset_index(drop=True)
    out["time"] = out["time"].astype("int64")
    out["volume"] = out["volume"].astype("int64")
    return out


def session_dates(times: np.ndarray) -> np.ndarray:
    """IST calendar day number (days since epoch) for each timestamp."""
    return (np.asarray(times, dtype=np.int64) + IST_OFFSET) // 86400


def resample_intraday(minute_df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    n = INTRADAY_MINUTES[timeframe]
    if minute_df.empty or n == 1:
        return minute_df.reset_index(drop=True)
    df = minute_df.sort_values("time", kind="stable").reset_index(drop=True)
    ts = df["time"].to_numpy(dtype=np.int64)
    ist = ts + IST_OFFSET
    day_start_ist = (ist // 86400) * 86400
    minute_of_session = (ist - day_start_ist - SESSION_OPEN_OFFSET) // 60
    bucket = minute_of_session // n
    bucket_ts = day_start_ist - IST_OFFSET + SESSION_OPEN_OFFSET + bucket * n * 60
    return _agg(df, bucket_ts, bucket_ts)


def resample_daily(daily_df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if daily_df.empty or timeframe == "1d":
        return daily_df.reset_index(drop=True)
    df = daily_df.sort_values("time", kind="stable").reset_index(drop=True)
    dt = pd.to_datetime(df["time"].to_numpy() + IST_OFFSET, unit="s")
    if timeframe == "1w":
        iso = dt.isocalendar()
        key = (iso["year"].to_numpy().astype(np.int64) * 100 + iso["week"].to_numpy().astype(np.int64))
    elif timeframe == "1M":
        key = dt.year.to_numpy().astype(np.int64) * 100 + dt.month.to_numpy().astype(np.int64)
    else:
        raise ValueError(f"Unsupported daily-derived timeframe {timeframe}")
    return _agg(df, key)


def available_timeframes(has_minute: bool, has_daily: bool) -> list[str]:
    out: list[str] = []
    if has_minute:
        out += ["1m", "5m", "15m", "30m", "1h", "4h"]
    if has_daily:
        out += ["1d", "1w", "1M"]
    return out


def bars_per_year(timeframe: str, bars_per_session: float | None = None) -> float:
    if timeframe == "1d":
        return 252.0
    if timeframe == "1w":
        return 52.0
    if timeframe == "1M":
        return 12.0
    n = INTRADAY_MINUTES[timeframe]
    per_session = bars_per_session or float(int(np.ceil(375 / n)))
    return 252.0 * per_session
