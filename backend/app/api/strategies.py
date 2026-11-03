from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_current_user, get_optional_user
from app.core.db import get_db
from app.core.errors import InsufficientDataError, NotFoundError, ValidationAppError
from app.market_data.provider import market_data
from app.models import Strategy, StrategyCondition, User
from app.schemas.strategy import EvaluateIn, SavedStrategyIn, StrategyUpdateIn, ValidateIn
from app.services.audit import audit
from app.strategies.builtin import BUILTIN_STRATEGIES
from app.strategies.rule_engine import definition_rows, evaluate_definition, validate_definition
from app.strategies.signals import build_signal

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


def _dict(s: Strategy) -> dict:
    return {"id": s.id, "name": s.name, "description": s.description, "definition": s.definition,
            "created_at": s.created_at.isoformat(), "updated_at": s.updated_at.isoformat()}


def _validated(defn: dict):
    parsed, errs = validate_definition(defn)
    if errs:
        raise ValidationAppError("Invalid strategy definition: " + "; ".join(errs), code="invalid_definition", errors=errs)
    return parsed


def _set_conditions(s: Strategy, parsed) -> None:
    s.conditions.clear()
    for row in definition_rows(parsed):
        s.conditions.append(StrategyCondition(**row))


def _get(db: Session, user: User, sid: int) -> Strategy:
    s = db.get(Strategy, sid)
    if s is None or s.user_id != user.id:
        raise NotFoundError("Strategy not found")
    return s


@router.get("/builtin")
def builtin():
    return [s.to_payload() for s in BUILTIN_STRATEGIES.values()]


@router.post("/validate")
def validate(body: ValidateIn):
    _, errs = validate_definition(body.definition)
    return {"valid": not errs, "errors": errs}


@router.post("/evaluate")
def evaluate(body: EvaluateIn, user: User | None = Depends(get_optional_user)):
    parsed = _validated(body.definition)
    tf = body.timeframe or parsed.timeframe
    st = market_data.stock(body.symbol)
    df = market_data.candles(st, tf)
    if len(df) < 2:
        raise InsufficientDataError("Not enough bars to evaluate")
    out = evaluate_definition(parsed, df)
    return build_signal(df=df, out=out, symbol=st.symbol, exchange=st.exchange, strategy_name="Custom strategy",
                        strategy_key="custom", timeframe=tf, data_source=st.data_source,
                        stop_loss_pct=parsed.risk.stop_loss_pct, take_profit_pct=parsed.risk.take_profit_pct)


@router.get("")
def list_strategies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Strategy).where(Strategy.user_id == user.id).order_by(Strategy.updated_at.desc())).scalars().all()
    return [_dict(s) for s in rows]


@router.post("", status_code=201)
def create(body: SavedStrategyIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    parsed = _validated(body.definition)
    s = Strategy(user_id=user.id, name=body.name.strip(), description=body.description,
                 definition=parsed.model_dump(exclude_none=False))
    _set_conditions(s, parsed)
    db.add(s)
    db.flush()
    audit(db, "strategy.create", user_id=user.id, entity_type="strategy", entity_id=s.id, ip=client_ip(request))
    db.commit()
    return _dict(s)


@router.get("/{sid}")
def get_strategy(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _dict(_get(db, user, sid))


@router.put("/{sid}")
def update(sid: int, body: StrategyUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get(db, user, sid)
    if body.definition is not None:
        parsed = _validated(body.definition)
        s.definition = parsed.model_dump(exclude_none=False)
        _set_conditions(s, parsed)
    if body.name is not None:
        s.name = body.name.strip()
    if body.description is not None:
        s.description = body.description
    db.commit()
    db.refresh(s)
    return _dict(s)


@router.delete("/{sid}")
def delete(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get(db, user, sid)
    db.delete(s)
    db.commit()
    return {"message": "Strategy deleted"}


@router.post("/{sid}/duplicate", status_code=201)
def duplicate(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _get(db, user, sid)
    parsed = _validated(s.definition)
    c = Strategy(user_id=user.id, name=f"{s.name} (copy)"[:120], description=s.description, definition=s.definition)
    _set_conditions(c, parsed)
    db.add(c)
    db.commit()
    return _dict(c)
