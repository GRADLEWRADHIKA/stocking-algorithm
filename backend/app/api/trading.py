"""Backtests, paper trading and portfolio routes (all require authentication)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_current_user
from app.backtesting.service import list_runs, run_backtest_request, run_summary, run_to_result
from app.core.db import get_db
from app.core.errors import NotFoundError, ValidationAppError
from app.models import BacktestRun, PaperOrder, Transaction, User
from app.paper_trading import engine as pt
from app.schemas.backtest import BacktestRequest, CompareRequest
from app.services.audit import audit
from app.services.portfolio import portfolio_summary, report_csv

backtests = APIRouter(prefix="/api/backtests", tags=["backtests"])
paper = APIRouter(prefix="/api/paper-trading", tags=["paper-trading"])
portfolio = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@backtests.post("", status_code=201)
def create_backtest(body: BacktestRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return run_backtest_request(body, db, user.id)


@backtests.get("")
def list_backtests(limit: int = Query(20, ge=1, le=200), user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    return [run_summary(r) for r in list_runs(db, user.id, limit)]


@backtests.post("/compare")
def compare(body: CompareRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = []
    for ref in body.strategies:
        data = {**body.base, "strategy": ref.model_dump()}
        try:
            req = BacktestRequest.model_validate(data)
        except ValidationError as exc:
            raise ValidationAppError("Invalid base backtest request", code="validation_error",
                                     errors=[f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()]) from exc
        res = run_backtest_request(req, db, user.id, persist=False)
        out.append({"strategy_name": res["strategy_name"], "metrics": res["metrics"], "in_sample": res["in_sample"],
                    "out_of_sample": res["out_of_sample"]})
    return out


@backtests.get("/{run_id}")
def get_backtest(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.get(BacktestRun, run_id)
    if run is None or (run.user_id != user.id and user.role != "ADMIN"):
        raise NotFoundError("Backtest not found")
    return run_to_result(run)


# ------------------------------------------------------------------ paper trading
class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    initial_capital: float = Field(gt=0, le=1e11)


class OrderIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    side: str
    order_type: str = "MARKET"
    quantity: float
    limit_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None


@paper.get("/accounts")
def accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models import PaperAccount

    rows = db.execute(select(PaperAccount).where(PaperAccount.user_id == user.id).order_by(PaperAccount.id)).scalars().all()
    return [pt.account_dict(db, a) for a in rows]


@paper.post("/accounts", status_code=201)
def create_account(body: AccountIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    acc = pt.create_account(db, user.id, body.name, body.initial_capital)
    audit(db, "paper_account.create", user_id=user.id, entity_type="paper_account", entity_id=acc.id, ip=client_ip(request))
    db.commit()
    return pt.account_dict(db, acc)


@paper.get("/accounts/{account_id}")
def get_account(account_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return pt.account_dict(db, pt.get_account(db, user.id, account_id))


@paper.delete("/accounts/{account_id}")
def delete_account(account_id: int, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    db.delete(acc)
    audit(db, "paper_account.delete", user_id=user.id, entity_type="paper_account", entity_id=account_id, ip=client_ip(request))
    db.commit()
    return {"message": "Account deleted"}


@paper.post("/accounts/{account_id}/orders", status_code=201)
def place_order(account_id: int, body: OrderIn, request: Request, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    o = pt.place_order(db, acc, symbol=body.symbol, side=body.side, order_type=body.order_type, quantity=body.quantity,
                       limit_price=body.limit_price, stop_loss=body.stop_loss, take_profit=body.take_profit,
                       ip=client_ip(request))
    db.refresh(o)
    return pt.order_dict(o)


@paper.get("/accounts/{account_id}/orders")
def list_orders(account_id: int, status: str | None = None, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    q = select(PaperOrder).where(PaperOrder.account_id == acc.id)
    if status:
        q = q.where(PaperOrder.status == status.upper())
    rows = db.execute(q.order_by(PaperOrder.created_at.desc(), PaperOrder.id.desc())).unique().scalars().all()
    return [pt.order_dict(o) for o in rows]


@paper.post("/accounts/{account_id}/orders/{order_id}/cancel")
def cancel(account_id: int, order_id: int, request: Request, user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    return pt.order_dict(pt.cancel_order(db, acc, order_id, client_ip(request)))


@paper.get("/accounts/{account_id}/positions")
def positions(account_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    return [pt.position_dict(p) for p in pt.open_positions(db, acc)]


@paper.get("/accounts/{account_id}/transactions")
def transactions(account_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    rows = db.execute(select(Transaction).where(Transaction.account_id == acc.id)
                      .order_by(Transaction.created_at.desc(), Transaction.id.desc())).unique().scalars().all()
    return [pt.tx_dict(t) for t in rows]


# ------------------------------------------------------------------ portfolio
@portfolio.get("/{account_id}")
def summary(account_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return portfolio_summary(db, pt.get_account(db, user.id, account_id))


@portfolio.get("/{account_id}/report.csv")
def report(account_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    acc = pt.get_account(db, user.id, account_id)
    return Response(report_csv(db, acc), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="quantdesk_portfolio_{acc.id}.csv"'})
