"""Backtest engine: no look-ahead, next-open execution, costs/slippage, SL/TP, metrics and API."""
import numpy as np
import pandas as pd
import pytest

from app.backtesting.engine import BacktestConfig, order_costs, run_backtest
from app.backtesting.metrics import compute_metrics
from app.strategies.builtin import BUILTIN_STRATEGIES
from tests.test_strategies import synthetic


def frame(opens, highs, lows, closes):
    n = len(opens)
    return pd.DataFrame({"time": 1700000000 + 86400 * np.arange(n), "open": opens, "high": highs, "low": lows,
                         "close": closes, "volume": [1000] * n})


NO_COST = dict(brokerage_pct=0, brokerage_flat=0, transaction_cost_pct=0, slippage_bps=0)


def test_executes_at_next_open():
    df = frame([10, 11, 12, 13, 14], [10.5, 11.5, 12.5, 13.5, 14.5], [9.5, 10.5, 11.5, 12.5, 13.5], [10, 11, 12, 13, 14])
    entries = np.array([True, False, False, False, False])
    exits = np.array([False, False, True, False, False])
    out = run_backtest(df, entries, exits, BacktestConfig(initial_capital=1100, **NO_COST))
    t = out.trades[0]
    assert t.entry_index == 1 and t.entry_price == 11  # signal at bar 0 close -> bar 1 open
    assert t.exit_index == 3 and t.exit_price == 13 and t.exit_reason == "SIGNAL"
    assert t.quantity == 100 and t.pnl == pytest.approx(200)


def test_costs_and_slippage_applied():
    df = frame([100] * 4, [100] * 4, [100] * 4, [100] * 4)
    cfg = BacktestConfig(initial_capital=100000, brokerage_pct=0.03, brokerage_flat=20, transaction_cost_pct=0.1,
                         slippage_bps=10)
    out = run_backtest(df, np.array([True, False, False, False]), np.array([False, True, False, False]), cfg)
    t = out.trades[0]
    assert t.entry_price == pytest.approx(100.1) and t.exit_price == pytest.approx(99.9)
    assert t.pnl < 0  # flat prices lose exactly costs + slippage
    expected_costs = order_costs(t.quantity * 100.1, cfg) + order_costs(t.quantity * 99.9, cfg)
    assert t.costs == pytest.approx(expected_costs)
    assert out.equity[-1] == pytest.approx(100000 + t.pnl)
    assert order_costs(1_000_000, cfg) == pytest.approx(20 + 1000)  # brokerage capped at flat 20


def test_stop_loss_first_when_both_hit_and_gap_fill():
    # bar 2 touches both SL (95) and TP (110): stop assumed first
    df = frame([100, 100, 100, 100], [100, 101, 111, 100], [100, 99, 94, 100], [100, 100, 100, 100])
    cfg = BacktestConfig(initial_capital=10000, stop_loss_pct=5, take_profit_pct=10, **NO_COST)
    out = run_backtest(df, np.array([True, False, False, False]), np.zeros(4, bool), cfg)
    assert out.trades[0].exit_reason == "STOP_LOSS" and out.trades[0].exit_price == pytest.approx(95)
    # gap below the stop fills at the open
    df2 = frame([100, 100, 90, 90], [100, 101, 91, 91], [100, 99, 89, 89], [100, 100, 90, 90])
    out2 = run_backtest(df2, np.array([True, False, False, False]), np.zeros(4, bool), cfg)
    assert out2.trades[0].exit_price == pytest.approx(90) and out2.trades[0].exit_reason == "STOP_LOSS"
    # take profit
    df3 = frame([100, 100, 105, 100], [100, 101, 112, 100], [100, 99, 104, 100], [100, 100, 108, 100])
    out3 = run_backtest(df3, np.array([True, False, False, False]), np.zeros(4, bool), cfg)
    assert out3.trades[0].exit_reason == "TAKE_PROFIT" and out3.trades[0].exit_price == pytest.approx(110)


def test_end_of_data_close():
    df = frame([10, 11, 12], [10, 11, 12], [10, 11, 12], [10, 11, 12])
    out = run_backtest(df, np.array([True, False, False]), np.zeros(3, bool), BacktestConfig(initial_capital=100, **NO_COST))
    assert out.trades[-1].exit_reason == "END_OF_DATA" and out.trades[-1].exit_price == 12


@pytest.mark.parametrize("key", ["ma_crossover", "breakout", "macd"])
def test_no_look_ahead_future_changes_do_not_alter_past_trades(key):
    df = synthetic(n=500, seed=3)
    strat = BUILTIN_STRATEGIES[key]
    cfg = BacktestConfig(stop_loss_pct=4, take_profit_pct=8)
    o1 = strat.run(df)
    r1 = run_backtest(df, o1.entries(len(df)), o1.exits(len(df)), cfg)
    assert len(r1.trades) >= 2
    k = r1.trades[len(r1.trades) // 2].exit_index + 1  # cut in the middle of the trade history
    df2 = df.copy()
    rng = np.random.default_rng(99)
    for col in ("open", "high", "low", "close"):
        df2.loc[k:, col] = df2.loc[k:, col] * rng.uniform(0.5, 1.5)
    df2["high"] = df2[["open", "high", "low", "close"]].max(axis=1)
    df2["low"] = df2[["open", "high", "low", "close"]].min(axis=1)
    o2 = strat.run(df2)
    r2 = run_backtest(df2, o2.entries(len(df2)), o2.exits(len(df2)), cfg)
    past1 = [t.to_dict() for t in r1.trades if t.exit_index < k]
    past2 = [t.to_dict() for t in r2.trades if t.exit_index < k]
    assert past1 == past2 and len(past1) > 0
    np.testing.assert_allclose(r1.equity[:k], r2.equity[:k])


def test_metrics_definitions():
    df = frame([100, 100, 110, 121], [100, 100, 110, 121], [100, 100, 110, 121], [100, 100, 110, 121])
    out = run_backtest(df, np.array([True, False, False, False]), np.zeros(4, bool),
                       BacktestConfig(initial_capital=1000, **NO_COST))
    m = compute_metrics(out, 100, 121, 252, 4)
    assert m["total_return_pct"] == pytest.approx(21.0)
    assert m["annualized_return_pct"] is None  # < 30 trading days
    assert m["buy_and_hold_return_pct"] == pytest.approx(21.0)
    assert m["num_trades"] == 1 and m["win_rate"] == 100.0 and m["profit_factor"] is None
    assert m["max_drawdown_pct"] == 0.0
    assert m["exposure_pct"] == pytest.approx(75.0)


def test_backtest_api_persist_and_oos(client, auth):
    body = {"symbol": "RELIANCE", "strategy": {"type": "builtin", "key": "ma_crossover", "params": {"fast": 10, "slow": 30}},
            "timeframe": "1d", "start": None, "end": None, "initial_capital": 100000, "position_size_pct": 100,
            "brokerage_pct": 0.03, "brokerage_flat": 20, "transaction_cost_pct": 0.1, "slippage_bps": 5,
            "stop_loss_pct": 5, "take_profit_pct": None, "out_of_sample_pct": 30}
    r = client.post("/api/backtests", json=body, headers=auth)
    assert r.status_code == 201, r.text
    res = r.json()
    for k in ("id", "created_at", "symbol", "strategy_name", "config", "data_source", "bars", "period", "metrics",
              "in_sample", "out_of_sample", "equity_curve", "drawdown_curve", "trades", "assumptions"):
        assert k in res
    assert res["in_sample"] and res["out_of_sample"] and res["data_source"] == "SIMULATED"
    assert len(res["equity_curve"]) == res["bars"] and {"time", "equity", "benchmark"} <= set(res["equity_curve"][0])
    got = client.get(f"/api/backtests/{res['id']}", headers=auth).json()
    assert got["metrics"] == res["metrics"] and len(got["trades"]) == len(res["trades"])
    lst = client.get("/api/backtests", headers=auth).json()
    assert lst[0]["id"] == res["id"] and set(lst[0]) == {"id", "created_at", "symbol", "strategy_name", "timeframe",
                                                         "total_return_pct", "num_trades", "max_drawdown_pct", "sharpe_ratio"}
    assert client.post("/api/backtests", json=body).status_code == 401
    cmp = client.post("/api/backtests/compare", headers=auth, json={"base": {k: v for k, v in body.items() if k != "strategy"},
                      "strategies": [{"type": "builtin", "key": "rsi"}, {"type": "builtin", "key": "momentum"}]})
    assert cmp.status_code == 200 and [c["strategy_name"] for c in cmp.json()] == ["RSI Reversal with Trend Filter", "Momentum (ROC)"]
    bad = client.post("/api/backtests", json={**body, "strategy": {"type": "builtin", "key": "nope"}}, headers=auth)
    assert bad.status_code == 400 and bad.json()["code"] == "unknown_strategy"
    intraday = client.post("/api/backtests", json={**body, "timeframe": "5m", "out_of_sample_pct": 0}, headers=auth)
    assert intraday.status_code == 201 and intraday.json()["metrics"]["annualized_return_pct"] is None
