"""Indicator registry: catalog metadata (IndicatorMeta), parameter validation and computation by key."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from app.indicators import core


@dataclass(frozen=True)
class ParamSpec:
    name: str
    label: str
    default: float
    min: float
    max: float
    step: float = 1
    integer: bool = True


@dataclass(frozen=True)
class IndicatorDef:
    key: str
    name: str
    pane: str
    params: list[ParamSpec]
    fields: list[str]
    description: str
    short: str = ""
    extra: dict = field(default_factory=dict)


P = ParamSpec
CATALOG: dict[str, IndicatorDef] = {d.key: d for d in [
    IndicatorDef("sma", "Simple Moving Average", "overlay", [P("period", "Period", 20, 2, 400)], ["value"],
                 "Arithmetic mean of the last N closes.", "SMA"),
    IndicatorDef("ema", "Exponential Moving Average", "overlay", [P("period", "Period", 20, 2, 400)], ["value"],
                 "Exponentially weighted mean of closes, alpha = 2/(N+1), seeded with the SMA of the first N closes.", "EMA"),
    IndicatorDef("rsi", "Relative Strength Index", "separate", [P("period", "Period", 14, 2, 100)], ["value"],
                 "Wilder's RSI (0-100) comparing average gains to average losses over N bars.", "RSI"),
    IndicatorDef("macd", "MACD", "separate",
                 [P("fast", "Fast", 12, 2, 100), P("slow", "Slow", 26, 3, 200), P("signal", "Signal", 9, 2, 50)],
                 ["macd", "signal", "histogram"],
                 "Difference of fast and slow EMAs, with an EMA signal line and histogram.", "MACD"),
    IndicatorDef("bbands", "Bollinger Bands", "overlay",
                 [P("period", "Period", 20, 2, 200), P("std", "Std dev", 2, 0.5, 5, 0.1, False)],
                 ["upper", "middle", "lower"],
                 "SMA middle band with upper/lower bands at +/- k population standard deviations.", "BB"),
    IndicatorDef("vwap", "Volume Weighted Average Price", "overlay", [P("period", "Rolling bars (daily+)", 20, 2, 200)],
                 ["value"],
                 "Intraday: session-anchored VWAP reset each session. Daily and higher: rolling N-bar VWAP of typical price.",
                 "VWAP"),
    IndicatorDef("atr", "Average True Range", "separate", [P("period", "Period", 14, 2, 100)], ["value"],
                 "Wilder-smoothed average of the true range; a volatility measure in price units.", "ATR"),
    IndicatorDef("adx", "Average Directional Index", "separate", [P("period", "Period", 14, 2, 100)],
                 ["adx", "plus_di", "minus_di"],
                 "Wilder's ADX (trend strength) with +DI/-DI (direction).", "ADX"),
    IndicatorDef("stoch", "Stochastic Oscillator", "separate", [P("k", "%K period", 14, 2, 100), P("d", "%D period", 3, 1, 20)],
                 ["k", "d"], "Position of the close within the N-bar high/low range (%K) and its SMA (%D).", "Stoch"),
    IndicatorDef("obv", "On-Balance Volume", "separate", [], ["value"],
                 "Cumulative volume added on up-closes and subtracted on down-closes.", "OBV"),
    IndicatorDef("volume_sma", "Volume SMA", "separate", [P("period", "Period", 20, 2, 200)], ["value"],
                 "Simple moving average of volume.", "Vol SMA"),
    IndicatorDef("roc", "Rate of Change", "separate", [P("period", "Period", 10, 1, 200)], ["value"],
                 "Percent change of close versus N bars ago.", "ROC"),
    IndicatorDef("hv", "Historical Volatility", "separate", [P("period", "Period", 20, 5, 200)], ["value"],
                 "Annualized standard deviation of log returns over N bars, in percent.", "HV"),
    IndicatorDef("supertrend", "Supertrend", "overlay",
                 [P("period", "ATR period", 10, 2, 100), P("multiplier", "Multiplier", 3, 0.5, 10, 0.1, False)],
                 ["value", "direction"],
                 "ATR bands around (H+L)/2 that trail price; the line is support in an uptrend and resistance in a "
                 "downtrend. Direction is +1 (up) or -1 (down).", "ST"),
]}


class IndicatorError(ValueError):
    pass


def _fmt_num(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else f"{v:g}"


def resolve_params(key: str, params: dict[str, float] | None) -> dict[str, float]:
    if key not in CATALOG:
        raise IndicatorError(f"Unknown indicator '{key}'")
    d = CATALOG[key]
    params = dict(params or {})
    known = {p.name for p in d.params}
    unknown = set(params) - known
    if unknown:
        raise IndicatorError(f"Unknown parameter(s) for {key}: {', '.join(sorted(unknown))}")
    out: dict[str, float] = {}
    for p in d.params:
        v = params.get(p.name, p.default)
        try:
            v = float(v)
        except (TypeError, ValueError) as exc:
            raise IndicatorError(f"Parameter {key}.{p.name} must be a number") from exc
        if not np.isfinite(v) or v < p.min or v > p.max:
            raise IndicatorError(f"Parameter {key}.{p.name}={_fmt_num(v)} out of range [{_fmt_num(p.min)}, {_fmt_num(p.max)}]")
        if p.integer and not float(v).is_integer():
            raise IndicatorError(f"Parameter {key}.{p.name} must be an integer")
        out[p.name] = int(v) if p.integer else v
    if key == "macd" and out["fast"] >= out["slow"]:
        raise IndicatorError("MACD fast period must be smaller than slow period")
    return out


def indicator_id(key: str, params: dict[str, float]) -> str:
    vals = [_fmt_num(params[p.name]) for p in CATALOG[key].params]
    return "_".join([key, *vals]) if vals else key


def display_name(key: str, params: dict[str, float]) -> str:
    vals = [_fmt_num(params[p.name]) for p in CATALOG[key].params]
    short = CATALOG[key].short or key.upper()
    return f"{short}({', '.join(vals)})" if vals else short


def parse_specs(specs: str) -> list[tuple[str, dict[str, float]]]:
    """Parse 'sma:20,macd:12:26:9,vwap' into [(key, params)]. Positional params follow catalog order."""
    out = []
    for raw in specs.split(","):
        raw = raw.strip()
        if not raw:
            continue
        parts = raw.split(":")
        key = parts[0].strip().lower()
        if key not in CATALOG:
            raise IndicatorError(f"Unknown indicator '{key}'")
        pdefs = CATALOG[key].params
        if len(parts) - 1 > len(pdefs):
            raise IndicatorError(f"Too many parameters for {key}")
        params: dict[str, float] = {}
        for pd_, val in zip(pdefs, parts[1:]):
            try:
                params[pd_.name] = float(val)
            except ValueError as exc:
                raise IndicatorError(f"Invalid parameter '{val}' for {key}") from exc
        out.append((key, resolve_params(key, params)))
    return out


def is_intraday_frame(df: pd.DataFrame) -> bool:
    if len(df) < 2:
        return False
    return int(np.median(np.diff(df["time"].to_numpy()[-50:]))) < 86400


def compute(key: str, df: pd.DataFrame, params: dict[str, float] | None = None,
            bars_per_year: float = 252.0) -> dict[str, np.ndarray]:
    """Compute indicator outputs (dict field -> array aligned with df rows)."""
    p = resolve_params(key, params)
    c = df["close"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    lo = df["low"].to_numpy(dtype=float)
    v = df["volume"].to_numpy(dtype=float)
    if key == "sma":
        return {"value": core.sma(c, p["period"])}
    if key == "ema":
        return {"value": core.ema(c, p["period"])}
    if key == "rsi":
        return {"value": core.rsi(c, p["period"])}
    if key == "macd":
        return core.macd(c, p["fast"], p["slow"], p["signal"])
    if key == "bbands":
        return core.bbands(c, p["period"], p["std"])
    if key == "vwap":
        if is_intraday_frame(df):
            return {"value": core.vwap_session(df["time"].to_numpy(), h, lo, c, v)}
        return {"value": core.vwap_rolling(h, lo, c, v, p["period"])}
    if key == "atr":
        return {"value": core.atr(h, lo, c, p["period"])}
    if key == "adx":
        return core.adx(h, lo, c, p["period"])
    if key == "stoch":
        return core.stochastic(h, lo, c, p["k"], p["d"])
    if key == "obv":
        return {"value": core.obv(c, v)}
    if key == "volume_sma":
        return {"value": core.sma(v, p["period"])}
    if key == "roc":
        return {"value": core.roc(c, p["period"])}
    if key == "hv":
        return {"value": core.historical_volatility(c, p["period"], bars_per_year)}
    if key == "supertrend":
        return core.supertrend(h, lo, c, p["period"], p["multiplier"])
    raise IndicatorError(f"Unknown indicator '{key}'")  # pragma: no cover


def catalog_payload() -> list[dict]:
    return [
        {
            "key": d.key, "name": d.name, "pane": d.pane,
            "params": [{"name": p.name, "label": p.label, "default": p.default, "min": p.min, "max": p.max,
                        "step": p.step} for p in d.params],
            "fields": d.fields, "description": d.description,
        }
        for d in CATALOG.values()
    ]
