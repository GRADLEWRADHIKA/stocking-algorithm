"""Event-driven, long-only bar backtester.

Execution model (no look-ahead):
  * Signals are evaluated on the CLOSE of bar t and executed at the OPEN of bar t+1.
  * Slippage is applied adversely: buys fill at open*(1+bps/1e4), sells at price*(1-bps/1e4).
  * Costs per order = min(brokerage_pct% * value, brokerage_flat) + transaction_cost_pct% * value.
  * Position size = position_size_pct% of current equity, integer share quantity (floor), bounded by cash.
  * Stop-loss / take-profit are checked intrabar on every bar after entry (including the entry bar,
    after the open) using that bar's high/low. If both are touched in the same bar the stop is assumed
    to fill first (conservative). If the bar opens beyond a level (gap), the fill is at the open.
  * Any open position is closed at the last bar's close (END_OF_DATA).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class BacktestConfig:
    initial_capital: float = 100000.0
    position_size_pct: float = 100.0
    brokerage_pct: float = 0.03
    brokerage_flat: float = 20.0
    transaction_cost_pct: float = 0.1
    slippage_bps: float = 5.0
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None


@dataclass
class Trade:
    entry_index: int
    exit_index: int
    entry_time: int
    exit_time: int
    entry_price: float
    exit_price: float
    quantity: int
    pnl: float
    pnl_pct: float
    costs: float
    bars_held: int
    exit_reason: str

    def to_dict(self) -> dict:
        return {
            "entry_time": self.entry_time, "exit_time": self.exit_time, "side": "LONG",
            "entry_price": round(self.entry_price, 4), "exit_price": round(self.exit_price, 4),
            "quantity": self.quantity, "pnl": round(self.pnl, 2), "pnl_pct": round(self.pnl_pct, 4),
            "costs": round(self.costs, 2), "bars_held": self.bars_held, "exit_reason": self.exit_reason,
        }


@dataclass
class BacktestOutput:
    times: np.ndarray
    equity: np.ndarray
    in_position: np.ndarray
    trades: list[Trade] = field(default_factory=list)
    total_costs: float = 0.0
    initial_capital: float = 0.0


def order_costs(value: float, cfg: BacktestConfig) -> float:
    brokerage = min(cfg.brokerage_pct / 100.0 * value, cfg.brokerage_flat)
    return brokerage + cfg.transaction_cost_pct / 100.0 * value


def run_backtest(df: pd.DataFrame, entries: np.ndarray, exits: np.ndarray, cfg: BacktestConfig) -> BacktestOutput:
    n = len(df)
    t = df["time"].to_numpy(dtype=np.int64)
    o = df["open"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    lo = df["low"].to_numpy(dtype=float)
    c = df["close"].to_numpy(dtype=float)
    entries = np.asarray(entries, dtype=bool)
    exits = np.asarray(exits, dtype=bool)
    slip = cfg.slippage_bps / 10000.0

    cash = float(cfg.initial_capital)
    qty = 0
    entry_px = entry_cost = 0.0
    entry_i = -1
    stop = tp = None
    pending: str | None = None
    equity = np.zeros(n)
    in_pos = np.zeros(n, dtype=bool)
    trades: list[Trade] = []
    total_costs = 0.0

    def close_position(i: int, raw_price: float, reason: str) -> None:
        nonlocal cash, qty, total_costs, stop, tp
        px = raw_price * (1 - slip)
        value = px * qty
        cost = order_costs(value, cfg)
        cash += value - cost
        total_costs += cost
        invested = entry_px * qty + entry_cost
        pnl = value - cost - invested
        trades.append(Trade(
            entry_index=entry_i, exit_index=i, entry_time=int(t[entry_i]), exit_time=int(t[i]), entry_price=entry_px,
            exit_price=px, quantity=qty, pnl=pnl, pnl_pct=100.0 * pnl / invested if invested else 0.0,
            costs=entry_cost + cost, bars_held=i - entry_i, exit_reason=reason,
        ))
        qty = 0
        stop = tp = None

    for i in range(n):
        # 1) execute the order generated at the previous bar's close, at this bar's open
        if pending == "BUY" and qty == 0:
            px = o[i] * (1 + slip)
            equity_now = cash
            budget = min(equity_now * cfg.position_size_pct / 100.0, cash)
            unit_cost = px * (1 + cfg.transaction_cost_pct / 100.0 + cfg.brokerage_pct / 100.0)
            q = int(math.floor(budget / unit_cost)) if unit_cost > 0 else 0
            while q > 0 and q * px + order_costs(q * px, cfg) > cash + 1e-9:
                q -= 1
            if q > 0:
                cost = order_costs(q * px, cfg)
                cash -= q * px + cost
                total_costs += cost
                qty, entry_px, entry_cost, entry_i = q, px, cost, i
                stop = px * (1 - cfg.stop_loss_pct / 100.0) if cfg.stop_loss_pct else None
                tp = px * (1 + cfg.take_profit_pct / 100.0) if cfg.take_profit_pct else None
        elif pending == "SELL" and qty > 0:
            close_position(i, o[i], "SIGNAL")
        pending = None

        # 2) intrabar stop-loss / take-profit (stop assumed first when both touched)
        if qty > 0:
            gap_check = i > entry_i  # on the entry bar the open IS the entry price
            if stop is not None and gap_check and o[i] <= stop:
                close_position(i, o[i], "STOP_LOSS")
            elif tp is not None and gap_check and o[i] >= tp:
                close_position(i, o[i], "TAKE_PROFIT")
            elif stop is not None and lo[i] <= stop:
                close_position(i, stop, "STOP_LOSS")
            elif tp is not None and h[i] >= tp:
                close_position(i, tp, "TAKE_PROFIT")

        # 3) mark to market at the close
        equity[i] = cash + qty * c[i]
        in_pos[i] = qty > 0

        # 4) evaluate signals at this bar's close for execution at the next open
        if i < n - 1:
            if qty == 0 and entries[i]:
                pending = "BUY"
            elif qty > 0 and exits[i]:
                pending = "SELL"

    if qty > 0 and n > 0:
        close_position(n - 1, c[n - 1], "END_OF_DATA")
        equity[n - 1] = cash
    return BacktestOutput(times=t, equity=equity, in_position=in_pos, trades=trades, total_costs=total_costs,
                          initial_capital=float(cfg.initial_capital))
