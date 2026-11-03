"""Built-in strategies, signal documents and the rule engine."""
import numpy as np
import pandas as pd
import pytest

from app.strategies.base import label_for
from app.strategies.builtin import BUILTIN_STRATEGIES
from app.strategies.rule_engine import evaluate_definition, validate_definition
from app.strategies.signals import build_signal

SIGNAL_KEYS = {"id", "symbol", "exchange", "strategy", "strategy_key", "timeframe", "timestamp", "data_source", "action",
               "price", "entry_conditions", "exit_conditions", "indicator_values", "conditions", "stop_loss",
               "take_profit", "risk_reward", "position_size", "strength", "historical_performance", "explanation",
               "disclaimer"}


def synthetic(n=400, seed=0):
    rng = np.random.default_rng(seed)
    t = 1700000000 + 86400 * np.arange(n)
    trend = np.concatenate([np.linspace(0, 0.4, n // 2), np.linspace(0.4, 0.1, n - n // 2)])
    c = 100 * np.exp(trend + np.cumsum(rng.normal(0, 0.015, n)))
    o = np.concatenate([[c[0]], c[:-1]]) * np.exp(rng.normal(0, 0.003, n))
    h = np.maximum(o, c) * (1 + np.abs(rng.normal(0, 0.006, n)))
    lo = np.minimum(o, c) * (1 - np.abs(rng.normal(0, 0.006, n)))
    v = rng.integers(10000, 100000, n) * (1 + 3 * (rng.random(n) < 0.1))
    return pd.DataFrame({"time": t, "open": o, "high": h, "low": lo, "close": c, "volume": v})


@pytest.mark.parametrize("key", list(BUILTIN_STRATEGIES))
def test_strategy_runs_and_is_causal(key):
    df = synthetic()
    strat = BUILTIN_STRATEGIES[key]
    out = strat.run(df)
    n = len(df)
    e, x = out.entries(n), out.exits(n)
    assert e.dtype == bool and x.dtype == bool and len(e) == n
    # truncating future bars must not change any past signal
    k = 300
    out2 = strat.run(df.iloc[:k].reset_index(drop=True))
    assert (out2.entries(k) == e[:k]).all()
    assert (out2.exits(k) == x[:k]).all()


@pytest.mark.parametrize("key", list(BUILTIN_STRATEGIES))
def test_signal_document_fields(key):
    df = synthetic(seed=5)
    strat = BUILTIN_STRATEGIES[key]
    out = strat.run(df)
    sig = build_signal(df=df, out=out, symbol="TEST", exchange="NSE", strategy_name=strat.name, strategy_key=key,
                       timeframe="1d", data_source="SIMULATED")
    assert SIGNAL_KEYS <= set(sig)
    assert sig["action"] in ("BUY", "SELL", "HOLD")
    n = len(df)
    expected = "BUY" if out.entries(n)[-1] else "SELL" if out.exits(n)[-1] else "HOLD"
    assert sig["action"] == expected  # action is exactly what the required conditions produce
    s = sig["strength"]
    assert 0 <= s["score"] <= 100 and s["label"] == label_for(s["score"]) and "Not a probability" in s["method"]
    assert abs(sum(c["weight"] for c in s["components"]) - 1) < 1e-3
    assert all({"description", "satisfied", "value"} <= set(c) for c in sig["conditions"])
    hp = sig["historical_performance"]
    assert hp is not None and "not a probability" in hp["note"].lower()
    assert "Not investment advice" in sig["disclaimer"]


def test_buy_signal_has_risk_plan():
    df = synthetic(seed=11)
    strat = BUILTIN_STRATEGIES["ma_crossover"]
    out = strat.run(df)
    idx = np.where(out.entries(len(df)))[0]
    assert len(idx) > 0
    sub = df.iloc[: idx[0] + 1].reset_index(drop=True)
    sig = build_signal(df=sub, out=strat.run(sub), symbol="T", exchange="NSE", strategy_name=strat.name,
                       strategy_key="ma_crossover", timeframe="1d", data_source="SIMULATED", capital=200000,
                       risk_per_trade_pct=1)
    assert sig["action"] == "BUY"
    assert sig["stop_loss"] < sig["price"] < sig["take_profit"]
    assert sig["risk_reward"] == pytest.approx(1.5, rel=1e-3)
    ps = sig["position_size"]
    assert ps["capital_at_risk"] <= 200000 * 0.01 + 1e-6
    assert ps["quantity"] == int(2000 // (sig["price"] - sig["stop_loss"]))


def test_invalid_builtin_params():
    with pytest.raises(ValueError):
        BUILTIN_STRATEGIES["rsi"].resolve({"period": 500})
    with pytest.raises(ValueError):
        BUILTIN_STRATEGIES["rsi"].resolve({"bogus": 1})


GOOD_DEF = {
    "entry": {"logic": "AND", "conditions": [
        {"left": {"type": "indicator", "indicator": "ema", "params": {"period": 10}}, "operator": "crosses_above",
         "right": {"type": "indicator", "indicator": "ema", "params": {"period": 30}}},
        {"left": {"type": "indicator", "indicator": "rsi", "params": {"period": 14}}, "operator": "<",
         "right": {"type": "constant", "value": 75}}]},
    "exit": {"logic": "OR", "conditions": [
        {"left": {"type": "price", "field": "close"}, "operator": "crosses_below",
         "right": {"type": "indicator", "indicator": "ema", "params": {"period": 30}}}]},
    "risk": {"stop_loss_pct": 5, "take_profit_pct": 10, "position_size_pct": 50},
    "timeframe": "1d",
}


def test_rule_engine_valid_definition_matches_manual_logic():
    from app.indicators import core

    defn, errs = validate_definition(GOOD_DEF)
    assert errs == [] and defn is not None
    df = synthetic(seed=2)
    out = evaluate_definition(defn, df)
    c = df["close"].to_numpy()
    manual = core.crosses_above(core.ema(c, 10), core.ema(c, 30)) & (np.nan_to_num(core.rsi(c, 14), nan=100) < 75)
    assert (out.entries(len(df)) == manual).all()
    assert (out.exits(len(df)) == core.crosses_below(c, core.ema(c, 30))).all()


@pytest.mark.parametrize("mutate,fragment", [
    (lambda d: d["entry"].update(conditions=[]), "at least one condition"),
    (lambda d: d["entry"]["conditions"][0]["left"].update(indicator="magic"), "unknown indicator"),
    (lambda d: d["entry"]["conditions"][0]["left"].update(params={"period": 9999}), "out of range"),
    (lambda d: d["entry"]["conditions"][0]["left"].update(params={"length": 5}), "Unknown parameter"),
    (lambda d: d["entry"]["conditions"][0]["left"].update(field="histogram"), "invalid field"),
    (lambda d: d["entry"]["conditions"][1].update(operator="=="), "operator"),
    (lambda d: d["exit"]["conditions"][0].update(left={"type": "constant", "value": 1},
                                                 right={"type": "constant", "value": 2}), "two constants"),
    (lambda d: d["risk"].update(position_size_pct=0), "position_size_pct"),
    (lambda d: d.update(timeframe="2d"), "timeframe"),
    (lambda d: d["exit"]["conditions"][0]["left"].update(field="vwap"), "field"),
])
def test_rule_engine_invalid_configs(mutate, fragment):
    import copy

    d = copy.deepcopy(GOOD_DEF)
    mutate(d)
    defn, errs = validate_definition(d)
    assert defn is None and errs
    assert any(fragment.lower() in e.lower() for e in errs), errs


def test_rule_engine_never_evaluates_code():
    d = {"entry": {"logic": "AND", "conditions": [
        {"left": {"type": "indicator", "indicator": "__import__('os').system('echo hi')"}, "operator": ">",
         "right": {"type": "constant", "value": 1}}]}, "exit": GOOD_DEF["exit"], "timeframe": "1d"}
    defn, errs = validate_definition(d)
    assert defn is None and "unknown indicator" in errs[0]


def test_supertrend_strategy_flips():
    # a decline (trend down), then a steady rally (flip up), then a sharp sell-off (flip down)
    c = np.concatenate([np.linspace(120, 100, 40), np.linspace(100, 140, 40), np.linspace(140, 105, 15)])
    n = len(c)
    df = pd.DataFrame({"time": 1700000000 + 86400 * np.arange(n), "open": c, "high": c * 1.005, "low": c * 0.995,
                       "close": c, "volume": np.full(n, 50000.0)})
    out = BUILTIN_STRATEGIES["supertrend"].run(df, {"adx_min": 0})
    e, x = out.entries(n), out.exits(n)
    assert e[40:80].any(), "rally should flip Supertrend up"
    assert x[80:].any(), "sell-off should flip Supertrend down"
    assert np.argmax(x[80:]) + 80 > np.argmax(e[40:80]) + 40
    # with the ADX filter on, an entry also needs ADX >= threshold on the same bar
    out_f = BUILTIN_STRATEGIES["supertrend"].run(df, {"adx_min": 50})
    adx = out_f.indicators["adx_14"]
    assert not (out_f.entries(n) & ~(np.nan_to_num(adx) >= 50)).any()


def test_supertrend_params_validated():
    with pytest.raises(ValueError):
        BUILTIN_STRATEGIES["supertrend"].resolve({"multiplier": 0.5})
