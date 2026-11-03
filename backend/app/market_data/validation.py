"""DataValidationService: validates OHLCV CSV datasets before import.

Expected columns (case-insensitive): timestamp, open, high, low, close, volume, symbol, exchange.
Timestamps: ISO-8601 dates/datetimes or UNIX seconds. Naive datetimes are interpreted as IST market time.
Date-only rows (or midnight timestamps) are daily bars and are stamped at the 09:15 IST session open;
anything else is treated as 1-minute bars (floored to the minute).

Errors (row excluded): unparseable timestamp, non-numeric values, non-positive prices, negative volume,
high < max(open, close), low > min(open, close), empty symbol, unsupported exchange.
Warnings: zero-volume bars, gaps vs the NSE calendar (daily) or within a session (intraday),
unknown symbols (auto-created with sector 'Unclassified' on import), non-trading-day bars, duplicates removed.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

from app.market_data.calendar import IST, is_trading_day, session_open_ts, trading_days

REQUIRED = ["timestamp", "open", "high", "low", "close", "volume", "symbol", "exchange"]
EXCHANGES = {"NSE", "BSE"}
MAX_LISTED = 25


@dataclass
class ValidationResult:
    filename: str
    rows: int = 0
    errors: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    duplicates_removed: int = 0
    symbols: list[str] = field(default_factory=list)
    clean: pd.DataFrame | None = None  # valid rows: symbol, exchange, timeframe, time, open..volume
    structural_error: bool = False

    @property
    def valid_rows(self) -> int:
        return 0 if self.clean is None else len(self.clean)

    @property
    def is_valid(self) -> bool:
        return not self.errors and self.valid_rows > 0

    def report(self) -> dict:
        return {
            "filename": self.filename, "rows": self.rows, "valid_rows": self.valid_rows, "symbols": self.symbols,
            "errors": self.errors, "warnings": self.warnings, "duplicates_removed": self.duplicates_removed,
            "is_valid": self.is_valid,
        }


def _add(lst: list[dict], row: int | None, msg: str, counter: dict, key: str) -> None:
    counter[key] = counter.get(key, 0) + 1
    if counter[key] <= MAX_LISTED:
        lst.append({"row": row, "message": msg})


def _parse_timestamps(raw: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Return (epoch seconds float series with NaN for failures, is_daily bool series)."""
    s = raw.astype(str).str.strip()
    numeric = pd.to_numeric(s, errors="coerce")
    out = pd.Series(np.nan, index=s.index)
    daily = pd.Series(False, index=s.index)
    num_mask = numeric.notna() & (numeric > 1e8)
    out[num_mask] = numeric[num_mask].astype(float)
    rest = ~num_mask
    if rest.any():
        dt = pd.to_datetime(s[rest], errors="coerce", utc=False, format="mixed")
        for idx, v in dt.items():
            if pd.isna(v):
                continue
            ts = v.to_pydatetime()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=IST)
            local = ts.astimezone(IST)
            if local.hour == 0 and local.minute == 0 and local.second == 0:
                daily[idx] = True
                out[idx] = float(session_open_ts(local.date()))
            else:
                out[idx] = float(int(ts.timestamp()) // 60 * 60)
    return out, daily


def validate_csv(content: bytes, filename: str, known_symbols: set[str] | None = None) -> ValidationResult:
    res = ValidationResult(filename=filename)
    known_symbols = known_symbols or set()
    if not content or not content.strip():
        res.errors.append({"row": None, "message": "File is empty"})
        res.structural_error = True
        return res
    try:
        df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False)
    except Exception as exc:  # noqa: BLE001 - report parse failures
        res.errors.append({"row": None, "message": f"Could not parse CSV: {exc}"})
        res.structural_error = True
        return res
    df.columns = [str(c).strip().lower() for c in df.columns]
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        res.errors.append({"row": None, "message": f"Missing required column(s): {', '.join(missing)}"})
        res.structural_error = True
        res.rows = len(df)
        return res
    res.rows = len(df)
    if df.empty:
        res.errors.append({"row": None, "message": "File has a header but no data rows"})
        res.structural_error = True
        return res

    counters: dict[str, int] = {}
    line = pd.Series(np.arange(len(df)) + 2, index=df.index)  # CSV line numbers (header = 1)
    ok = pd.Series(True, index=df.index)

    ts, is_daily = _parse_timestamps(df["timestamp"])
    bad_ts = ts.isna()
    for i in df.index[bad_ts]:
        _add(res.errors, int(line[i]), f"Unparseable timestamp '{df.at[i, 'timestamp']}'", counters, "ts")
    ok &= ~bad_ts

    nums = {}
    for col in ["open", "high", "low", "close", "volume"]:
        v = pd.to_numeric(df[col].str.strip(), errors="coerce")
        nums[col] = v
        bad = v.isna() & ok
        for i in df.index[bad]:
            _add(res.errors, int(line[i]), f"Non-numeric or missing {col} '{df.at[i, col]}'", counters, "num")
        ok &= ~v.isna()
    o, h, lo, c, vol = (nums[k] for k in ("open", "high", "low", "close", "volume"))
    bad_price = ok & ((o <= 0) | (h <= 0) | (lo <= 0) | (c <= 0))
    for i in df.index[bad_price]:
        _add(res.errors, int(line[i]), "Prices must be positive", counters, "neg")
    ok &= ~bad_price
    bad_vol = ok & (vol < 0)
    for i in df.index[bad_vol]:
        _add(res.errors, int(line[i]), "Volume must be non-negative", counters, "negv")
    ok &= ~bad_vol
    bad_hi = ok & (h < np.maximum(o, c))
    for i in df.index[bad_hi]:
        _add(res.errors, int(line[i]), "High is below max(open, close)", counters, "hi")
    bad_lo = ok & (lo > np.minimum(o, c))
    for i in df.index[bad_lo]:
        _add(res.errors, int(line[i]), "Low is above min(open, close)", counters, "lo")
    ok &= ~bad_hi & ~bad_lo

    sym = df["symbol"].str.strip().str.upper()
    exch = df["exchange"].str.strip().str.upper()
    bad_sym = ok & (sym == "")
    for i in df.index[bad_sym]:
        _add(res.errors, int(line[i]), "Empty symbol", counters, "sym")
    bad_ex = ok & ~exch.isin(EXCHANGES)
    for i in df.index[bad_ex]:
        _add(res.errors, int(line[i]), f"Unsupported exchange '{df.at[i, 'exchange']}' (use NSE or BSE)", counters, "ex")
    ok &= ~bad_sym & ~bad_ex

    for key, label in [("ts", "timestamp"), ("num", "numeric"), ("neg", "price"), ("negv", "volume"), ("hi", "high"),
                       ("lo", "low"), ("sym", "symbol"), ("ex", "exchange")]:
        if counters.get(key, 0) > MAX_LISTED:
            res.errors.append({"row": None, "message": f"... {counters[key] - MAX_LISTED} more {label} error(s) not listed"})

    clean = pd.DataFrame({
        "line": line, "symbol": sym, "exchange": exch, "time": ts, "daily": is_daily,
        "open": o, "high": h, "low": lo, "close": c, "volume": vol,
    })[ok]
    if clean.empty:
        res.clean = clean.drop(columns=["line", "daily"])
        res.symbols = []
        return res
    clean["time"] = clean["time"].astype(np.int64)
    clean["volume"] = clean["volume"].round().astype(np.int64)

    # timeframe per symbol/exchange: daily if every row is a date-only/midnight stamp
    tf_map = clean.groupby(["symbol", "exchange"])["daily"].all()
    clean["timeframe"] = [("1d" if tf_map[(s, e)] else "1m") for s, e in zip(clean["symbol"], clean["exchange"])]
    mixed = clean.groupby(["symbol", "exchange"])["daily"].nunique()
    for (s, e), n in mixed.items():
        if n > 1:
            res.warnings.append({"row": None, "message": f"{s}/{e}: mixed date-only and intraday timestamps; "
                                                          "treated as 1-minute bars"})
    # duplicates (same symbol/exchange/timeframe/time) -> keep first occurrence
    dup = clean.duplicated(["symbol", "exchange", "timeframe", "time"], keep="first")
    res.duplicates_removed = int(dup.sum())
    for i in clean.index[dup][:MAX_LISTED]:
        res.warnings.append({"row": int(clean.at[i, "line"]), "message": "Duplicate timestamp removed"})
    clean = clean[~dup]

    zero = clean[clean["volume"] == 0]
    for i in zero.index[:MAX_LISTED]:
        res.warnings.append({"row": int(clean.at[i, "line"]), "message": "Zero volume bar"})
    if len(zero) > MAX_LISTED:
        res.warnings.append({"row": None, "message": f"... {len(zero) - MAX_LISTED} more zero-volume bar(s)"})

    clean = clean.sort_values(["symbol", "exchange", "timeframe", "time"]).reset_index(drop=True)
    for (s, e, tf), g in clean.groupby(["symbol", "exchange", "timeframe"]):
        t = g["time"].to_numpy()
        if tf == "1d":
            dates = [pd.Timestamp(x, unit="s", tz="UTC").tz_convert("Asia/Kolkata").date() for x in t]
            non_trading = [d for d in dates if not is_trading_day(d)]
            if non_trading:
                res.warnings.append({"row": None, "message": f"{s}: {len(non_trading)} bar(s) on non-trading days "
                                                              f"(e.g. {non_trading[0].isoformat()})"})
            if len(dates) > 1:
                expected = trading_days(dates[0], dates[-1])
                have = set(dates)
                missing_days = [d for d in expected if d not in have]
                if missing_days:
                    res.warnings.append({"row": None, "message": f"{s}: {len(missing_days)} missing trading day(s) "
                                                                  f"(gaps), first {missing_days[0].isoformat()}"})
        else:
            d = np.diff(t)
            same = ((t[1:] + 19800) // 86400) == ((t[:-1] + 19800) // 86400)
            gaps = int(((d > 60) & same).sum())
            if gaps:
                res.warnings.append({"row": None, "message": f"{s}: {gaps} intraday gap(s) within sessions"})
        if s not in known_symbols:
            res.warnings.append({"row": None, "message": f"Unknown symbol {s} ({e}): will be created with sector "
                                                          "'Unclassified' on import"})
    res.symbols = sorted(clean["symbol"].unique().tolist())
    res.clean = clean.drop(columns=["line", "daily"])
    return res


def first_date(d: pd.DataFrame) -> date | None:  # pragma: no cover - helper
    if d.empty:
        return None
    return pd.Timestamp(int(d["time"].min()), unit="s").date()
