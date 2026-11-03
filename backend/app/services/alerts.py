"""Price/indicator alerts. Evaluated by the background loop against live simulated quotes; one-shot."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationAppError
from app.indicators import core
from app.market_data.provider import market_data
from app.models import Alert
from app.services.notifications import notify

ALERT_TYPES = {"PRICE_ABOVE", "PRICE_BELOW", "PCT_CHANGE_ABOVE", "PCT_CHANGE_BELOW", "RSI_ABOVE", "RSI_BELOW",
               "MA_CROSS_UP", "MA_CROSS_DOWN"}
NEEDS_THRESHOLD = {"PRICE_ABOVE", "PRICE_BELOW", "PCT_CHANGE_ABOVE", "PCT_CHANGE_BELOW", "RSI_ABOVE", "RSI_BELOW"}


def _f(x):
    return None if x is None else float(x)


def describe(a_type: str, symbol: str, threshold: float | None, params: dict) -> str:
    if a_type == "PRICE_ABOVE":
        return f"{symbol} price rises to or above {threshold:,.2f}"
    if a_type == "PRICE_BELOW":
        return f"{symbol} price falls to or below {threshold:,.2f}"
    if a_type == "PCT_CHANGE_ABOVE":
        return f"{symbol} day change >= {threshold:+.2f}%"
    if a_type == "PCT_CHANGE_BELOW":
        return f"{symbol} day change <= {threshold:+.2f}%"
    if a_type == "RSI_ABOVE":
        return f"{symbol} RSI({int(params.get('period', 14))}) rises above {threshold:g}"
    if a_type == "RSI_BELOW":
        return f"{symbol} RSI({int(params.get('period', 14))}) falls below {threshold:g}"
    f, s = int(params.get("fast", 20)), int(params.get("slow", 50))
    return f"{symbol} EMA({f}) crosses {'above' if a_type == 'MA_CROSS_UP' else 'below'} EMA({s}) (daily, live bar)"


def alert_dict(a: Alert) -> dict:
    thr = _f(a.threshold)
    return {"id": a.id, "symbol": a.stock.symbol, "alert_type": a.alert_type, "threshold": thr,
            "params": a.params or {}, "is_active": a.is_active,
            "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
            "created_at": a.created_at.isoformat(), "description": describe(a.alert_type, a.stock.symbol, thr, a.params or {})}


def _series_with_live(symbol: str) -> np.ndarray | None:
    st = market_data.stock(symbol, include_inactive=True)
    d = market_data.daily_closes(st)
    if d.empty:
        return None
    closes = d["close"].to_numpy(float)
    q = market_data.quote(st)
    if q is not None and q.ticking:
        closes = np.append(closes, q.price)
    return closes


def _ma_relation(symbol: str, fast: int, slow: int) -> int | None:
    c = _series_with_live(symbol)
    if c is None:
        return None
    ef, es = core.ema(c, fast)[-1], core.ema(c, slow)[-1]
    if np.isnan(ef) or np.isnan(es):
        return None
    return 1 if ef > es else -1


def create_alert(db: Session, user_id: int, symbol: str, alert_type: str, threshold: float | None, params: dict | None) -> Alert:
    alert_type = (alert_type or "").upper()
    if alert_type not in ALERT_TYPES:
        raise ValidationAppError(f"alert_type must be one of {', '.join(sorted(ALERT_TYPES))}", code="invalid_alert_type")
    stock = market_data.stock(symbol)
    params = {k: float(v) for k, v in (params or {}).items()}
    if alert_type in NEEDS_THRESHOLD and threshold is None:
        raise ValidationAppError("threshold is required for this alert type", code="threshold_required")
    if alert_type in ("PRICE_ABOVE", "PRICE_BELOW") and threshold is not None and threshold <= 0:
        raise ValidationAppError("price threshold must be > 0")
    if alert_type in ("RSI_ABOVE", "RSI_BELOW"):
        if not 0 < float(threshold) < 100:
            raise ValidationAppError("RSI threshold must be between 0 and 100")
        params.setdefault("period", 14.0)
        if not 2 <= params["period"] <= 100:
            raise ValidationAppError("RSI period must be between 2 and 100")
    state: dict = {}
    if alert_type in ("MA_CROSS_UP", "MA_CROSS_DOWN"):
        params.setdefault("fast", 20.0)
        params.setdefault("slow", 50.0)
        if not 2 <= params["fast"] < params["slow"] <= 400:
            raise ValidationAppError("MA params must satisfy 2 <= fast < slow <= 400")
        state["last_rel"] = _ma_relation(stock.symbol, int(params["fast"]), int(params["slow"]))
    a = Alert(user_id=user_id, stock_id=stock.id, alert_type=alert_type,
              threshold=Decimal(str(threshold)) if threshold is not None else None, params=params, is_active=True,
              state=state)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def get_alert(db: Session, user_id: int, alert_id: int) -> Alert:
    a = db.get(Alert, alert_id)
    if a is None or a.user_id != user_id:
        raise NotFoundError("Alert not found")
    return a


def list_alerts(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(select(Alert).where(Alert.user_id == user_id).order_by(Alert.created_at.desc())).unique().scalars().all()
    return [alert_dict(a) for a in rows]


def evaluate_alerts(db: Session) -> int:
    """Evaluate all active alerts against current live quotes. Returns the number triggered."""
    rows = db.execute(select(Alert).where(Alert.is_active.is_(True))).unique().scalars().all()
    if not rows:
        return 0
    triggered = 0
    rsi_cache: dict[tuple[str, int], float | None] = {}
    for a in rows:
        sym = a.stock.symbol
        st = market_data.stock(sym, include_inactive=True)
        q = market_data.quote(st)
        if q is None:
            continue
        thr = _f(a.threshold)
        hit = False
        detail = ""
        t = a.alert_type
        if t == "PRICE_ABOVE":
            hit, detail = q.price >= thr, f"price {q.price:,.2f}"
        elif t == "PRICE_BELOW":
            hit, detail = q.price <= thr, f"price {q.price:,.2f}"
        elif t == "PCT_CHANGE_ABOVE":
            hit, detail = q.change_pct >= thr, f"day change {q.change_pct:+.2f}%"
        elif t == "PCT_CHANGE_BELOW":
            hit, detail = q.change_pct <= thr, f"day change {q.change_pct:+.2f}%"
        elif t in ("RSI_ABOVE", "RSI_BELOW"):
            period = int(a.params.get("period", 14))
            key = (sym, period)
            if key not in rsi_cache:
                c = _series_with_live(sym)
                v = core.rsi(c, period)[-1] if c is not None and len(c) > period else np.nan
                rsi_cache[key] = None if np.isnan(v) else float(v)
            r = rsi_cache[key]
            if r is not None:
                hit = r > thr if t == "RSI_ABOVE" else r < thr
                detail = f"RSI({period}) {r:.2f}"
        else:
            rel = _ma_relation(sym, int(a.params.get("fast", 20)), int(a.params.get("slow", 50)))
            last = (a.state or {}).get("last_rel")
            if rel is not None:
                if last is not None:
                    hit = (t == "MA_CROSS_UP" and last < 0 < rel) or (t == "MA_CROSS_DOWN" and last > 0 > rel)
                if rel != last:
                    a.state = {**(a.state or {}), "last_rel": rel}
                detail = "EMA cross detected"
        if hit:
            a.is_active = False
            a.triggered_at = datetime.now(timezone.utc)
            desc = describe(t, sym, thr, a.params or {})
            notify(db, a.user_id, f"Alert: {desc}", f"Triggered at {detail} (SIMULATED data).", "ALERT")
            triggered += 1
    db.commit()
    return triggered
