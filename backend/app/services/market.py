"""Quotes, stock summaries/details, screens and market overview (live + replay)."""
from __future__ import annotations

import math
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd

from app.core.errors import NotFoundError, ValidationAppError
from app.indicators import core
from app.market_data.cache import market_cache
from app.market_data.calendar import IST, is_trading_day, session_close_dt, session_state
from app.market_data.live import LiveQuote, live_market
from app.market_data.provider import market_data
from app.repositories.stocks import StockInfo, registry

SCREEN_KEYS = ["gainers", "losers", "momentum", "breakout", "ma_crossover", "high_volatility", "oversold", "overbought"]


def _r(x, nd=2):
    if x is None:
        return None
    f = float(x)
    return None if math.isnan(f) or math.isinf(f) else round(f, nd)


# ------------------------------------------------------------------ quotes
def quote_dict(stock: StockInfo, q: LiveQuote | None) -> dict:
    if q is None:
        return {"symbol": stock.symbol, "name": stock.name, "exchange": stock.exchange, "sector": stock.sector,
                "price": 0.0, "prev_close": 0.0, "change": 0.0, "change_pct": 0.0, "volume": 0,
                "data_source": stock.data_source}
    return {
        "symbol": stock.symbol, "name": stock.name, "exchange": stock.exchange, "sector": stock.sector,
        "price": _r(q.price), "prev_close": _r(q.prev_close), "change": _r(q.change),
        "change_pct": _r(q.change_pct, 4), "volume": int(q.volume), "data_source": q.data_source,
    }


def get_quote(stock: StockInfo) -> dict:
    return quote_dict(stock, market_data.quote(stock))


def sparkline(stock: StockInfo, n: int = 30, current: float | None = None) -> list[float]:
    d = market_data.daily_closes(stock)
    if d.empty:
        return []
    closes = d["close"].to_numpy(dtype=float)
    q = live_market.get(stock.symbol)
    if current is None and q is not None and q.ticking:
        current = q.price
    if current is not None and q is not None and q.ticking:
        vals = list(closes[-(n - 1):]) + [current]
    else:
        vals = list(closes[-n:])
    return [round(float(v), 2) for v in vals]


def stock_summary(stock: StockInfo, quote: dict | None = None) -> dict:
    qd = quote or get_quote(stock)
    return {**qd, "market_cap": _r(stock.market_cap), "sparkline": sparkline(stock, 30, qd["price"] or None)}


# ------------------------------------------------------------------ screens
def screen_snapshot(stock: StockInfo) -> dict:
    """Latest-bar daily indicator snapshot used by screens (cached)."""
    def build() -> dict:
        d = market_data.daily_closes(stock)
        if len(d) < 30:
            return {}
        c, h, lo = d["close"].to_numpy(float), d["high"].to_numpy(float), d["low"].to_numpy(float)
        e20, e50 = core.ema(c, 20), core.ema(c, 50)
        cross_up = core.crosses_above(e20, e50)
        prior_high = core.shift(core.rolling_max(h, 20))
        return {
            "rsi": _r(core.rsi(c, 14)[-1], 4), "roc10": _r(core.roc(c, 10)[-1], 4), "ema20": _r(e20[-1], 4),
            "ema50": _r(e50[-1], 4), "close": float(c[-1]), "hv20": _r(core.historical_volatility(c, 20)[-1], 4),
            "breakout": bool(c[-1] > prior_high[-1]) if not np.isnan(prior_high[-1]) else False,
            "ma_cross_recent": bool(cross_up[-5:].any()),
            "low": float(lo[-1]),
        }
    return market_cache.get_or_set(("screen", stock.id, len(market_data.daily_closes(stock))), build, 600)


def apply_screen(stocks: list[StockInfo], quotes: dict[str, dict], key: str) -> list[StockInfo]:
    if key not in SCREEN_KEYS:
        raise ValidationAppError(f"Unknown screen '{key}'", code="invalid_screen")
    if key == "gainers":
        return [s for s in stocks if (quotes[s.symbol]["change_pct"] or 0) > 0]
    if key == "losers":
        return [s for s in stocks if (quotes[s.symbol]["change_pct"] or 0) < 0]
    snaps = {s.symbol: screen_snapshot(s) for s in stocks}
    out = []
    if key == "high_volatility":
        hvs = [v["hv20"] for v in snaps.values() if v.get("hv20") is not None]
        cutoff = float(np.percentile(hvs, 75)) if hvs else float("inf")
    for s in stocks:
        sn = snaps[s.symbol]
        if not sn:
            continue
        if key == "momentum" and (sn["roc10"] or 0) > 5 and sn["close"] > (sn["ema20"] or 1e18):
            out.append(s)
        elif key == "breakout" and sn["breakout"]:
            out.append(s)
        elif key == "ma_crossover" and sn["ma_cross_recent"]:
            out.append(s)
        elif key == "high_volatility" and sn.get("hv20") is not None and sn["hv20"] >= cutoff:
            out.append(s)
        elif key == "oversold" and sn["rsi"] is not None and sn["rsi"] < 30:
            out.append(s)
        elif key == "overbought" and sn["rsi"] is not None and sn["rsi"] > 70:
            out.append(s)
    return out


SORT_KEYS = {"change_pct", "volume", "price", "symbol"}


def list_stocks(q: str | None = None, exchange: str | None = None, sector: str | None = None,
                min_price: float | None = None, max_price: float | None = None, min_volume: float | None = None,
                min_mcap: float | None = None, max_mcap: float | None = None, screen: str | None = None,
                sort: str | None = None, limit: int = 50, offset: int = 0) -> dict:
    stocks = registry.all()
    if q:
        ql = q.strip().lower()
        stocks = [s for s in stocks if ql in s.symbol.lower() or ql in s.name.lower()]
    if exchange:
        stocks = [s for s in stocks if s.exchange == exchange.upper()]
    if sector:
        stocks = [s for s in stocks if s.sector.lower() == sector.lower()]
    quotes = {s.symbol: get_quote(s) for s in stocks}
    if min_price is not None:
        stocks = [s for s in stocks if quotes[s.symbol]["price"] >= min_price]
    if max_price is not None:
        stocks = [s for s in stocks if quotes[s.symbol]["price"] <= max_price]
    if min_volume is not None:
        stocks = [s for s in stocks if quotes[s.symbol]["volume"] >= min_volume]
    if min_mcap is not None:
        stocks = [s for s in stocks if s.market_cap is not None and s.market_cap >= min_mcap]
    if max_mcap is not None:
        stocks = [s for s in stocks if s.market_cap is not None and s.market_cap <= max_mcap]
    if screen:
        stocks = apply_screen(stocks, quotes, screen)
    if sort:
        desc = sort.startswith("-")
        key = sort.lstrip("-")
        if key not in SORT_KEYS:
            raise ValidationAppError(f"Invalid sort '{sort}'", code="invalid_sort")
        if key == "symbol":
            stocks = sorted(stocks, key=lambda s: s.symbol, reverse=desc)
        else:
            stocks = sorted(stocks, key=lambda s: quotes[s.symbol][key] or 0, reverse=desc)
    elif screen in ("gainers",):
        stocks = sorted(stocks, key=lambda s: quotes[s.symbol]["change_pct"], reverse=True)
    elif screen in ("losers",):
        stocks = sorted(stocks, key=lambda s: quotes[s.symbol]["change_pct"])
    total = len(stocks)
    page = stocks[offset: offset + limit]
    return {"items": [stock_summary(s, quotes[s.symbol]) for s in page], "total": total, "limit": limit,
            "offset": offset}


def sectors() -> list[str]:
    return sorted({s.sector for s in registry.all()})


# ------------------------------------------------------------------ stock detail
def _period_return(closes: np.ndarray, current: float, bars: int) -> float | None:
    if len(closes) < bars + 1:
        return None
    base = closes[-bars - 1] if bars > 0 else closes[-1]
    return _r(100.0 * (current / base - 1.0), 4)


def _beta(stock_ret: np.ndarray, mkt_ret: np.ndarray) -> float | None:
    n = min(len(stock_ret), len(mkt_ret))
    if n < 30:
        return None
    a, b = stock_ret[-n:], mkt_ret[-n:]
    mask = ~np.isnan(a) & ~np.isnan(b)
    if mask.sum() < 30 or np.var(b[mask]) == 0:
        return None
    return float(np.cov(a[mask], b[mask])[0, 1] / np.var(b[mask], ddof=1))


def aligned_returns(stock: StockInfo, bench_symbol: str = "NIFTY50", lookback: int = 252) -> tuple[np.ndarray, np.ndarray]:
    bench = registry.get(bench_symbol)
    d = market_data.daily_closes(stock)
    if bench is None or d.empty:
        return np.zeros(0), np.zeros(0)
    b = market_data.daily_closes(bench)
    m = pd.merge(d[["time", "close"]], b[["time", "close"]], on="time", suffixes=("_s", "_b")).tail(lookback + 1)
    rs = m["close_s"].pct_change().to_numpy()[1:]
    rb = m["close_b"].pct_change().to_numpy()[1:]
    return rs, rb


def stock_detail(symbol: str) -> dict:
    stock = market_data.stock(symbol)
    q = market_data.quote(stock)
    qd = quote_dict(stock, q)
    tfs = market_data.available_timeframes(stock)
    d = market_data.daily_closes(stock)
    closes = d["close"].to_numpy(float) if not d.empty else np.zeros(0)
    current = qd["price"] or (float(closes[-1]) if len(closes) else 0.0)
    live = q is not None and q.ticking
    hist = closes if live else closes[:-1]  # when not live, the last stored bar IS the current price
    perf: dict[str, float | None] = {}
    for key, bars in (("1W", 5), ("1M", 21), ("3M", 63), ("6M", 126), ("1Y", 252), ("3Y", 756)):
        perf[key] = _period_return(hist, current, bars - 1) if len(hist) else None
    ytd = None
    if not d.empty:
        cur_year = datetime.fromtimestamp(int(d["time"].iloc[-1]), tz=IST).year if not live else datetime.now(IST).year
        years = np.array([datetime.fromtimestamp(int(x), tz=IST).year for x in d["time"].to_numpy()])
        prior = closes[years < cur_year]
        if len(prior):
            ytd = _r(100.0 * (current / prior[-1] - 1.0), 4)
    perf["YTD"] = ytd
    perf = {k: perf[k] for k in ("1W", "1M", "3M", "6M", "YTD", "1Y", "3Y")}

    last252 = np.concatenate([closes[-251:], [current]]) if live else closes[-252:]
    highs = d["high"].to_numpy(float)[-252:] if not d.empty else np.zeros(0)
    lows = d["low"].to_numpy(float)[-252:] if not d.empty else np.zeros(0)
    high_52 = float(max(highs.max() if len(highs) else current, q.high if live else current))
    low_52 = float(min(lows.min() if len(lows) else current, q.low if live else current))
    vols = d["volume"].to_numpy(float)[-20:] if not d.empty else np.zeros(0)
    lr = np.diff(np.log(last252)) if len(last252) > 2 else np.zeros(0)
    vol_ann = float(np.std(lr, ddof=1) * math.sqrt(252) * 100) if len(lr) > 2 else 0.0
    rs, rb = aligned_returns(stock)
    beta = _beta(rs, rb)
    last = d.iloc[-1] if not d.empty else None
    stats = {
        "high_52w": round(high_52, 2), "low_52w": round(low_52, 2),
        "avg_volume_20d": round(float(vols.mean()), 2) if len(vols) else 0.0,
        "volatility_annualized": round(vol_ann, 4), "beta": _r(beta, 4),
        "day_high": _r(q.high if q else (last["high"] if last is not None else 0)),
        "day_low": _r(q.low if q else (last["low"] if last is not None else 0)),
        "open": _r(q.open if q else (last["open"] if last is not None else 0)),
    }
    fundamentals = {
        "market_cap": _r(stock.market_cap), "pe_ratio": _r(stock.pe_ratio, 4), "pb_ratio": _r(stock.pb_ratio, 4),
        "eps": _r(stock.eps, 4), "dividend_yield": _r(stock.dividend_yield, 4), "book_value": _r(stock.book_value, 4),
        "face_value": _r(stock.face_value, 4), "data_source": stock.fundamentals_source,
    }
    desc = stock.description or (
        f"{stock.name} ({stock.symbol}, {stock.exchange}) — sector: {stock.sector}"
        + (f", industry: {stock.industry}" if stock.industry else "") + "."
    )
    return {
        **qd, "market_cap": _r(stock.market_cap), "sparkline": sparkline(stock, 30, current if live else None),
        "isin": stock.isin, "description": desc, "fundamentals": fundamentals, "performance": perf, "stats": stats,
        "available_timeframes": tfs,
    }


# ------------------------------------------------------------------ indices & overview
def index_quotes(as_of_date: date | None = None) -> list[dict]:
    out = []
    live = live_market.index_snapshot()
    for ix in registry.indices():
        d = market_data.daily_closes(ix)
        if as_of_date is None and ix.symbol in live:
            li = live[ix.symbol]
            spark = [round(float(v), 2) for v in d["close"].to_numpy()[-59:]] + [li.value] if not d.empty else [li.value]
            out.append({"symbol": ix.symbol, "name": ix.name, "value": round(li.value, 2),
                        "change": round(li.value - li.prev_close, 2),
                        "change_pct": round(100 * (li.value / li.prev_close - 1), 4) if li.prev_close else 0.0,
                        "sparkline": spark, "data_source": "SIMULATED"})
            continue
        if d.empty:
            continue
        sub = d if as_of_date is None else d[_dates(d) <= as_of_date]
        if len(sub) < 2:
            continue
        v, p = float(sub["close"].iloc[-1]), float(sub["close"].iloc[-2])
        out.append({"symbol": ix.symbol, "name": ix.name, "value": round(v, 2), "change": round(v - p, 2),
                    "change_pct": round(100 * (v / p - 1), 4), "sparkline": [round(float(x), 2) for x in sub["close"].to_numpy()[-60:]],
                    "data_source": ix.data_source})
    order = ["NIFTY50", "SENSEX", "NIFTYBANK", "NIFTYIT", "NIFTYMIDCAP"]
    return sorted(out, key=lambda x: order.index(x["symbol"]) if x["symbol"] in order else 99)


def _dates(d: pd.DataFrame) -> np.ndarray:
    return np.array([datetime.fromtimestamp(int(x), tz=IST).date() for x in d["time"].to_numpy()])


def _replay_quotes(day: date) -> tuple[list[tuple[StockInfo, dict]], datetime]:
    rows = []
    for s in registry.all():
        d = market_data.daily_closes(s)
        if d.empty:
            continue
        sub = d[_dates(d) <= day]
        if len(sub) < 2 or _dates(sub.tail(1))[0] != day:
            continue
        c, p = float(sub["close"].iloc[-1]), float(sub["close"].iloc[-2])
        rows.append((s, {"symbol": s.symbol, "name": s.name, "exchange": s.exchange, "sector": s.sector, "price": round(c, 2),
                         "prev_close": round(p, 2), "change": round(c - p, 2), "change_pct": round(100 * (c / p - 1), 4),
                         "volume": int(sub["volume"].iloc[-1]), "data_source": s.data_source}))
    return rows, session_close_dt(day)


def market_summary_sentences(indices: list[dict], breadth: dict, sectors_perf: list[dict], gainers: list[dict],
                             losers: list[dict], active: list[dict], data_source: str) -> list[str]:
    s: list[str] = []
    for ix in indices[:2]:
        direction = "up" if ix["change_pct"] > 0 else "down" if ix["change_pct"] < 0 else "flat"
        s.append(f"{ix['symbol']} is {direction} {abs(ix['change_pct']):.2f}% at {ix['value']:,.2f}.")
    adv, dec = breadth["advancers"], breadth["decliners"]
    if adv + dec:
        tone = "positive" if adv > dec * 1.2 else "negative" if dec > adv * 1.2 else "mixed"
        s.append(f"Market breadth is {tone}: {adv} advancers vs {dec} decliners ({breadth['unchanged']} unchanged).")
    if sectors_perf:
        best, worst = sectors_perf[0], sectors_perf[-1]
        s.append(f"Strongest sector: {best['sector']} ({best['change_pct']:+.2f}% avg); weakest: {worst['sector']} "
                 f"({worst['change_pct']:+.2f}% avg).")
    if gainers:
        s.append(f"Top gainer: {gainers[0]['symbol']} ({gainers[0]['change_pct']:+.2f}%).")
    if losers:
        s.append(f"Top loser: {losers[0]['symbol']} ({losers[0]['change_pct']:+.2f}%).")
    if active:
        tv = active[0]["price"] * active[0]["volume"] / 1e7
        s.append(f"Most active by traded value: {active[0]['symbol']} (about INR {tv:,.1f} crore).")
    if data_source == "SIMULATED":
        s.append("All figures are SIMULATED by QuantDesk's market model and are not real NSE/BSE prices.")
    return s


def market_overview(day: str | None = None) -> dict:
    if day:
        try:
            d = date.fromisoformat(day)
        except ValueError as exc:
            raise ValidationAppError("date must be YYYY-MM-DD", code="invalid_date") from exc
        if not is_trading_day(d):
            raise ValidationAppError(f"{d.isoformat()} is not an NSE trading day", code="not_trading_day")
        rows, as_of = _replay_quotes(d)
        if not rows:
            raise NotFoundError(f"No stored session data for {d.isoformat()}", code="no_data")
        indices = index_quotes(d)
    else:
        rows = [(s, get_quote(s)) for s in registry.all()]
        rows = [(s, q) for s, q in rows if q["price"]]
        as_of = datetime.now(timezone.utc)
        indices = index_quotes()
    quotes = [q for _, q in rows]
    sources = {q["data_source"] for q in quotes}
    data_source = "SIMULATED" if sources <= {"SIMULATED"} else ("HISTORICAL_DATASET" if sources == {"HISTORICAL_DATASET"} else "SIMULATED")
    adv = sum(1 for q in quotes if q["change_pct"] > 0)
    dec = sum(1 for q in quotes if q["change_pct"] < 0)
    breadth = {"advancers": adv, "decliners": dec, "unchanged": len(quotes) - adv - dec}
    by_sector: dict[str, list[dict]] = {}
    for s, q in rows:
        by_sector.setdefault(s.sector, []).append(q)
    sectors_perf = sorted([
        {"sector": k, "change_pct": round(float(np.mean([q["change_pct"] for q in v])), 4),
         "advancers": sum(1 for q in v if q["change_pct"] > 0), "decliners": sum(1 for q in v if q["change_pct"] < 0),
         "count": len(v)}
        for k, v in by_sector.items()
    ], key=lambda x: x["change_pct"], reverse=True)
    gainers = sorted([q for q in quotes if q["change_pct"] > 0], key=lambda q: q["change_pct"], reverse=True)[:5]
    losers = sorted([q for q in quotes if q["change_pct"] < 0], key=lambda q: q["change_pct"])[:5]
    active = sorted(quotes, key=lambda q: q["price"] * q["volume"], reverse=True)[:5]
    highest_vol = sorted(quotes, key=lambda q: q["volume"], reverse=True)[:5]
    return {
        "as_of": as_of.isoformat(), "data_source": data_source, "indices": indices, "breadth": breadth,
        "top_gainers": gainers, "top_losers": losers, "most_active": active, "highest_volume": highest_vol,
        "sectors": sectors_perf,
        "market_summary": market_summary_sentences(indices, breadth, sectors_perf, gainers, losers, active, data_source),
    }


def market_status(simulator_running: bool) -> dict:
    return {"session": session_state(), "simulator_running": simulator_running, "data_source": "SIMULATED",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "live_session_date": live_market.session_date}
