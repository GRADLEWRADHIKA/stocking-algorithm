"""Portfolio analytics for paper accounts: allocations, reconstructed equity history, stats, risk, CSV report."""
from __future__ import annotations

import csv
import io
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.market_data.calendar import IST, daily_bar_ts, session_close_dt, trading_days
from app.market_data.live import live_market
from app.market_data.provider import market_data
from app.models import PaperAccount, PaperOrder, Transaction
from app.paper_trading.engine import account_dict, open_positions, position_dict, tx_dict
from app.repositories.stocks import registry

RISK_LOOKBACK = 60


def _closes_map(stock_id: int) -> dict[int, float]:
    st = registry.by_id(stock_id)
    if st is None:
        return {}
    d = market_data.daily_closes(st)
    return dict(zip(d["time"].astype(int).tolist(), d["close"].astype(float).tolist()))


def equity_history(db: Session, acc: PaperAccount) -> list[dict]:
    txs = db.execute(select(Transaction).where(Transaction.account_id == acc.id)
                     .order_by(Transaction.created_at, Transaction.id)).unique().scalars().all()
    if not txs:
        return []
    start = min(acc.created_at, txs[0].created_at).astimezone(IST).date()
    live_day = date.fromisoformat(live_market.session_date) if live_market.session_date else None
    end = live_day or datetime.now(IST).date()
    days = trading_days(start, end)
    if not days:
        return []
    closes: dict[int, dict[int, float]] = {}
    out = []
    ti = 0
    cash = 0.0
    qty: dict[int, int] = defaultdict(int)
    last_px: dict[int, float] = {}
    for d in days:
        cutoff = session_close_dt(d)
        while ti < len(txs) and txs[ti].created_at <= cutoff:
            t = txs[ti]
            cash = float(t.balance_after)
            if t.type == "BUY" and t.stock_id:
                qty[t.stock_id] += int(t.quantity or 0)
                last_px.setdefault(t.stock_id, float(t.price or 0))
            elif t.type == "SELL" and t.stock_id:
                qty[t.stock_id] -= int(t.quantity or 0)
            ti += 1
        hv = 0.0
        is_live = live_day is not None and d == live_day
        for sid, q in qty.items():
            if q <= 0:
                continue
            px = None
            if is_live:
                st = registry.by_id(sid)
                px = live_market.price(st.symbol) if st else None
            if px is None:
                if sid not in closes:
                    closes[sid] = _closes_map(sid)
                px = closes[sid].get(daily_bar_ts(d))
            if px is None:
                px = last_px.get(sid, 0.0)
            last_px[sid] = px
            hv += q * px
        out.append({"time": daily_bar_ts(d), "equity": round(cash + hv, 2)})
    return out


def _stats(db: Session, acc: PaperAccount) -> dict:
    sells = db.execute(select(PaperOrder).where(PaperOrder.account_id == acc.id, PaperOrder.side == "SELL",
                                                PaperOrder.status == "FILLED")).unique().scalars().all()
    pnls = [float(o.realized_pnl) for o in sells if o.realized_pnl is not None]
    holds = [o.holding_seconds / 86400 for o in sells if o.holding_seconds is not None]
    wins = [p for p in pnls if p > 0]
    return {
        "total_trades": len(pnls), "winning_trades": len(wins), "losing_trades": len(pnls) - len(wins),
        "win_rate": round(100 * len(wins) / len(pnls), 2) if pnls else None,
        "best_trade": round(max(pnls), 2) if pnls else None, "worst_trade": round(min(pnls), 2) if pnls else None,
        "avg_holding_days": round(float(np.mean(holds)), 2) if holds else None,
    }


def _risk(positions: list[dict], acc_d: dict) -> dict:
    equity = acc_d["equity"] or 0.0
    hv = sum(p["market_value"] for p in positions)
    by_sector: dict[str, float] = defaultdict(float)
    for p in positions:
        by_sector[p["sector"]] += p["market_value"]
    risk = {
        "largest_position_pct": round(100 * max((p["market_value"] for p in positions), default=0) / equity, 4) if equity else 0.0,
        "top_sector_pct": round(100 * max(by_sector.values(), default=0) / equity, 4) if equity else 0.0,
        "cash_pct": round(100 * acc_d["cash_balance"] / equity, 4) if equity else 0.0,
        "portfolio_volatility_pct": None, "portfolio_beta": None, "var_95_1d": None,
    }
    if not positions or hv <= 0:
        return risk
    frames = []
    for p in positions:
        st = registry.get(p["symbol"])
        d = market_data.daily_closes(st) if st else pd.DataFrame()
        if d.empty:
            continue
        frames.append(d[["time", "close"]].rename(columns={"close": p["symbol"]}).set_index("time"))
    bench = registry.get("NIFTY50")
    if not frames:
        return risk
    m = pd.concat(frames, axis=1, join="inner").tail(RISK_LOOKBACK + 1)
    rets = m.pct_change().dropna()
    if len(rets) < 20:
        return risk
    w = np.array([next(p["market_value"] for p in positions if p["symbol"] == c) / hv for c in rets.columns])
    port = rets.to_numpy() @ w
    risk["portfolio_volatility_pct"] = round(float(np.std(port, ddof=1) * math.sqrt(252) * 100), 4)
    risk["var_95_1d"] = round(float(max(0.0, -np.percentile(port, 5)) * hv), 2)
    if bench is not None:
        b = market_data.daily_closes(bench).set_index("time")["close"].pct_change()
        jb = b.reindex(rets.index).to_numpy()
        mask = ~np.isnan(jb)
        if mask.sum() >= 20 and np.var(jb[mask]) > 0:
            risk["portfolio_beta"] = round(float(np.cov(port[mask], jb[mask])[0, 1] / np.var(jb[mask], ddof=1)), 4)
    return risk


def portfolio_summary(db: Session, acc: PaperAccount) -> dict:
    acc_d = account_dict(db, acc)
    positions = [position_dict(p) for p in open_positions(db, acc)]
    hv = sum(p["market_value"] for p in positions)
    eq = acc_d["equity"] or 1.0
    by_symbol = sorted(
        [{"label": p["symbol"], "value": round(p["market_value"], 2), "pct": round(100 * p["market_value"] / eq, 4)} for p in positions],
        key=lambda x: x["value"], reverse=True)
    sectors: dict[str, float] = defaultdict(float)
    for p in positions:
        sectors[p["sector"]] += p["market_value"]
    by_sector = sorted([{"label": k, "value": round(v, 2), "pct": round(100 * v / eq, 4)} for k, v in sectors.items()],
                       key=lambda x: x["value"], reverse=True)
    if acc_d["cash_balance"] > 0:
        by_symbol.append({"label": "CASH", "value": acc_d["cash_balance"], "pct": round(100 * acc_d["cash_balance"] / eq, 4)})
        by_sector.append({"label": "Cash", "value": acc_d["cash_balance"], "pct": round(100 * acc_d["cash_balance"] / eq, 4)})
    _ = hv
    return {"account": acc_d, "positions": positions, "allocation_by_symbol": by_symbol, "allocation_by_sector": by_sector,
            "equity_history": equity_history(db, acc), "stats": _stats(db, acc), "risk": _risk(positions, acc_d)}


def report_csv(db: Session, acc: PaperAccount) -> str:
    s = portfolio_summary(db, acc)
    buf = io.StringIO()
    w = csv.writer(buf)
    a = s["account"]
    w.writerow(["QuantDesk paper-trading report", "data_source=PAPER_TRADING (simulated prices)"])
    w.writerow(["generated_at", datetime.now(timezone.utc).isoformat()])
    w.writerow([])
    w.writerow(["account", "initial_capital", "cash_balance", "holdings_value", "equity", "realized_pnl", "unrealized_pnl",
                "total_return_pct"])
    w.writerow([a["name"], a["initial_capital"], a["cash_balance"], a["holdings_value"], a["equity"], a["realized_pnl"],
                a["unrealized_pnl"], a["total_return_pct"]])
    w.writerow([])
    w.writerow(["positions"])
    w.writerow(["symbol", "name", "sector", "quantity", "avg_price", "ltp", "invested", "market_value", "unrealized_pnl",
                "unrealized_pnl_pct"])
    for p in s["positions"]:
        w.writerow([p["symbol"], p["name"], p["sector"], p["quantity"], p["avg_price"], p["ltp"], p["invested"],
                    p["market_value"], p["unrealized_pnl"], p["unrealized_pnl_pct"]])
    w.writerow([])
    w.writerow(["transactions"])
    w.writerow(["id", "created_at", "type", "symbol", "quantity", "price", "amount", "balance_after"])
    txs = db.execute(select(Transaction).where(Transaction.account_id == acc.id)
                     .order_by(Transaction.created_at, Transaction.id)).unique().scalars().all()
    for t in txs:
        d = tx_dict(t)
        w.writerow([d["id"], d["created_at"], d["type"], d["symbol"] or "", d["quantity"] or "", d["price"] or "",
                    d["amount"], d["balance_after"]])
    w.writerow([])
    w.writerow(["stats"] + list(s["stats"].keys()))
    w.writerow([""] + list(s["stats"].values()))
    w.writerow(["risk"] + list(s["risk"].keys()))
    w.writerow([""] + list(s["risk"].values()))
    return buf.getvalue()


_ = timedelta
