"""Watchlists, alerts, notifications and assistant routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai_assistant.provider import provider as assistant
from app.api.deps import get_current_user, get_optional_user
from app.core.db import get_db
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.market_data.provider import market_data
from app.models import Alert, User, Watchlist, WatchlistItem
from app.services import alerts as alert_svc
from app.services import notifications as notif_svc
from app.services.market import get_quote
from app.repositories.stocks import registry

watchlists = APIRouter(prefix="/api/watchlists", tags=["watchlists"])
alerts = APIRouter(prefix="/api/alerts", tags=["alerts"])
notifications = APIRouter(prefix="/api/notifications", tags=["notifications"])
assistant_router = APIRouter(prefix="/api/assistant", tags=["assistant"])


# ------------------------------------------------------------------ watchlists
class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class SymbolIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)


class OrderSymbolsIn(BaseModel):
    symbols: list[str]


def _wl_dict(wl: Watchlist) -> dict:
    items = []
    for it in sorted(wl.items, key=lambda i: i.position):
        st = registry.by_id(it.stock_id)
        if st is None:
            continue
        items.append({**get_quote(st), "position": it.position})
    return {"id": wl.id, "name": wl.name, "items": items, "created_at": wl.created_at.isoformat()}


def _get_wl(db: Session, user: User, wid: int) -> Watchlist:
    wl = db.get(Watchlist, wid)
    if wl is None or wl.user_id != user.id:
        raise NotFoundError("Watchlist not found")
    return wl


@watchlists.get("")
def list_watchlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Watchlist).where(Watchlist.user_id == user.id).order_by(Watchlist.id)).scalars().all()
    return [_wl_dict(w) for w in rows]


@watchlists.post("", status_code=201)
def create_watchlist(body: NameIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = body.name.strip()
    if db.execute(select(Watchlist).where(Watchlist.user_id == user.id, Watchlist.name == name)).first():
        raise ConflictError("A watchlist with this name already exists", code="duplicate_watchlist")
    wl = Watchlist(user_id=user.id, name=name)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return _wl_dict(wl)


@watchlists.patch("/{wid}")
def rename_watchlist(wid: int, body: NameIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = _get_wl(db, user, wid)
    name = body.name.strip()
    if db.execute(select(Watchlist).where(Watchlist.user_id == user.id, Watchlist.name == name, Watchlist.id != wid)).first():
        raise ConflictError("A watchlist with this name already exists", code="duplicate_watchlist")
    wl.name = name
    db.commit()
    return _wl_dict(wl)


@watchlists.delete("/{wid}")
def delete_watchlist(wid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_get_wl(db, user, wid))
    db.commit()
    return {"message": "Watchlist deleted"}


@watchlists.post("/{wid}/items", status_code=201)
def add_item(wid: int, body: SymbolIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = _get_wl(db, user, wid)
    st = market_data.stock(body.symbol)
    if any(i.stock_id == st.id for i in wl.items):
        raise ConflictError(f"{st.symbol} is already in this watchlist", code="duplicate_item")
    pos = db.execute(select(func.coalesce(func.max(WatchlistItem.position), -1)).where(WatchlistItem.watchlist_id == wl.id)).scalar_one()
    wl.items.append(WatchlistItem(stock_id=st.id, position=int(pos) + 1))
    db.commit()
    db.refresh(wl)
    return _wl_dict(wl)


@watchlists.delete("/{wid}/items/{symbol}")
def remove_item(wid: int, symbol: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = _get_wl(db, user, wid)
    st = registry.get(symbol)
    item = next((i for i in wl.items if st is not None and i.stock_id == st.id), None)
    if item is None:
        raise NotFoundError(f"{symbol} is not in this watchlist")
    wl.items.remove(item)
    for k, it in enumerate(sorted(wl.items, key=lambda i: i.position)):
        it.position = k
    db.commit()
    db.refresh(wl)
    return _wl_dict(wl)


@watchlists.put("/{wid}/order")
def reorder(wid: int, body: OrderSymbolsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = _get_wl(db, user, wid)
    by_sym = {registry.by_id(i.stock_id).symbol: i for i in wl.items if registry.by_id(i.stock_id)}
    wanted = [s.upper() for s in body.symbols]
    if sorted(wanted) != sorted(by_sym) or len(set(wanted)) != len(wanted):
        raise ValidationAppError("symbols must list every watchlist symbol exactly once", code="invalid_order")
    for k, s in enumerate(wanted):  # two-phase to keep positions unique
        by_sym[s].position = 10000 + k
    db.flush()
    for k, s in enumerate(wanted):
        by_sym[s].position = k
    db.commit()
    db.refresh(wl)
    return _wl_dict(wl)


# ------------------------------------------------------------------ alerts
class AlertIn(BaseModel):
    symbol: str
    alert_type: str
    threshold: float | None = None
    params: dict[str, float] | None = None


class AlertPatch(BaseModel):
    is_active: bool


@alerts.get("")
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return alert_svc.list_alerts(db, user.id)


@alerts.post("", status_code=201)
def create_alert(body: AlertIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = alert_svc.create_alert(db, user.id, body.symbol, body.alert_type, body.threshold, body.params)
    return alert_svc.alert_dict(a)


@alerts.delete("/{aid}")
def delete_alert(aid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(alert_svc.get_alert(db, user.id, aid))
    db.commit()
    return {"message": "Alert deleted"}


@alerts.patch("/{aid}")
def patch_alert(aid: int, body: AlertPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a: Alert = alert_svc.get_alert(db, user.id, aid)
    a.is_active = body.is_active
    if body.is_active:
        a.triggered_at = None
    db.commit()
    return alert_svc.alert_dict(a)


# ------------------------------------------------------------------ notifications
@notifications.get("")
def list_notifications(unread_only: bool = False, limit: int = Query(100, ge=1, le=500),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return notif_svc.list_notifications(db, user.id, unread_only, limit)


@notifications.post("/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = notif_svc.mark_all_read(db, user.id)
    return {"message": f"{n} notification(s) marked as read", "updated": n}


@notifications.post("/{nid}/read")
def read_one(nid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return notif_svc.mark_read(db, user.id, nid)


# ------------------------------------------------------------------ assistant
class AssistantContext(BaseModel):
    symbol: str | None = None
    backtest_id: int | None = None
    timeframe: str | None = None


class AssistantIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    context: AssistantContext | None = None


@assistant_router.post("/query")
def query(body: AssistantIn, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    ctx = body.context.model_dump(exclude_none=True) if body.context else {}
    return assistant.answer(body.question, ctx, db, user.id if user else None)
