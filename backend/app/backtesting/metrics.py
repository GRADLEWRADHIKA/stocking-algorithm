"""Backtest performance metrics.

  * Per-bar returns r_t = E_t / E_{t-1} - 1 (equity marked at each bar's close).
  * Sharpe = mean(r) / std(r, ddof=1) * sqrt(bars_per_year), risk-free rate = 0.
  * Sortino = mean(r) / sqrt(mean(min(r, 0)^2)) * sqrt(bars_per_year).
  * Annualized return = (E_end/E_0)^(bars_per_year / bars) - 1, only when the period covers >= 30
    trading days (otherwise null — annualizing tiny samples is misleading).
  * Max drawdown = max over t of (1 - E_t / max_{s<=t} E_s), in percent.
  * Profit factor = gross profit / gross loss over closed trades (null when there are no losing trades).
  * Exposure = percent of bars with an open position.
  * Buy & hold = last close / first open - 1 (no costs).
"""
from __future__ import annotations

import math

import numpy as np

from app.backtesting.engine import BacktestOutput


def _r(x: float | None, nd: int = 4) -> float | None:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), nd)


def drawdown_series(equity: np.ndarray) -> np.ndarray:
    if len(equity) == 0:
        return equity
    peak = np.maximum.accumulate(equity)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(peak > 0, (equity / peak - 1.0) * 100.0, 0.0)
    return dd


def compute_metrics(out: BacktestOutput, first_open: float, last_close: float, bars_per_year: float,
                    trading_days: int) -> dict:
    eq = out.equity
    init = out.initial_capital
    final = float(eq[-1]) if len(eq) else init
    n = len(eq)
    rets = np.diff(np.concatenate([[init], eq])) / np.concatenate([[init], eq[:-1]]) if n else np.zeros(0)
    rets = np.nan_to_num(rets)
    sharpe = sortino = None
    if n >= 3 and np.std(rets, ddof=1) > 0:
        sharpe = float(np.mean(rets) / np.std(rets, ddof=1) * math.sqrt(bars_per_year))
        downside = math.sqrt(float(np.mean(np.minimum(rets, 0.0) ** 2)))
        sortino = float(np.mean(rets) / downside * math.sqrt(bars_per_year)) if downside > 0 else None
    total_ret = (final / init - 1.0) * 100.0 if init else 0.0
    ann = None
    if trading_days >= 30 and n > 0 and final > 0:
        ann = ((final / init) ** (bars_per_year / n) - 1.0) * 100.0
    dd = drawdown_series(eq)
    trades = out.trades
    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    gross_p = sum(t.pnl for t in wins)
    gross_l = -sum(t.pnl for t in losses)
    pf = gross_p / gross_l if gross_l > 0 else None
    bh = (last_close / first_open - 1.0) * 100.0 if first_open else 0.0
    return {
        "initial_capital": _r(init, 2), "final_capital": _r(final, 2), "net_profit": _r(final - init, 2),
        "total_return_pct": _r(total_ret), "annualized_return_pct": _r(ann), "buy_and_hold_return_pct": _r(bh),
        "num_trades": len(trades), "winning_trades": len(wins), "losing_trades": len(losses),
        "win_rate": _r(100.0 * len(wins) / len(trades)) if trades else None,
        "max_drawdown_pct": _r(abs(float(dd.min())) if len(dd) else 0.0) or 0.0,
        "sharpe_ratio": _r(sharpe), "sortino_ratio": _r(sortino), "profit_factor": _r(pf),
        "avg_win": _r(gross_p / len(wins), 2) if wins else None,
        "avg_loss": _r(-gross_l / len(losses), 2) if losses else None,
        "avg_trade_return_pct": _r(float(np.mean([t.pnl_pct for t in trades]))) if trades else None,
        "exposure_pct": _r(100.0 * float(out.in_position.mean()) if n else 0.0) or 0.0,
        "total_costs": _r(out.total_costs, 2) or 0.0,
    }
