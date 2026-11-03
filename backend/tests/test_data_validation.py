"""Dataset validation, cleaning, calendar/session-aware resampling and insufficient-history handling."""
from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.algorithms.processing import clean_ohlcv, rolling_zscore
from app.market_data.calendar import history_and_live_dates, is_trading_day, session_open_ts
from app.market_data.resample import available_timeframes, resample_daily, resample_intraday
from app.market_data.validation import validate_csv

HEADER = "timestamp,open,high,low,close,volume,symbol,exchange\n"


def _csv(rows):
    return (HEADER + "\n".join(rows) + "\n").encode()


def test_empty_and_missing_columns():
    assert not validate_csv(b"", "x.csv").is_valid
    r = validate_csv(b"timestamp,open,close\n2024-01-02,1,2\n", "x.csv")
    assert not r.is_valid and r.structural_error
    assert "Missing required column" in r.errors[0]["message"]


def test_invalid_ohlcv_rows_are_reported():
    r = validate_csv(_csv([
        "2024-01-02,100,105,99,104,1000,AAA,NSE",
        "notadate,100,105,99,104,1000,AAA,NSE",
        "2024-01-03,100,99,98,100,1000,AAA,NSE",   # high < max(open, close)
        "2024-01-04,100,105,101,104,1000,AAA,NSE",  # low > min(open, close)
        "2024-01-05,-1,105,99,104,1000,AAA,NSE",   # negative price
        "2024-01-08,100,105,99,104,-5,AAA,NSE",    # negative volume
        "2024-01-09,abc,105,99,104,10,AAA,NSE",    # non numeric
        "2024-01-10,100,105,99,104,10,AAA,LSE",    # bad exchange
    ]), "bad.csv")
    msgs = " | ".join(e["message"] for e in r.errors)
    for frag in ("Unparseable timestamp", "High is below", "Low is above", "positive", "non-negative", "Non-numeric",
                 "Unsupported exchange"):
        assert frag in msgs
    assert r.valid_rows == 1
    assert not r.is_valid
    assert all(e["row"] is not None for e in r.errors)


def test_duplicates_zero_volume_gaps_unknown_symbol():
    r = validate_csv(_csv([
        "2024-01-02,100,105,99,104,1000,NEWCO,NSE",
        "2024-01-02,100,105,99,104,1000,NEWCO,NSE",
        "2024-01-03,104,106,103,105,0,NEWCO,NSE",
        "2024-01-08,105,107,104,106,1200,NEWCO,NSE",  # gap: 4th and 5th missing
    ]), "dup.csv", known_symbols={"RELIANCE"})
    assert r.duplicates_removed == 1
    assert r.valid_rows == 3
    assert r.is_valid
    w = " | ".join(x["message"] for x in r.warnings)
    assert "Zero volume" in w and "missing trading day" in w and "Unknown symbol NEWCO" in w
    assert set(r.clean["timeframe"]) == {"1d"}
    assert r.clean["time"].iloc[0] == session_open_ts(date(2024, 1, 2))


def test_intraday_timestamps_detected():
    r = validate_csv(_csv([
        "2024-01-02T09:15:00+05:30,100,101,99,100,10,AAA,NSE",
        "2024-01-02T09:16:00+05:30,100,101,99,100.5,10,AAA,NSE",
    ]), "m.csv")
    assert r.is_valid and set(r.clean["timeframe"]) == {"1m"}


def test_clean_ohlcv_ffill_dedupe_and_repair():
    df = pd.DataFrame({"time": [3, 1, 2, 2], "open": [10, 10, np.nan, 11], "high": [9, 11, np.nan, 12],
                       "low": [9, 9, np.nan, 10], "close": [10, 10, np.nan, 11], "volume": [1, 2, np.nan, 5]})
    out, rep = clean_ohlcv(df)
    assert rep.duplicates_removed == 1
    assert out["time"].tolist() == [1, 2, 3]
    assert (out["high"] >= out[["open", "close"]].max(axis=1)).all()
    assert rep.inconsistent_fixed >= 1


def test_rolling_zscore_is_causal():
    x = np.arange(50, dtype=float)
    z1 = rolling_zscore(x, 10)
    x2 = x.copy()
    x2[30:] = 1000
    z2 = rolling_zscore(x2, 10)
    np.testing.assert_allclose(z1[:30], z2[:30], equal_nan=True)


def _minute_frame(days):
    rows = []
    for d in days:
        t0 = session_open_ts(d)
        for m in range(375):
            p = 100 + m * 0.01
            rows.append((t0 + 60 * m, p, p + 0.05, p - 0.05, p + 0.01, 10))
    return pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume"])


def test_session_aware_intraday_resampling():
    days = [date(2026, 10, 29), date(2026, 10, 30)]
    m = _minute_frame(days)
    h1 = resample_intraday(m, "1h")
    assert len(h1) == 14  # 7 buckets per session (last one 15:15-15:30)
    assert h1["time"].iloc[0] == session_open_ts(days[0])
    assert h1["time"].iloc[7] == session_open_ts(days[1])  # never merges across sessions
    assert h1["volume"].iloc[0] == 600 and h1["volume"].iloc[6] == 150
    h4 = resample_intraday(m, "4h")
    assert len(h4) == 4 and h4["volume"].tolist() == [2400, 1350, 2400, 1350]
    m5 = resample_intraday(m, "5m")
    assert len(m5) == 150
    assert m5["open"].iloc[0] == m["open"].iloc[0] and m5["close"].iloc[0] == m["close"].iloc[4]
    assert m5["high"].iloc[0] == m["high"].iloc[:5].max()


def test_daily_to_weekly_and_monthly():
    days = pd.bdate_range("2026-09-01", "2026-10-30")
    ts = [session_open_ts(d.date()) for d in days]
    d = pd.DataFrame({"time": ts, "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 1})
    w = resample_daily(d, "1w")
    mth = resample_daily(d, "1M")
    assert len(mth) == 2 and mth["volume"].tolist() == [22, 22]
    assert w["volume"].sum() == len(d)


def test_calendar_and_timeframes():
    assert not is_trading_day(date(2026, 11, 1))  # Sunday
    assert not is_trading_day(date(2026, 10, 2))  # Gandhi Jayanti
    assert history_and_live_dates(date(2026, 11, 3)) == (date(2026, 11, 2), date(2026, 11, 3))
    assert available_timeframes(False, True) == ["1d", "1w", "1M"]
    assert len(available_timeframes(True, True)) == 9


@pytest.mark.usefixtures("seeded")
def test_imported_dataset_and_insufficient_history(client, admin_auth):
    content = _csv([f"2024-01-{d:02d},100,105,99,104,1000,TINYCO,NSE" for d in (2, 3, 4, 5, 8)])
    r = client.post("/api/admin/datasets/import", headers=admin_auth, files={"file": ("tiny.csv", content, "text/csv")})
    assert r.status_code == 200, r.text
    assert r.json()["imported_rows"] == 5
    detail = client.get("/api/stocks/TINYCO").json()
    assert detail["data_source"] == "HISTORICAL_DATASET" and detail["sector"] == "Unclassified"
    assert detail["available_timeframes"] == ["1d", "1w", "1M"]
    assert client.get("/api/stocks/TINYCO/candles?timeframe=5m").status_code == 400
    a = client.get("/api/analysis/TINYCO")
    assert a.status_code == 422 and a.json()["code"] == "insufficient_data"
    sig = client.post("/api/signals/generate", json={"symbol": "TINYCO", "strategy_key": "trend_following"}).json()
    assert sig["action"] == "HOLD" and "warm-up" in sig["explanation"]


def test_validate_endpoint_requires_admin(client, auth, admin_auth):
    files = {"file": ("x.csv", _csv(["2024-01-02,100,105,99,104,1000,AAA,NSE"]), "text/csv")}
    assert client.post("/api/admin/datasets/validate", headers=auth, files=files).status_code == 403
    r = client.post("/api/admin/datasets/validate", headers=admin_auth, files=files)
    assert r.status_code == 200 and r.json()["is_valid"] is True
    bad = client.post("/api/admin/datasets/validate", headers=admin_auth, files={"file": ("x.csv", b"a,b\n1,2\n", "text/csv")})
    assert bad.json()["is_valid"] is False
