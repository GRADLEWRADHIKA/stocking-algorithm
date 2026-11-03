"""Backtest orchestration: strategy resolution, date filtering, in/out-of-sample split, persistence."""
from __future__ import annotations

from datetime import date, datetime, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.backtesting.engine import BacktestConfig, run_backtest
from app.backtesting.metrics import compute_metrics, drawdown_series
from app.core.errors import InsufficientDataError, NotFoundError, ValidationAppError
from app.market_data.calendar import IST
from app.market_data.provider import market_data
from app.market_data.resample import INTRADAY_MINUTES, bars_per_year
from app.models import BacktestRun, BacktestTrade, Strategy
from app.schemas.backtest import BacktestRequest, BuiltinRef, DefinitionRef, SavedRef
from app.strategies.base import StrategyOutput
from app.strategies.builtin import BUILTIN_STRATEGIES
from app.strategies.rule_engine import evaluate_definition, validate_definition

MIN_BARS = 30


def resolve_strategy(ref, db: Session | None, user_id: int | None) -> tuple[str, callable, dict]:
    """Return (name, fn(df)->StrategyOutput, risk_defaults)."""
    if isinstance(ref, BuiltinRef):
        strat = BUILTIN_STRATEGIES.get(ref.key)
        if strat is None:
            raise ValidationAppError(f"Unknown built-in strategy '{ref.key}'", code="unknown_strategy")
        try:
            params = strat.resolve(ref.params)
        except ValueError as exc:
            raise ValidationAppError(str(exc), code="invalid_params") from exc
        return strat.name, (lambda df: strat.builder(df, params)), {}
    if isinstance(ref, SavedRef):
        if db is None:
            raise ValidationAppError("Saved strategies require a database session")
        s = db.get(Strategy, ref.strategy_id)
        if s is None or (user_id is not None and s.user_id != user_id):
            raise NotFoundError(f"Strategy {ref.strategy_id} not found")
        defn, errs = validate_definition(s.definition)
        if errs:
            raise ValidationAppError("Saved strategy definition is invalid", code="invalid_definition", errors=errs)
        return s.name, (lambda df: evaluate_definition(defn, df)), defn.risk.model_dump()
    if isinstance(ref, DefinitionRef):
        defn, errs = validate_definition(ref.definition)
        if errs:
            raise ValidationAppError("Invalid strategy definition", code="invalid_definition", errors=errs)
        return "Custom strategy", (lambda df: evaluate_definition(defn, df)), defn.risk.model_dump()
    raise ValidationAppError("Unsupported strategy reference")


def _parse_day(s: str | None, field: str) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError as exc:
        raise ValidationAppError(f"{field} must be YYYY-MM-DD", code="invalid_date") from exc


def _bars_per_session(df: pd.DataFrame, timeframe: str) -> float | None:
    if timeframe not in INTRADAY_MINUTES or df.empty:
        return None
    days = (df["time"].to_numpy() + 19800) // 86400
    _, counts = np.unique(days, return_counts=True)
    return float(np.median(counts))


def _trading_days(df: pd.DataFrame) -> int:
    if df.empty:
        return 0
    return int(len(np.unique((df["time"].to_numpy() + 19800) // 86400))) if len(df) else 0


def _segment(df: pd.DataFrame, entries, exits, cfg: BacktestConfig, timeframe: str, lo: int, hi: int):
    seg = df.iloc[lo:hi].reset_index(drop=True)
    out = run_backtest(seg, entries[lo:hi], exits[lo:hi], cfg)
    bpy = bars_per_year(timeframe, _bars_per_session(df, timeframe))
    m = compute_metrics(out, float(seg["open"].iloc[0]), float(seg["close"].iloc[-1]), bpy, _trading_days(seg))
    return seg, out, m


def _assumptions(req: BacktestRequest, timeframe: str, bpy: float, risk_from_def: dict) -> list[str]:
    a = [
        "Long-only; signals are evaluated on each bar's close and executed at the next bar's open (no look-ahead).",
        "Indicators are computed causally on the full stored history before the test window (warm-up uses prior data only).",
        f"Slippage {req.slippage_bps:g} bps applied adversely on every fill.",
        f"Costs per order: min({req.brokerage_pct:g}% x value, INR {req.brokerage_flat:g}) brokerage + "
        f"{req.transaction_cost_pct:g}% transaction costs (STT/exchange/GST approximation).",
        f"Position size {req.position_size_pct:g}% of current equity, whole shares only; no leverage, no shorting.",
        "Stop-loss / take-profit are checked intrabar with high/low; if both are hit in one bar the stop is assumed first; "
        "gaps through a level fill at the open.",
        f"Sharpe/Sortino use per-bar returns annualized with sqrt({bpy:g}) bars/year and a 0% risk-free rate.",
        "Annualized return is reported only when the test spans at least 30 trading days.",
        "Open positions are closed at the final bar's close (END_OF_DATA).",
        "Buy & hold benchmark = first bar open to last bar close, without costs.",
    ]
    if req.out_of_sample_pct > 0:
        a.append(f"Out-of-sample: the last {req.out_of_sample_pct:g}% of bars are also simulated separately with fresh "
                 "capital; parameters are not optimized on either segment.")
    if risk_from_def.get("stop_loss_pct") or risk_from_def.get("take_profit_pct"):
        a.append("Stop-loss/take-profit defaults taken from the strategy definition's risk settings where the request "
                 "did not provide them.")
    return a


def run_backtest_request(req: BacktestRequest, db: Session, user_id: int | None, persist: bool = True,
                         name_override: str | None = None) -> dict:
    stock = market_data.stock(req.symbol)
    if stock.is_index:
        raise ValidationAppError("Backtests run on stocks, not indices", code="invalid_symbol")
    name, fn, risk = resolve_strategy(req.strategy, db, user_id)
    if name_override:
        name = name_override
    full = market_data.candles(stock, req.timeframe)
    if len(full) < MIN_BARS:
        raise InsufficientDataError(f"Only {len(full)} {req.timeframe} bars available for {stock.symbol}; need >= {MIN_BARS}")
    out_full: StrategyOutput = fn(full)
    entries, exits = out_full.entries(len(full)), out_full.exits(len(full))

    start_d, end_d = _parse_day(req.start, "start"), _parse_day(req.end, "end")
    t = full["time"].to_numpy()
    days = np.array([datetime.fromtimestamp(int(x), tz=IST).date() for x in t])
    mask = np.ones(len(full), dtype=bool)
    if start_d:
        mask &= days >= start_d
    if end_d:
        mask &= days <= end_d
    idx = np.where(mask)[0]
    if len(idx) < MIN_BARS:
        raise InsufficientDataError(f"Selected period contains {len(idx)} bars; need at least {MIN_BARS}")
    lo, hi = int(idx[0]), int(idx[-1]) + 1

    sl = req.stop_loss_pct if req.stop_loss_pct is not None else risk.get("stop_loss_pct")
    tp = req.take_profit_pct if req.take_profit_pct is not None else risk.get("take_profit_pct")
    cfg = BacktestConfig(req.initial_capital, req.position_size_pct, req.brokerage_pct, req.brokerage_flat,
                         req.transaction_cost_pct, req.slippage_bps, sl, tp)
    seg, out, metrics = _segment(full, entries, exits, cfg, req.timeframe, lo, hi)
    bpy = bars_per_year(req.timeframe, _bars_per_session(full, req.timeframe))

    in_m = oos_m = None
    if req.out_of_sample_pct > 0:
        split = lo + int((hi - lo) * (1 - req.out_of_sample_pct / 100.0))
        if split - lo >= 10 and hi - split >= 10:
            _, _, in_m = _segment(full, entries, exits, cfg, req.timeframe, lo, split)
            _, _, oos_m = _segment(full, entries, exits, cfg, req.timeframe, split, hi)

    first_open = float(seg["open"].iloc[0])
    closes = seg["close"].to_numpy(dtype=float)
    bench = req.initial_capital * closes / first_open
    times = seg["time"].to_numpy()
    dd = drawdown_series(out.equity)
    equity_curve = [{"time": int(times[i]), "equity": round(float(out.equity[i]), 2), "benchmark": round(float(bench[i]), 2)}
                    for i in range(len(seg))]
    dd_curve = [{"time": int(times[i]), "drawdown_pct": round(float(dd[i]), 4)} for i in range(len(seg))]
    trades = [tr.to_dict() for tr in out.trades]
    config = req.model_dump()
    period = {"start": datetime.fromtimestamp(int(times[0]), tz=timezone.utc).isoformat(),
              "end": datetime.fromtimestamp(int(times[-1]), tz=timezone.utc).isoformat()}
    result = {
        "id": 0, "created_at": datetime.now(timezone.utc).isoformat(), "symbol": stock.symbol, "strategy_name": name,
        "config": config, "data_source": stock.data_source, "bars": len(seg), "period": period, "metrics": metrics,
        "in_sample": in_m, "out_of_sample": oos_m, "equity_curve": equity_curve, "drawdown_curve": dd_curve,
        "trades": trades, "assumptions": _assumptions(req, req.timeframe, bpy, risk),
    }
    if persist:
        run = BacktestRun(
            user_id=user_id, stock_id=stock.id, strategy_name=name, timeframe=req.timeframe, config=config,
            data_source=stock.data_source, bars=len(seg),
            period_start=datetime.fromtimestamp(int(times[0]), tz=timezone.utc),
            period_end=datetime.fromtimestamp(int(times[-1]), tz=timezone.utc), metrics=metrics, in_sample=in_m,
            out_of_sample=oos_m, equity_curve=equity_curve, drawdown_curve=dd_curve, assumptions=result["assumptions"],
            total_return_pct=metrics["total_return_pct"], max_drawdown_pct=metrics["max_drawdown_pct"],
            sharpe_ratio=metrics["sharpe_ratio"], num_trades=metrics["num_trades"],
        )
        for tr in trades:
            run.trades.append(BacktestTrade(**{k: v for k, v in tr.items()}))
        db.add(run)
        db.commit()
        result["id"] = run.id
        result["created_at"] = run.created_at.isoformat()
    return result


def run_to_result(run: BacktestRun) -> dict:
    return {
        "id": run.id, "created_at": run.created_at.isoformat(), "symbol": run.stock.symbol,
        "strategy_name": run.strategy_name, "config": run.config, "data_source": run.data_source, "bars": run.bars,
        "period": {"start": run.period_start.isoformat(), "end": run.period_end.isoformat()},
        "metrics": run.metrics, "in_sample": run.in_sample, "out_of_sample": run.out_of_sample,
        "equity_curve": run.equity_curve, "drawdown_curve": run.drawdown_curve,
        "trades": [
            {"entry_time": t.entry_time, "exit_time": t.exit_time, "side": t.side, "entry_price": float(t.entry_price),
             "exit_price": float(t.exit_price), "quantity": t.quantity, "pnl": float(t.pnl), "pnl_pct": t.pnl_pct,
             "costs": float(t.costs), "bars_held": t.bars_held, "exit_reason": t.exit_reason}
            for t in run.trades
        ],
        "assumptions": run.assumptions,
    }


def run_summary(run: BacktestRun) -> dict:
    return {
        "id": run.id, "created_at": run.created_at.isoformat(), "symbol": run.stock.symbol,
        "strategy_name": run.strategy_name, "timeframe": run.timeframe, "total_return_pct": run.total_return_pct,
        "num_trades": run.num_trades, "max_drawdown_pct": run.max_drawdown_pct, "sharpe_ratio": run.sharpe_ratio,
    }


def list_runs(db: Session, user_id: int | None, limit: int = 20) -> list[BacktestRun]:
    q = select(BacktestRun).order_by(BacktestRun.created_at.desc(), BacktestRun.id.desc()).limit(limit)
    if user_id is not None:
        q = q.where(BacktestRun.user_id == user_id)
    return list(db.execute(q).unique().scalars().all())
