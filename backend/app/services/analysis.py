"""Indicator series, stock analysis (trend/momentum/volatility/volume/levels/regime) and signals."""
from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.algorithms import trend as trend_alg
from app.algorithms.levels import support_resistance
from app.core.errors import InsufficientDataError, ValidationAppError
from app.indicators import core
from app.indicators.registry import CATALOG, IndicatorError, compute, display_name, indicator_id, parse_specs
from app.market_data.provider import filter_range, market_data
from app.market_data.resample import INTRADAY_MINUTES, bars_per_year
from app.models import TechnicalIndicator, TradingSignal
from app.repositories.stocks import StockInfo, registry
from app.strategies.builtin import BUILTIN_STRATEGIES
from app.strategies.signals import builtin_signal, iso_from_ts

DEFAULT_SPECS = "sma:20,ema:50,rsi:14,macd:12:26:9,bbands:20:2"


def _n(x, nd=4):
    if x is None:
        return None
    f = float(x)
    return None if math.isnan(f) or math.isinf(f) else round(f, nd)


def _bpy(tf: str) -> float:
    return bars_per_year(tf, None)


def indicator_series(symbol: str, timeframe: str, specs: str | None, limit: int = 500) -> dict:
    stock = market_data.stock(symbol)
    df = market_data.candles(stock, timeframe)
    try:
        parsed = parse_specs(specs or DEFAULT_SPECS)
    except IndicatorError as exc:
        raise ValidationAppError(str(exc), code="invalid_indicator") from exc
    times = df["time"].to_numpy()
    start = max(0, len(df) - limit) if limit else 0
    out = []
    for key, params in parsed:
        vals = compute(key, df, params, _bpy(timeframe))
        lines = {}
        for fld, arr in vals.items():
            arr = np.asarray(arr, dtype=float)
            lines[fld] = [{"time": int(times[i]), "value": round(float(arr[i]), 4)}
                          for i in range(start, len(arr)) if not np.isnan(arr[i])]
        out.append({"id": indicator_id(key, params), "indicator": key, "name": display_name(key, params),
                    "pane": CATALOG[key].pane, "params": params, "lines": lines})
    return {"symbol": stock.symbol, "timeframe": timeframe, "data_source": stock.data_source, "indicators": out}


# ------------------------------------------------------------------ signals
def generate_signal(symbol: str, strategy_key: str, timeframe: str = "1d", params: dict | None = None,
                    capital: float | None = None, risk_per_trade_pct: float | None = None,
                    include_history: bool = True) -> dict:
    stock = market_data.stock(symbol)
    strat = BUILTIN_STRATEGIES.get(strategy_key)
    if strat is None:
        raise ValidationAppError(f"Unknown strategy '{strategy_key}'", code="unknown_strategy")
    df = market_data.candles(stock, timeframe)
    if len(df) < 2:
        raise InsufficientDataError(f"Not enough {timeframe} bars for {stock.symbol}")
    try:
        return builtin_signal(strat, df, params, symbol=stock.symbol, exchange=stock.exchange, timeframe=timeframe,
                              data_source=stock.data_source, capital=capital, risk_per_trade_pct=risk_per_trade_pct,
                              include_history=include_history)
    except ValueError as exc:
        raise ValidationAppError(str(exc), code="invalid_params") from exc


def persist_signal(db: Session, stock: StockInfo, sig: dict) -> TradingSignal:
    bar_ts = int(datetime.fromisoformat(sig["timestamp"]).timestamp())
    existing = db.execute(select(TradingSignal).where(
        TradingSignal.stock_id == stock.id, TradingSignal.strategy_key == sig["strategy_key"],
        TradingSignal.timeframe == sig["timeframe"], TradingSignal.bar_ts == bar_ts,
    )).unique().scalar_one_or_none()
    if existing:
        existing.payload = {**sig, "id": existing.id}
        existing.action = sig["action"]
        existing.strength_score = sig["strength"]["score"]
        return existing
    row = TradingSignal(stock_id=stock.id, strategy_key=sig["strategy_key"], timeframe=sig["timeframe"], bar_ts=bar_ts,
                        action=sig["action"], price=sig["price"], strength_score=sig["strength"]["score"],
                        data_source=sig["data_source"], payload=sig)
    db.add(row)
    db.flush()
    row.payload = {**sig, "id": row.id}
    return row


def scan(db: Session, strategy_key: str | None = None, timeframe: str = "1d") -> list[dict]:
    keys = [strategy_key] if strategy_key else list(BUILTIN_STRATEGIES)
    for k in keys:
        if k not in BUILTIN_STRATEGIES:
            raise ValidationAppError(f"Unknown strategy '{k}'", code="unknown_strategy")
    results = []
    for stock in registry.all():
        if timeframe not in market_data.available_timeframes(stock):
            continue
        df = market_data.candles(stock, timeframe)
        if len(df) < 30:
            continue
        for k in keys:
            sig = builtin_signal(BUILTIN_STRATEGIES[k], df, None, symbol=stock.symbol, exchange=stock.exchange,
                                 timeframe=timeframe, data_source=stock.data_source)
            if sig["action"] != "HOLD":
                row = persist_signal(db, stock, sig)
                sig["id"] = row.id
                results.append(sig)
        _store_snapshot(db, stock, df, timeframe)
    db.commit()
    return results


def _store_snapshot(db: Session, stock: StockInfo, df, timeframe: str) -> None:
    c, h, lo = df["close"].to_numpy(float), df["high"].to_numpy(float), df["low"].to_numpy(float)
    m = core.macd(c)
    vals = {"rsi_14": _n(core.rsi(c, 14)[-1]), "ema_20": _n(core.ema(c, 20)[-1]), "ema_50": _n(core.ema(c, 50)[-1]),
            "sma_200": _n(core.sma(c, 200)[-1]), "macd": _n(m["macd"][-1]), "macd_signal": _n(m["signal"][-1]),
            "atr_14": _n(core.atr(h, lo, c, 14)[-1]), "adx_14": _n(core.adx(h, lo, c, 14)["adx"][-1])}
    row = db.execute(select(TechnicalIndicator).where(TechnicalIndicator.stock_id == stock.id,
                                                      TechnicalIndicator.timeframe == timeframe)).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(TechnicalIndicator(stock_id=stock.id, timeframe=timeframe, ts=int(df["time"].iloc[-1]), values=vals,
                                  computed_at=now))
    else:
        row.ts, row.values, row.computed_at = int(df["time"].iloc[-1]), vals, now


def recent_signals(db: Session, symbol: str | None = None, strategy_key: str | None = None, action: str | None = None,
                   limit: int = 50) -> list[dict]:
    q = select(TradingSignal).order_by(TradingSignal.created_at.desc(), TradingSignal.id.desc()).limit(min(limit, 500))
    if symbol:
        st = registry.get(symbol)
        if st is None:
            return []
        q = q.where(TradingSignal.stock_id == st.id)
    if strategy_key:
        q = q.where(TradingSignal.strategy_key == strategy_key)
    if action:
        q = q.where(TradingSignal.action == action.upper())
    return [{**r.payload, "id": r.id} for r in db.execute(q).unique().scalars().all()]


# ------------------------------------------------------------------ analysis
def analyze(symbol: str, timeframe: str = "1d", include_history: bool = True) -> dict:
    stock = market_data.stock(symbol)
    df = market_data.candles(stock, timeframe)
    if len(df) < 20:
        raise InsufficientDataError(f"Need at least 20 {timeframe} bars to analyse {stock.symbol}; have {len(df)}")
    c, h, lo, v = (df[k].to_numpy(float) for k in ("close", "high", "low", "volume"))
    price = float(c[-1])
    e20, e50, s200 = core.ema(c, 20), core.ema(c, 50), core.sma(c, 200)
    adx_d = core.adx(h, lo, c, 14)
    adx_v = _n(adx_d["adx"][-1], 2)
    slope = trend_alg.slope_pct(e20, 5)
    direction = trend_alg.trend_direction(price, _n(e20[-1]), _n(e50[-1]), slope)
    strength = trend_alg.trend_strength(adx_v, slope)
    r = core.rsi(c, 14)
    roc10 = core.roc(c, 10)
    m = core.macd(c)
    st = core.stochastic(h, lo, c, 14, 3)
    atr = core.atr(h, lo, c, 14)
    hv = core.historical_volatility(c, 20, _bpy(timeframe))
    bb = core.bbands(c, 20, 2)
    obv = core.obv(c, v)
    vavg = core.sma(v, 20)

    rsi_v = _n(r[-1], 2)
    if rsi_v is None:
        mom_state = "INSUFFICIENT_DATA"
    elif rsi_v >= 70:
        mom_state = "OVERBOUGHT"
    elif rsi_v <= 30:
        mom_state = "OVERSOLD"
    elif rsi_v >= 55 and (_n(m["histogram"][-1]) or 0) > 0:
        mom_state = "BULLISH"
    elif rsi_v <= 45 and (_n(m["histogram"][-1]) or 0) < 0:
        mom_state = "BEARISH"
    else:
        mom_state = "NEUTRAL"
    atr_v = _n(atr[-1])
    bbw = _n(100 * (bb["upper"][-1] - bb["lower"][-1]) / bb["middle"][-1]) if not np.isnan(bb["middle"][-1]) else None
    vol_state = trend_alg.volatility_state(hv)
    avg20 = float(vavg[-1]) if not np.isnan(vavg[-1]) else float(np.mean(v[-20:]))
    obv_slope = trend_alg.slope_pct(obv - obv.min() + 1.0, 10)
    obv_trend = "FLAT" if obv_slope is None or abs(obv_slope) < 0.5 else ("RISING" if obv_slope > 0 else "FALLING")
    levels = support_resistance(h, lo, c, atr_v)
    regime_label, regime_desc = trend_alg.classify_regime(direction, adx_v, hv)

    observations = [
        f"Close {price:.2f}; EMA20 {_fmt(e20[-1])}, EMA50 {_fmt(e50[-1])}, SMA200 {_fmt(s200[-1])}.",
        f"EMA20 5-bar slope {_fmt(slope)}%; ADX(14) {_fmt(adx_v)} (+DI {_fmt(adx_d['plus_di'][-1])}, -DI {_fmt(adx_d['minus_di'][-1])}).",
        f"RSI(14) {_fmt(rsi_v)}; MACD {_fmt(m['macd'][-1])} vs signal {_fmt(m['signal'][-1])} (histogram {_fmt(m['histogram'][-1])}).",
        f"ATR(14) {_fmt(atr_v)} ({_fmt(100 * atr_v / price if atr_v else None)}% of price); 20-bar historical volatility {_fmt(hv[-1])}%.",
        f"Latest volume {int(v[-1]):,} is {v[-1] / avg20:.2f}x the 20-bar average." if avg20 else "Volume average unavailable.",
    ]
    if levels["supports"]:
        observations.append(f"Nearest support(s): {', '.join(f'{x:.2f}' for x in levels['supports'])}.")
    if levels["resistances"]:
        observations.append(f"Nearest resistance(s): {', '.join(f'{x:.2f}' for x in levels['resistances'])}.")
    if np.isnan(s200[-1]):
        observations.append(f"Only {len(c)} bars available: SMA200 is not yet defined on this timeframe.")

    interpretations = _interpret(direction, strength, rsi_v, m, vol_state, regime_label, v[-1] / avg20 if avg20 else None)
    signals = []
    for strat in BUILTIN_STRATEGIES.values():
        signals.append(builtin_signal(strat, df, None, symbol=stock.symbol, exchange=stock.exchange,
                                      timeframe=timeframe, data_source=stock.data_source, include_history=include_history))
    return {
        "symbol": stock.symbol, "timeframe": timeframe, "data_source": stock.data_source,
        "as_of": iso_from_ts(int(df["time"].iloc[-1])), "price": round(price, 4),
        "trend": {"direction": direction, "strength": strength, "adx": adx_v, "ema_20": _n(e20[-1]), "ema_50": _n(e50[-1]),
                  "sma_200": _n(s200[-1]), "slope_20_pct": _n(slope)},
        "momentum": {"rsi": rsi_v, "roc_10": _n(roc10[-1]), "macd": _n(m["macd"][-1]), "macd_signal": _n(m["signal"][-1]),
                     "macd_histogram": _n(m["histogram"][-1]), "stoch_k": _n(st["k"][-1]), "stoch_d": _n(st["d"][-1]),
                     "state": mom_state},
        "volatility": {"atr": atr_v, "atr_pct": _n(100 * atr_v / price) if atr_v else None, "hist_vol_20": _n(hv[-1]),
                       "bb_width_pct": bbw, "state": vol_state},
        "volume": {"latest": int(v[-1]), "avg_20": round(avg20, 2), "ratio": round(float(v[-1] / avg20), 4) if avg20 else 0.0,
                   "obv_trend": obv_trend},
        "levels": levels,
        "regime": {"label": regime_label, "description": regime_desc},
        "observations": observations, "interpretations": interpretations, "signals": signals,
    }


def _fmt(x) -> str:
    if x is None:
        return "n/a"
    f = float(x)
    return "n/a" if math.isnan(f) else f"{f:,.2f}"


def _interpret(direction, strength, rsi_v, m, vol_state, regime, vol_ratio) -> list[str]:
    out = []
    if direction == "UPTREND":
        out.append(f"Price structure is consistent with a {strength.lower()} uptrend (short EMA above medium EMA, rising slope). "
                   "Trend-following rules historically work best in such phases, but trends can reverse without warning.")
    elif direction == "DOWNTREND":
        out.append(f"Price structure is consistent with a {strength.lower()} downtrend. Long-only strategies typically stay "
                   "flat or use tighter risk control in such phases.")
    else:
        out.append("No clear directional structure; mean-reversion style rules are more commonly applied in ranges.")
    if rsi_v is not None:
        if rsi_v >= 70:
            out.append("RSI above 70 is conventionally read as overbought: momentum is strong, but the move is stretched.")
        elif rsi_v <= 30:
            out.append("RSI below 30 is conventionally read as oversold: selling pressure has been heavy; it is not by itself a reversal signal.")
        else:
            out.append("RSI is in its neutral zone (30-70), so it is not signalling an extreme.")
    hist = m["histogram"][-1]
    if not np.isnan(hist):
        out.append("A positive MACD histogram means the MACD line is above its signal line (short-term momentum improving)."
                   if hist > 0 else "A negative MACD histogram means the MACD line is below its signal line (short-term momentum weakening).")
    if vol_state == "HIGH":
        out.append("Volatility is high relative to its own recent history; position sizes based on ATR shrink accordingly.")
    elif vol_state == "LOW":
        out.append("Volatility is low relative to its recent history; low-volatility phases are often followed by expansion.")
    if vol_ratio is not None and vol_ratio >= 1.5:
        out.append("Volume is well above average, which suggests stronger participation behind the latest move.")
    out.append(f"Regime classification: {regime.replace('_', ' ').lower()} (rule-based, see regime description).")
    return out


def timeframe_ok(tf: str) -> bool:
    return tf in INTRADAY_MINUTES or tf in ("1d", "1w", "1M")


def filter_candles(symbol: str, timeframe: str, start: int | None, end: int | None, limit: int) -> tuple:
    stock = market_data.stock(symbol)
    df = market_data.candles(stock, timeframe)
    return stock, filter_range(df, start, end, limit)
