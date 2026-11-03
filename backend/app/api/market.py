from __future__ import annotations

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import check_timeframe, get_optional_user
from app.core.db import get_db
from app.core.errors import ValidationAppError
from app.indicators.registry import catalog_payload
from app.market_data.calendar import IST
from app.market_data.provider import candles_payload, filter_range, market_data
from app.ml.experiment import run_experiment
from app.models import User
from app.schemas.strategy import RuleCondition
from app.services import analysis as analysis_svc
from app.services import market as market_svc
from app.services.simulation import controller
from app.strategies.rule_engine import _condition, _Resolver, validate_definition

router = APIRouter(prefix="/api", tags=["market"])


@router.get("/market/overview")
def overview(date: str | None = Query(default=None, description="YYYY-MM-DD: replay that session")):  # noqa: A002
    return market_svc.market_overview(date)


@router.get("/market/indices")
def indices():
    return market_svc.index_quotes()


@router.get("/market/status")
def status():
    return market_svc.market_status(controller.running)


# ------------------------------------------------------------------ stocks
@router.get("/stocks")
def list_stocks(q: str | None = None, exchange: str | None = None, sector: str | None = None,
                min_price: float | None = None, max_price: float | None = None, min_volume: float | None = None,
                min_mcap: float | None = None, max_mcap: float | None = None, screen: str | None = None,
                sort: str | None = None, limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
    return market_svc.list_stocks(q, exchange, sector, min_price, max_price, min_volume, min_mcap, max_mcap, screen,
                                  sort, limit, offset)


@router.get("/stocks/sectors")
def sectors():
    return market_svc.sectors()


class ScreenIn(BaseModel):
    logic: str = Field(default="AND", pattern="^(AND|OR)$")
    conditions: list[RuleCondition] = Field(min_length=1, max_length=20)
    timeframe: str | None = "1d"
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


@router.post("/stocks/screen")
def custom_screen(body: ScreenIn):
    tf = check_timeframe(body.timeframe or "1d")
    defn = {"entry": {"logic": body.logic, "conditions": [c.model_dump() for c in body.conditions]},
            "exit": {"logic": "AND", "conditions": [c.model_dump() for c in body.conditions[:1]]},
            "timeframe": tf}
    _, errs = validate_definition(defn)
    if errs:
        raise ValidationAppError("Invalid screen conditions", code="invalid_conditions", errors=errs)
    matched_rows = []
    for st in market_svc.registry.all():
        if tf not in market_data.available_timeframes(st):
            continue
        df = market_data.candles(st, tf)
        if len(df) < 2:
            continue
        res = _Resolver(df)
        conds = [_condition(c, res) for c in body.conditions]
        sat = [bool(c.satisfied[-1]) for c in conds]
        ok = all(sat) if body.logic == "AND" else any(sat)
        if ok:
            matched_rows.append((st, [c.description for c, s in zip(conds, sat) if s]))
    total = len(matched_rows)
    page = matched_rows[body.offset: body.offset + body.limit]
    return {"items": [{**market_svc.stock_summary(st), "matched": m} for st, m in page], "total": total,
            "limit": body.limit, "offset": body.offset}


def _parse_time(v: str | None, end: bool = False) -> int | None:
    if v is None or v == "":
        return None
    if v.isdigit():
        return int(v)
    try:
        if len(v) == 10:
            d = date.fromisoformat(v)
            return int(datetime.combine(d, time(23, 59, 59) if end else time(0, 0), tzinfo=IST).timestamp())
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError as exc:
        raise ValidationAppError(f"Invalid date/time '{v}'", code="invalid_date") from exc


@router.get("/stocks/{symbol}")
def stock_detail(symbol: str):
    return market_svc.stock_detail(symbol)


@router.get("/stocks/{symbol}/candles")
def candles(symbol: str, timeframe: str = "1d", start: str | None = None, end: str | None = None,
            limit: int = Query(500, ge=1, le=20000)):
    check_timeframe(timeframe)
    st = market_data.stock(symbol)
    df = market_data.candles(st, timeframe)
    out = filter_range(df, _parse_time(start), _parse_time(end, True), limit)
    return {"symbol": st.symbol, "timeframe": timeframe, "data_source": st.data_source, "candles": candles_payload(out),
            "available_timeframes": market_data.available_timeframes(st)}


# ------------------------------------------------------------------ indicators & analysis
@router.get("/indicators/catalog")
def catalog():
    return catalog_payload()


@router.get("/indicators/{symbol}")
def indicators(symbol: str, timeframe: str = "1d", specs: str | None = None, limit: int = Query(500, ge=1, le=20000)):
    check_timeframe(timeframe)
    return analysis_svc.indicator_series(symbol, timeframe, specs, limit)


@router.get("/analysis/{symbol}")
def analysis(symbol: str, timeframe: str = "1d"):
    check_timeframe(timeframe)
    return analysis_svc.analyze(symbol, timeframe)


class MLIn(BaseModel):
    timeframe: str = "1d"
    model: str = Field(default="logistic", pattern="^(logistic|random_forest)$")
    horizon: int = Field(default=5, ge=1, le=60)


@router.post("/analysis/{symbol}/ml-experiment")
def ml_experiment(symbol: str, body: MLIn):
    check_timeframe(body.timeframe)
    return run_experiment(symbol, body.timeframe, body.model, body.horizon)


# ------------------------------------------------------------------ signals
@router.get("/signals")
def signals(symbol: str | None = None, strategy_key: str | None = None, action: str | None = None,
            limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    return analysis_svc.recent_signals(db, symbol, strategy_key, action, limit)


class GenerateIn(BaseModel):
    symbol: str
    strategy_key: str
    timeframe: str | None = "1d"
    params: dict[str, float] | None = None
    capital: float | None = Field(default=None, gt=0)
    risk_per_trade_pct: float | None = Field(default=None, gt=0, le=100)


@router.post("/signals/generate")
def generate(body: GenerateIn):
    tf = check_timeframe(body.timeframe or "1d")
    return analysis_svc.generate_signal(body.symbol, body.strategy_key, tf, body.params, body.capital,
                                        body.risk_per_trade_pct)


class ScanIn(BaseModel):
    strategy_key: str | None = None
    timeframe: str | None = "1d"


@router.post("/signals/scan")
def scan(body: ScanIn | None = None, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    body = body or ScanIn()
    tf = check_timeframe(body.timeframe or "1d")
    res = analysis_svc.scan(db, body.strategy_key, tf)
    controller.job("signal_scan", "completed", f"{len(res)} non-HOLD signals ({tf})")
    return res
