"""The built-in long-only strategies. Every array is causal (bar t uses data <= t)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.indicators import core
from app.indicators.registry import compute as compute_indicator
from app.strategies.base import BuiltinStrategy, Cond, ParamDef, StrategyOutput, clip01

P = ParamDef


def _ohlcv(df: pd.DataFrame):
    return (df["close"].to_numpy(dtype=float), df["high"].to_numpy(dtype=float), df["low"].to_numpy(dtype=float),
            df["volume"].to_numpy(dtype=float))


def _pct(a, b) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return 100.0 * (np.asarray(a, dtype=float) / np.asarray(b, dtype=float) - 1.0)


def _gt(a, b) -> np.ndarray:
    with np.errstate(invalid="ignore"):
        return np.nan_to_num(np.asarray(a, dtype=float) > np.asarray(b, dtype=float), nan=0).astype(bool)


def _lt(a, b) -> np.ndarray:
    with np.errstate(invalid="ignore"):
        return np.nan_to_num(np.asarray(a, dtype=float) < np.asarray(b, dtype=float), nan=0).astype(bool)


def _event_margin(event: np.ndarray, gap: np.ndarray, scale: np.ndarray) -> np.ndarray:
    """1.0 on event bars, else proximity 1 - |gap|/scale (clipped) so near-setups score higher."""
    with np.errstate(divide="ignore", invalid="ignore"):
        prox = 1.0 - np.abs(np.asarray(gap, dtype=float)) / np.asarray(scale, dtype=float)
    return np.where(event, 1.0, clip01(prox) * 0.8)


def _volume_cond(v: np.ndarray, mult: float, required: bool, weight: float, period: int = 20) -> Cond:
    avg = core.sma(v, period)
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = v / avg
    return Cond(
        f"Volume >= {mult:g}x its {period}-bar average (volume confirmation)", _gt(ratio, mult - 1e-12), ratio,
        clip01((ratio - 1.0) / max(mult, 1.0)), weight, required, "{:.2f}x",
    )


# ---------------------------------------------------------------- 1. EMA crossover
def _ma_crossover(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    f, s = p["fast"], p["slow"]
    ef, es = core.ema(c, f), core.ema(c, s)
    spread = ef - es
    scale = 0.01 * c
    up, dn = core.crosses_above(ef, es), core.crosses_below(ef, es)
    buy = [
        Cond(f"EMA({f}) crossed above EMA({s}) on this bar", up, spread, _event_margin(up, spread, scale), 0.5),
        Cond(f"Close above EMA({s})", _gt(c, es), _pct(c, es), clip01(_pct(c, es) / 3.0), 0.25, False, "{:+.2f}%"),
        _volume_cond(v, 1.0, False, 0.25),
    ]
    sell = [
        Cond(f"EMA({f}) crossed below EMA({s}) on this bar", dn, spread, _event_margin(dn, spread, scale), 0.5),
        Cond(f"Close below EMA({s})", _lt(c, es), _pct(c, es), clip01(-_pct(c, es) / 3.0), 0.25, False, "{:+.2f}%"),
        _volume_cond(v, 1.0, False, 0.25),
    ]
    return StrategyOutput(
        buy, sell, {f"ema_{f}": ef, f"ema_{s}": es, "close": c},
        [f"EMA({f}) crosses above EMA({s})"], [f"EMA({f}) crosses below EMA({s})"], warmup_bars=s,
    )


# ---------------------------------------------------------------- 2. RSI with trend filter
def _rsi(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    n, os_, ob, tp = p["period"], p["oversold"], p["overbought"], p["trend_period"]
    use_filter = bool(p["trend_filter"])
    r = core.rsi(c, n)
    sm = core.sma(c, tp)
    up = core.crosses_above(r, np.full(len(r), os_))
    ob_cross = core.crosses_above(r, np.full(len(r), ob))
    trend_break = core.crosses_below(c, sm)
    buy = [
        Cond(f"RSI({n}) crossed back above {os_:g} (leaving oversold)", up, r, _event_margin(up, r - os_, np.full(len(r), 15.0)), 0.5),
        Cond(f"Trend filter: close above SMA({tp})", _gt(c, sm), _pct(c, sm), clip01(_pct(c, sm) / 5.0), 0.3,
             use_filter, "{:+.2f}%"),
        Cond(f"RSI({n}) rising", _gt(r, core.shift(r)), r - core.shift(r), clip01((r - core.shift(r)) / 5.0), 0.2,
             False, "{:+.2f}"),
    ]
    sell = [
        Cond(f"RSI({n}) crossed above {ob:g} (overbought: take profit)", ob_cross, r,
             _event_margin(ob_cross, r - ob, np.full(len(r), 15.0)), 0.5),
        Cond(f"Close crossed below SMA({tp}) (trend failure)", trend_break, _pct(c, sm),
             _event_margin(trend_break, _pct(c, sm), np.full(len(c), 3.0)), 0.5, use_filter, "{:+.2f}%"),
    ]
    return StrategyOutput(
        buy, sell, {f"rsi_{n}": r, f"sma_{tp}": sm, "close": c},
        [f"RSI({n}) crosses up through {os_:g}" + (f" while close > SMA({tp})" if use_filter else "")],
        [f"RSI({n}) crosses above {ob:g}"] + ([f"or close crosses below SMA({tp})"] if use_filter else []),
        warmup_bars=max(n + 1, tp if use_filter else 0),
    )


# ---------------------------------------------------------------- 3. MACD
def _macd(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    m = core.macd(c, p["fast"], p["slow"], p["signal"])
    line, sig, hist = m["macd"], m["signal"], m["histogram"]
    zf = bool(p["zero_filter"])
    up, dn = core.crosses_above(line, sig), core.crosses_below(line, sig)
    scale = 0.004 * c
    tag = f"MACD({p['fast']},{p['slow']},{p['signal']})"
    buy = [
        Cond(f"{tag} line crossed above signal line", up, hist, _event_margin(up, hist, scale), 0.5),
        Cond("MACD above zero line (bullish momentum regime)", _gt(line, 0), line, clip01(line / scale), 0.25, zf),
        Cond("Histogram expanding", _gt(hist, core.shift(hist)), hist - core.shift(hist),
             clip01((hist - core.shift(hist)) / (0.001 * c)), 0.25, False),
    ]
    sell = [
        Cond(f"{tag} line crossed below signal line", dn, hist, _event_margin(dn, hist, scale), 0.5),
        Cond("MACD below zero line", _lt(line, 0), line, clip01(-line / scale), 0.25, False),
        Cond("Histogram contracting", _lt(hist, core.shift(hist)), hist - core.shift(hist),
             clip01(-(hist - core.shift(hist)) / (0.001 * c)), 0.25, False),
    ]
    return StrategyOutput(
        buy, sell, {"macd": line, "macd_signal": sig, "macd_histogram": hist, "close": c},
        [f"{tag} crosses above signal" + (" with MACD > 0" if zf else "")], [f"{tag} crosses below signal"],
        warmup_bars=p["slow"] + p["signal"],
    )


# ---------------------------------------------------------------- 4. Bollinger mean reversion
def _bollinger(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    n, k = p["period"], p["std"]
    bb = core.bbands(c, n, k)
    up_b, mid, low_b = bb["upper"], bb["middle"], bb["lower"]
    width = up_b - low_b
    r = core.rsi(c, 14)
    prev_below = _lt(core.shift(c), core.shift(low_b))
    back_inside = _gt(c, low_b)
    mid_cross = core.crosses_above(c, mid)
    upper_reentry = _gt(core.shift(c), core.shift(up_b)) & _lt(c, up_b)
    with np.errstate(divide="ignore", invalid="ignore"):
        pct_b = (c - low_b) / width
    buy = [
        Cond(f"Previous close was below the lower band ({n}, {k:g})", prev_below, _pct(core.shift(c), core.shift(low_b)),
             np.where(prev_below, 1.0, 0.0), 0.3, True, "{:+.2f}%"),
        Cond("Close back inside the band (mean-reversion confirmation)", back_inside, pct_b,
             np.where(back_inside & prev_below, 1.0, clip01(pct_b * 4) * 0.5), 0.4, True, "%B {:.2f}"),
        Cond("RSI(14) below 40 (oversold context)", _lt(r, 40), r, clip01((40 - r) / 15.0), 0.3, False),
    ]
    sell = [
        Cond("Close crossed above the middle band (reversion target reached)", mid_cross, _pct(c, mid),
             _event_margin(mid_cross, _pct(c, mid), np.full(len(c), 2.0)), 0.5, True, "{:+.2f}%"),
        Cond("Close fell back inside from above the upper band", upper_reentry, _pct(c, up_b),
             np.where(upper_reentry, 1.0, 0.0), 0.5, True, "{:+.2f}%"),
    ]
    return StrategyOutput(
        buy, sell, {"bb_upper": up_b, "bb_middle": mid, "bb_lower": low_b, "rsi_14": r, "close": c},
        [f"Close was below lower Bollinger band ({n},{k:g}) and closes back inside"],
        ["Close crosses above middle band", "or close re-enters from above the upper band"], warmup_bars=n + 1,
    )


# ---------------------------------------------------------------- 5. VWAP
def _vwap(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    vw = compute_indicator("vwap", df, {"period": p["period"]})["value"]
    up, dn = core.crosses_above(c, vw), core.crosses_below(c, vw)
    gap = _pct(c, vw)
    rising = _gt(vw, core.shift(vw, 5))
    buy = [
        Cond("Close crossed above VWAP", up, gap, _event_margin(up, gap, np.full(len(c), 2.0)), 0.5, True, "{:+.2f}%"),
        _volume_cond(v, p["volume_mult"], True, 0.3),
        Cond("VWAP rising over 5 bars", rising, _pct(vw, core.shift(vw, 5)), clip01(_pct(vw, core.shift(vw, 5)) / 1.0),
             0.2, False, "{:+.2f}%"),
    ]
    sell = [
        Cond("Close crossed below VWAP", dn, gap, _event_margin(dn, gap, np.full(len(c), 2.0)), 0.6, True, "{:+.2f}%"),
        Cond("VWAP falling over 5 bars", ~rising, _pct(vw, core.shift(vw, 5)),
             clip01(-_pct(vw, core.shift(vw, 5)) / 1.0), 0.4, False, "{:+.2f}%"),
    ]
    return StrategyOutput(
        buy, sell, {"vwap": vw, "close": c},
        [f"Close crosses above VWAP with volume >= {p['volume_mult']:g}x average"], ["Close crosses below VWAP"],
        warmup_bars=p["period"],
    )


# ---------------------------------------------------------------- 6. Momentum (ROC)
def _momentum(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    n, thr = p["period"], p["threshold"]
    r = core.roc(c, n)
    e20 = core.ema(c, 20)
    up = core.crosses_above(r, np.full(len(r), thr))
    dn = core.crosses_below(r, np.zeros(len(r)))
    buy = [
        Cond(f"ROC({n}) crossed above +{thr:g}%", up, r, _event_margin(up, r - thr, np.full(len(r), max(thr, 1.0) * 2)),
             0.5, True, "{:+.2f}%"),
        _volume_cond(v, p["volume_mult"], True, 0.3),
        Cond("Close above EMA(20)", _gt(c, e20), _pct(c, e20), clip01(_pct(c, e20) / 3.0), 0.2, False, "{:+.2f}%"),
    ]
    sell = [
        Cond(f"ROC({n}) crossed below 0% (momentum lost)", dn, r, _event_margin(dn, r, np.full(len(r), 5.0)), 0.7, True,
             "{:+.2f}%"),
        Cond("Close below EMA(20)", _lt(c, e20), _pct(c, e20), clip01(-_pct(c, e20) / 3.0), 0.3, False, "{:+.2f}%"),
    ]
    return StrategyOutput(
        buy, sell, {f"roc_{n}": r, "ema_20": e20, "close": c},
        [f"ROC({n}) crosses above +{thr:g}% with volume >= {p['volume_mult']:g}x average"], [f"ROC({n}) crosses below 0%"],
        warmup_bars=max(n + 1, 20),
    )


# ---------------------------------------------------------------- 7. Breakout
def _breakout(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    lb, buf, xlb = p["lookback"], p["atr_buffer"], p["exit_lookback"]
    resistance = core.shift(core.rolling_max(h, lb))  # highest high of the prior N bars (excludes current)
    exit_level = core.shift(core.rolling_min(lo, xlb))
    a = core.atr(h, lo, c, 14)
    level = resistance + buf * a
    broke = _gt(c, level)
    fresh = broke & ~_gt(core.shift(c), core.shift(level))
    with np.errstate(divide="ignore", invalid="ignore"):
        close_pos = (c - lo) / (h - lo)
    strong_close = _gt(close_pos, 0.75 - 1e-12)
    chan_exit = _lt(c, exit_level)
    with np.errstate(divide="ignore", invalid="ignore"):
        gap_atr = (c - level) / a
    buy = [
        Cond(f"Close above {lb}-bar resistance + {buf:g} x ATR(14) (fresh, decisive breakout)", fresh, gap_atr,
             _event_margin(fresh, gap_atr, np.full(len(c), 2.0)), 0.45, True, "{:+.2f} ATR"),
        _volume_cond(v, p["volume_mult"], True, 0.35),
        Cond("Close in the upper 25% of the bar range (false-breakout filter)", strong_close, close_pos,
             clip01((close_pos - 0.5) * 2), 0.2, False, "{:.2f}"),
    ]
    sell = [
        Cond(f"Close below the prior {xlb}-bar low (channel exit)", chan_exit, _pct(c, exit_level),
             np.where(chan_exit, 1.0, clip01(1 - _pct(c, exit_level) / 5.0) * 0.8), 1.0, True, "{:+.2f}%"),
    ]
    return StrategyOutput(
        buy, sell, {"resistance": resistance, "breakout_level": level, "exit_level": exit_level, "atr_14": a, "close": c},
        [f"Close > {lb}-bar high + {buf:g}xATR on volume >= {p['volume_mult']:g}x average (first close above)"],
        [f"Close < prior {xlb}-bar low"], warmup_bars=max(lb, 14) + 1,
    )


# ---------------------------------------------------------------- 8. Trend following
def _trend_following(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    f, m, s = p["fast"], p["mid"], p["slow"]
    thr = p["adx_threshold"]
    ef, em, es = core.ema(c, f), core.ema(c, m), core.ema(c, s)
    ad = core.adx(h, lo, c, p["adx_period"])
    adx_v, pdi, mdi = ad["adx"], ad["plus_di"], ad["minus_di"]
    aligned = _gt(ef, em) & _gt(em, es)
    strong = _gt(adx_v, thr)
    di_ok = _gt(pdi, mdi)
    state = aligned & strong & di_ok
    prev_state = np.concatenate([[False], state[:-1]])
    fresh = state & ~prev_state
    x_mid = core.crosses_below(c, em)
    x_fast = core.crosses_below(ef, em)
    buy = [
        Cond(f"EMA alignment: EMA({f}) > EMA({m}) > EMA({s})", aligned, _pct(ef, es), clip01(_pct(ef, es) / 8.0), 0.3,
             True, "{:+.2f}%"),
        Cond(f"ADX({p['adx_period']}) above {thr:g} (trending)", strong, adx_v, clip01((adx_v - thr) / 20.0), 0.3),
        Cond("+DI above -DI (directional confirmation)", di_ok, pdi - mdi, clip01((pdi - mdi) / 20.0), 0.2),
        Cond("Trend setup newly confirmed on this bar", fresh, np.where(fresh, 1.0, 0.0), np.where(fresh, 1.0, 0.0),
             0.2, True, "{:.0f}"),
    ]
    sell = [
        Cond(f"Close crossed below EMA({m})", x_mid, _pct(c, em), _event_margin(x_mid, _pct(c, em), np.full(len(c), 3.0)),
             0.5, True, "{:+.2f}%"),
        Cond(f"EMA({f}) crossed below EMA({m})", x_fast, _pct(ef, em),
             _event_margin(x_fast, _pct(ef, em), np.full(len(c), 3.0)), 0.5, True, "{:+.2f}%"),
    ]
    return StrategyOutput(
        buy, sell, {f"ema_{f}": ef, f"ema_{m}": em, f"ema_{s}": es, "adx": adx_v, "plus_di": pdi, "minus_di": mdi,
                    "close": c},
        [f"EMA({f}) > EMA({m}) > EMA({s}), ADX > {thr:g}, +DI > -DI (first bar of setup)"],
        [f"Close crosses below EMA({m})", f"or EMA({f}) crosses below EMA({m})"], warmup_bars=max(s, 2 * p["adx_period"]),
    )


# ---------------------------------------------------------------- 9. Supertrend
def _supertrend(df: pd.DataFrame, p: dict) -> StrategyOutput:
    c, h, lo, v = _ohlcv(df)
    n, k, adx_min = p["period"], p["multiplier"], p["adx_min"]
    st = core.supertrend(h, lo, c, n, k)
    line, d = st["value"], st["direction"]
    prev_d = core.shift(d)
    flip_up = np.nan_to_num((d > 0) & (prev_d < 0), nan=0).astype(bool)
    flip_dn = np.nan_to_num((d < 0) & (prev_d > 0), nan=0).astype(bool)
    ad = core.adx(h, lo, c, 14)["adx"]
    a = core.atr(h, lo, c, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        cushion = (c - line) / a  # distance from the trailing line in ATRs (signed)
    tag = f"Supertrend({n}, {k:g})"
    uptrend = _gt(d, 0)
    adx_ok = _gt(ad, adx_min - 1e-12) if adx_min > 0 else np.ones(len(c), dtype=bool)
    # Enter on the first bar where the uptrend AND the trend-strength filter both hold: the flip itself when ADX
    # already agrees, otherwise the later bar where ADX rises through the threshold while Supertrend is still up.
    setup = uptrend & adx_ok
    fresh = setup & ~np.concatenate([[False], setup[:-1]])
    buy = [
        Cond(f"{tag} direction is up (close above the trailing line)", uptrend, cushion,
             np.where(uptrend, 1.0, _event_margin(flip_up, cushion, np.full(len(c), 2.0 * k))), 0.3, True, "{:+.2f} ATR"),
        Cond(f"ADX(14) at or above {adx_min:g} (filters choppy, trendless markets)", adx_ok, ad,
             clip01((ad - adx_min) / 20.0) if adx_min > 0 else clip01(ad / 40.0), 0.25, adx_min > 0, "{:.1f}"),
        Cond("Setup newly confirmed on this bar (Supertrend flip, or ADX reaching the threshold in an uptrend)", fresh,
             np.where(fresh, 1.0, 0.0), np.where(fresh, 1.0, 0.0), 0.25, True, "{:.0f}"),
        _volume_cond(v, 1.0, False, 0.1),
        Cond("Close at least 0.5 ATR above the Supertrend line (room to the trailing stop)", _gt(cushion, 0.5), cushion,
             clip01(cushion / (2.0 * k)), 0.1, False, "{:+.2f} ATR"),
    ]
    sell = [
        Cond(f"{tag} flipped to a downtrend on this bar (close below the trailing line)", flip_dn, cushion,
             _event_margin(flip_dn, cushion, np.full(len(c), 2.0 * k)), 0.7, True, "{:+.2f} ATR"),
        Cond("ADX(14) still above 20 (the downturn has trend strength)", _gt(ad, 20), ad, clip01((ad - 20) / 20.0), 0.3,
             False, "{:.1f}"),
    ]
    return StrategyOutput(
        buy, sell, {"supertrend": line, "supertrend_direction": d, "adx_14": ad, f"atr_{n}": a, "close": c},
        [f"{tag} is up" + (f" and ADX(14) >= {adx_min:g}" if adx_min > 0 else "") + " (first bar both hold)"],
        [f"{tag} flips from up to down (the line is the trailing stop)"],
        warmup_bars=max(n, 28) + 1,
    )


BUILTIN_STRATEGIES: dict[str, BuiltinStrategy] = {s.key: s for s in [
    BuiltinStrategy("ma_crossover", "EMA Crossover",
                    "Buys when the fast EMA crosses above the slow EMA; exits on the opposite cross.",
                    [P("fast", "Fast EMA", "int", 20, 2, 100), P("slow", "Slow EMA", "int", 50, 5, 300)], _ma_crossover),
    BuiltinStrategy("rsi", "RSI Reversal with Trend Filter",
                    "Buys when RSI recovers from oversold while price is above its long-term SMA; exits when RSI "
                    "becomes overbought or price loses the trend SMA.",
                    [P("period", "RSI period", "int", 14, 2, 50), P("oversold", "Oversold", "float", 30, 5, 50),
                     P("overbought", "Overbought", "float", 70, 50, 95),
                     P("trend_period", "Trend SMA period", "int", 200, 20, 300),
                     P("trend_filter", "Use trend filter (1/0)", "int", 1, 0, 1)], _rsi),
    BuiltinStrategy("macd", "MACD Signal Cross",
                    "Buys when the MACD line crosses above its signal line (optionally only above zero); exits on "
                    "the bearish cross.",
                    [P("fast", "Fast EMA", "int", 12, 2, 50), P("slow", "Slow EMA", "int", 26, 5, 100),
                     P("signal", "Signal EMA", "int", 9, 2, 30), P("zero_filter", "Require MACD > 0 (1/0)", "int", 0, 0, 1)],
                    _macd),
    BuiltinStrategy("bollinger", "Bollinger Band Mean Reversion",
                    "Buys when price closes back inside the lower band after closing below it; exits at the middle "
                    "band or after a failed push above the upper band.",
                    [P("period", "Period", "int", 20, 5, 100), P("std", "Std dev", "float", 2.0, 1.0, 4.0)], _bollinger),
    BuiltinStrategy("vwap", "VWAP Reclaim",
                    "Buys when price crosses above VWAP on above-average volume; exits on a cross below VWAP.",
                    [P("period", "Rolling VWAP bars (daily+)", "int", 20, 5, 100),
                     P("volume_mult", "Volume multiple", "float", 1.2, 1.0, 5.0)], _vwap),
    BuiltinStrategy("momentum", "Momentum (ROC)",
                    "Buys when the rate of change crosses above a threshold on above-average volume; exits when "
                    "momentum turns negative.",
                    [P("period", "ROC period", "int", 10, 2, 100), P("threshold", "ROC threshold %", "float", 5.0, 0.5, 30.0),
                     P("volume_mult", "Volume multiple", "float", 1.2, 1.0, 5.0)], _momentum),
    BuiltinStrategy("breakout", "N-Bar Breakout",
                    "Buys on the first decisive close above the prior N-bar high (+ATR buffer) with volume "
                    "confirmation; exits below the prior M-bar low.",
                    [P("lookback", "Breakout lookback", "int", 20, 5, 250), P("volume_mult", "Volume multiple", "float", 1.5, 1.0, 5.0),
                     P("atr_buffer", "ATR buffer", "float", 0.25, 0.0, 2.0), P("exit_lookback", "Exit lookback", "int", 10, 3, 100)],
                    _breakout),
    BuiltinStrategy("trend_following", "EMA Alignment + ADX Trend Following",
                    "Buys when EMAs are stacked bullishly and ADX confirms a strong trend with +DI > -DI; exits on "
                    "loss of the mid EMA.",
                    [P("fast", "Fast EMA", "int", 20, 5, 100), P("mid", "Mid EMA", "int", 50, 10, 200),
                     P("slow", "Slow EMA", "int", 200, 20, 400), P("adx_period", "ADX period", "int", 14, 5, 50),
                     P("adx_threshold", "ADX threshold", "float", 25, 10, 60)], _trend_following),
    BuiltinStrategy("supertrend", "Supertrend Trend Rider",
                    "Buys when the ATR-based Supertrend flips up while ADX shows a trending market; holds while the "
                    "trailing Supertrend line is respected and exits when it flips down.",
                    [P("period", "ATR period", "int", 10, 2, 50), P("multiplier", "ATR multiplier", "float", 3.0, 1.0, 6.0),
                     P("adx_min", "Minimum ADX (0 = off)", "float", 20, 0, 50)], _supertrend),
]}


def get_builtin(key: str) -> BuiltinStrategy:
    if key not in BUILTIN_STRATEGIES:
        raise KeyError(key)
    return BUILTIN_STRATEGIES[key]
