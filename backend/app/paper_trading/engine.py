"""Paper-trading engine (Decimal money arithmetic, long-only, no leverage).

Order lifecycle (enforced): PENDING -> OPEN | FILLED | REJECTED | CANCELLED ; OPEN -> FILLED | CANCELLED.
  * MARKET orders fill immediately at the live simulated price +/- slippage, or are REJECTED
    (insufficient funds incl. fees / insufficient holdings — no short selling).
  * LIMIT orders become OPEN (BUY limits block cash incl. estimated fees) and fill when the live price
    crosses the limit (checked by the background loop and on placement).
  * stop_loss / take_profit on a BUY create OCO child SELL orders (STOP_LOSS / TAKE_PROFIT, OPEN) once the
    parent fills; when one triggers the sibling is cancelled.
Fees per fill = min(0.03% x value, INR 20) + 0.1% x value; slippage 5 bps adverse.
Position avg_price is the cost basis including buy fees; realized P&L on sells is net of sell fees, so
realized + unrealized P&L reconciles with equity - initial capital.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.market_data.live import live_market
from app.market_data.provider import market_data
from app.models import PaperAccount, PaperOrder, PaperPosition, Transaction
from app.services.audit import audit
from app.services.notifications import notify

BROKERAGE_PCT = Decimal("0.0003")
BROKERAGE_FLAT = Decimal("20")
TXN_PCT = Decimal("0.001")
SLIPPAGE = Decimal("0.0005")
CENT = Decimal("0.01")
PX = Decimal("0.0001")

TRANSITIONS = {
    "PENDING": {"OPEN", "FILLED", "REJECTED", "CANCELLED"},
    "OPEN": {"FILLED", "CANCELLED"},
    "FILLED": set(), "CANCELLED": set(), "REJECTED": set(),
}


def D(x) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


def q2(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


def q4(x: Decimal) -> Decimal:
    return x.quantize(PX, rounding=ROUND_HALF_UP)


def fees_for(value: Decimal) -> Decimal:
    return q2(min(value * BROKERAGE_PCT, BROKERAGE_FLAT) + value * TXN_PCT)


def set_status(order: PaperOrder, new: str) -> None:
    if new not in TRANSITIONS.get(order.status, set()):
        raise ConflictError(f"Invalid order status transition {order.status} -> {new}", code="invalid_transition")
    order.status = new


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tx(db: Session, acc: PaperAccount, kind: str, amount: Decimal, order: PaperOrder | None = None,
        stock_id: int | None = None, qty: int | None = None, price: Decimal | None = None,
        when: datetime | None = None) -> Transaction:
    acc.cash_balance = q2(D(acc.cash_balance) + amount)
    t = Transaction(account_id=acc.id, order_id=order.id if order else None, type=kind, stock_id=stock_id,
                    quantity=qty, price=price, amount=q2(amount), balance_after=acc.cash_balance,
                    created_at=when or _now())
    db.add(t)
    return t


# ------------------------------------------------------------------ accounts
def create_account(db: Session, user_id: int, name: str, initial_capital: float, when: datetime | None = None) -> PaperAccount:
    cap = D(initial_capital)
    if cap <= 0 or cap > D("1e11"):
        raise ValidationAppError("initial_capital must be > 0 and <= 1e11", code="invalid_capital")
    name = (name or "").strip()
    if not name:
        raise ValidationAppError("name is required")
    if db.execute(select(PaperAccount).where(PaperAccount.user_id == user_id, PaperAccount.name == name)).scalar_one_or_none():
        raise ConflictError("An account with this name already exists", code="duplicate_account")
    acc = PaperAccount(user_id=user_id, name=name[:100], initial_capital=q2(cap), cash_balance=D("0"),
                       blocked_margin=D("0"), realized_pnl=D("0"))
    if when:
        acc.created_at = acc.updated_at = when
    db.add(acc)
    db.flush()
    _tx(db, acc, "DEPOSIT", q2(cap), when=when)
    return acc


def get_account(db: Session, user_id: int, account_id: int) -> PaperAccount:
    acc = db.get(PaperAccount, account_id)
    if acc is None or acc.user_id != user_id:
        raise NotFoundError("Paper account not found")
    return acc


def _position(db: Session, acc: PaperAccount, stock_id: int, create: bool = True) -> PaperPosition | None:
    pos = db.execute(select(PaperPosition).where(PaperPosition.account_id == acc.id,
                                                 PaperPosition.stock_id == stock_id)).unique().scalar_one_or_none()
    if pos is None and create:
        pos = PaperPosition(account_id=acc.id, stock_id=stock_id, quantity=0, avg_price=D("0"), realized_pnl=D("0"))
        db.add(pos)
        db.flush()
    return pos


def _reserved_sell_qty(db: Session, acc: PaperAccount, stock_id: int, exclude_id: int | None = None) -> int:
    rows = db.execute(select(PaperOrder).where(
        PaperOrder.account_id == acc.id, PaperOrder.stock_id == stock_id, PaperOrder.side == "SELL",
        PaperOrder.order_type == "LIMIT", PaperOrder.status == "OPEN")).unique().scalars().all()
    return sum(o.quantity for o in rows if o.id != exclude_id)


# ------------------------------------------------------------------ fills
def execute_fill(db: Session, order: PaperOrder, fill_px: Decimal, when: datetime | None = None) -> None:
    acc = db.get(PaperAccount, order.account_id)
    when = when or _now()
    fill_px = q4(fill_px)
    value = q2(fill_px * order.quantity)
    fee = fees_for(value)
    pos = _position(db, acc, order.stock_id)
    sym = order.stock.symbol if order.stock else str(order.stock_id)
    if order.side == "BUY":
        if order.blocked_amount and D(order.blocked_amount) > 0:
            acc.blocked_margin = q2(max(D("0"), D(acc.blocked_margin) - D(order.blocked_amount)))
            order.blocked_amount = D("0")
        _tx(db, acc, "BUY", -value, order, order.stock_id, order.quantity, fill_px, when)
        _tx(db, acc, "FEES", -fee, order, order.stock_id, None, None, when)
        old_q = pos.quantity
        new_q = old_q + order.quantity
        pos.avg_price = q4((D(pos.avg_price) * old_q + value + fee) / new_q)
        pos.quantity = new_q
        if old_q == 0:
            pos.opened_at = when
    else:
        realized = q2((fill_px - D(pos.avg_price)) * order.quantity - fee)
        _tx(db, acc, "SELL", value, order, order.stock_id, order.quantity, fill_px, when)
        _tx(db, acc, "FEES", -fee, order, order.stock_id, None, None, when)
        pos.quantity -= order.quantity
        pos.realized_pnl = q2(D(pos.realized_pnl) + realized)
        acc.realized_pnl = q2(D(acc.realized_pnl) + realized)
        order.realized_pnl = realized
        if pos.opened_at is not None:
            opened = pos.opened_at if pos.opened_at.tzinfo else pos.opened_at.replace(tzinfo=timezone.utc)
            order.holding_seconds = int((when - opened).total_seconds())
        if pos.quantity == 0:
            pos.avg_price = D("0")
            pos.opened_at = None
    set_status(order, "FILLED")
    order.filled_quantity = order.quantity
    order.avg_fill_price = fill_px
    order.fees = fee
    order.filled_at = when
    order.updated_at = when
    acc.updated_at = when

    if order.side == "BUY" and order.parent_order_id is None and (order.stop_loss or order.take_profit):
        for typ, trig in (("STOP_LOSS", order.stop_loss), ("TAKE_PROFIT", order.take_profit)):
            if trig:
                child = PaperOrder(account_id=acc.id, stock_id=order.stock_id, side="SELL", order_type=typ,
                                   quantity=order.quantity, trigger_price=D(trig), parent_order_id=order.id,
                                   status="PENDING", filled_quantity=0, fees=D("0"), blocked_amount=D("0"))
                child.created_at = child.updated_at = when
                db.add(child)
                db.flush()
                set_status(child, "OPEN")
    if order.parent_order_id is not None:  # OCO: cancel siblings
        sibs = db.execute(select(PaperOrder).where(PaperOrder.parent_order_id == order.parent_order_id,
                                                   PaperOrder.id != order.id, PaperOrder.status == "OPEN")).unique().scalars().all()
        for s in sibs:
            set_status(s, "CANCELLED")
            s.rejection_reason = f"OCO: sibling order {order.id} filled"
    notify(db, acc.user_id, f"Order filled: {order.side} {order.quantity} {sym}",
           f"{order.order_type} {order.side} {order.quantity} {sym} @ {fill_px:.2f} (fees {fee:.2f}) in paper account "
           f"'{acc.name}'. Simulated paper trade.", "ORDER")


def live_price(symbol: str) -> Decimal | None:
    p = live_market.price(symbol)
    if p is None:
        st = market_data.stock(symbol)
        q = market_data.quote(st)
        p = q.price if q else None
    return None if p is None else D(p)


# ------------------------------------------------------------------ orders
def place_order(db: Session, acc: PaperAccount, *, symbol: str, side: str, order_type: str, quantity,
                limit_price=None, stop_loss=None, take_profit=None, price_override: float | None = None,
                when: datetime | None = None, ip: str | None = None) -> PaperOrder:
    side = (side or "").upper()
    order_type = (order_type or "").upper()
    if side not in ("BUY", "SELL"):
        raise ValidationAppError("side must be BUY or SELL", code="invalid_side")
    if order_type not in ("MARKET", "LIMIT"):
        raise ValidationAppError("order_type must be MARKET or LIMIT", code="invalid_order_type")
    if isinstance(quantity, bool) or not isinstance(quantity, (int, float)) or float(quantity) != int(quantity) or int(quantity) <= 0:
        raise ValidationAppError("quantity must be a positive whole number", code="invalid_quantity")
    quantity = int(quantity)
    if quantity > 10_000_000:
        raise ValidationAppError("quantity too large", code="invalid_quantity")
    stock = market_data.stock(symbol)
    if stock.is_index:
        raise ValidationAppError("Indices cannot be traded", code="invalid_symbol")
    if order_type == "LIMIT":
        if limit_price is None or D(limit_price) <= 0:
            raise ValidationAppError("limit_price must be > 0 for LIMIT orders", code="invalid_limit_price")
    elif limit_price is not None:
        raise ValidationAppError("limit_price is only allowed for LIMIT orders", code="invalid_limit_price")
    price = D(price_override) if price_override is not None else live_price(stock.symbol)
    if price is None or price <= 0:
        raise ValidationAppError(f"No price available for {stock.symbol}", code="no_price")
    ref = D(limit_price) if order_type == "LIMIT" else price
    if side == "SELL" and (stop_loss is not None or take_profit is not None):
        raise ValidationAppError("stop_loss/take_profit can only be attached to BUY orders (long-only)", code="invalid_bracket")
    if stop_loss is not None and not (0 < D(stop_loss) < ref):
        raise ValidationAppError("stop_loss must be positive and below the entry price", code="invalid_stop_loss")
    if take_profit is not None and not (D(take_profit) > ref):
        raise ValidationAppError("take_profit must be above the entry price", code="invalid_take_profit")

    when = when or _now()
    order = PaperOrder(account_id=acc.id, stock_id=stock.id, side=side, order_type=order_type, quantity=quantity,
                       limit_price=D(limit_price) if limit_price is not None else None,
                       stop_loss=D(stop_loss) if stop_loss is not None else None,
                       take_profit=D(take_profit) if take_profit is not None else None, status="PENDING",
                       filled_quantity=0, fees=D("0"), blocked_amount=D("0"))
    order.created_at = order.updated_at = when
    db.add(order)
    db.flush()
    order.stock  # noqa: B018 - load relationship

    available_cash = D(acc.cash_balance) - D(acc.blocked_margin)
    pos = _position(db, acc, stock.id, create=False)
    held = pos.quantity if pos else 0

    def reject(reason: str) -> PaperOrder:
        set_status(order, "REJECTED")
        order.rejection_reason = reason
        audit(db, "order.rejected", user_id=acc.user_id, entity_type="paper_order", entity_id=order.id, ip=ip,
              success=False, details={"reason": reason, "symbol": stock.symbol})
        notify(db, acc.user_id, f"Order rejected: {side} {quantity} {stock.symbol}", reason, "ORDER")
        db.commit()
        return order

    if order_type == "MARKET":
        fill_px = price * (1 + SLIPPAGE) if side == "BUY" else price * (1 - SLIPPAGE)
        if side == "BUY":
            need = q2(fill_px * quantity) + fees_for(q2(fill_px * quantity))
            if need > available_cash:
                return reject(f"Insufficient funds: need {need:.2f} incl. fees, available {available_cash:.2f}")
        else:
            free = held - _reserved_sell_qty(db, acc, stock.id)
            if quantity > free:
                return reject(f"Insufficient holdings: trying to sell {quantity}, available {free} (short selling not allowed)")
        execute_fill(db, order, fill_px, when)
    else:
        if side == "BUY":
            value = q2(D(limit_price) * quantity)
            block = value + fees_for(value)
            if block > available_cash:
                return reject(f"Insufficient funds to block {block:.2f} for limit order; available {available_cash:.2f}")
            order.blocked_amount = block
            acc.blocked_margin = q2(D(acc.blocked_margin) + block)
        else:
            free = held - _reserved_sell_qty(db, acc, stock.id, exclude_id=order.id)
            if quantity > free:
                return reject(f"Insufficient holdings: trying to sell {quantity}, available {free} (short selling not allowed)")
        set_status(order, "OPEN")
        _try_fill_open(db, order, price, when)
    audit(db, "order.placed", user_id=acc.user_id, entity_type="paper_order", entity_id=order.id, ip=ip,
          details={"symbol": stock.symbol, "side": side, "type": order_type, "qty": quantity, "status": order.status})
    db.commit()
    return order


def _try_fill_open(db: Session, o: PaperOrder, price: Decimal, when: datetime | None = None) -> bool:
    if o.status != "OPEN":
        return False
    fill = None
    if o.order_type == "LIMIT" and o.side == "BUY" and price <= D(o.limit_price):
        fill = min(price * (1 + SLIPPAGE), D(o.limit_price))
    elif o.order_type == "LIMIT" and o.side == "SELL" and price >= D(o.limit_price):
        fill = max(price * (1 - SLIPPAGE), D(o.limit_price))
    elif o.order_type == "STOP_LOSS" and price <= D(o.trigger_price):
        fill = price * (1 - SLIPPAGE)
    elif o.order_type == "TAKE_PROFIT" and price >= D(o.trigger_price):
        fill = price * (1 - SLIPPAGE)
    if fill is None:
        return False
    if o.side == "SELL":
        acc = db.get(PaperAccount, o.account_id)
        pos = _position(db, acc, o.stock_id, create=False)
        held = pos.quantity if pos else 0
        if held < o.quantity:
            set_status(o, "CANCELLED")
            o.rejection_reason = f"Insufficient holdings at trigger ({held} held)"
            return False
    execute_fill(db, o, fill, when)
    return True


def cancel_order(db: Session, acc: PaperAccount, order_id: int, ip: str | None = None) -> PaperOrder:
    o = db.get(PaperOrder, order_id)
    if o is None or o.account_id != acc.id:
        raise NotFoundError("Order not found")
    set_status(o, "CANCELLED")  # raises 409 for FILLED / CANCELLED / REJECTED
    if o.blocked_amount and D(o.blocked_amount) > 0:
        acc.blocked_margin = q2(max(D("0"), D(acc.blocked_margin) - D(o.blocked_amount)))
        o.blocked_amount = D("0")
    o.updated_at = _now()
    audit(db, "order.cancelled", user_id=acc.user_id, entity_type="paper_order", entity_id=o.id, ip=ip)
    db.commit()
    return o


def process_open_orders(db: Session, prices: dict[str, float]) -> int:
    """Check every OPEN order against the latest live prices. Returns number of fills."""
    rows = db.execute(select(PaperOrder).where(PaperOrder.status == "OPEN").order_by(PaperOrder.id)).unique().scalars().all()
    fills = 0
    for o in rows:
        p = prices.get(o.stock.symbol)
        if p is None:
            continue
        if _try_fill_open(db, o, D(p)):
            fills += 1
    if rows:
        db.commit()
    return fills


# ------------------------------------------------------------------ serialization
def _f(x) -> float | None:
    return None if x is None else float(x)


def order_dict(o: PaperOrder) -> dict:
    return {
        "id": o.id, "account_id": o.account_id, "symbol": o.stock.symbol, "side": o.side, "order_type": o.order_type,
        "quantity": o.quantity, "limit_price": _f(o.limit_price), "trigger_price": _f(o.trigger_price),
        "stop_loss": _f(o.stop_loss), "take_profit": _f(o.take_profit), "parent_order_id": o.parent_order_id,
        "status": o.status, "filled_quantity": o.filled_quantity, "avg_fill_price": _f(o.avg_fill_price),
        "rejection_reason": o.rejection_reason, "created_at": o.created_at.isoformat(), "updated_at": o.updated_at.isoformat(),
    }


def tx_dict(t: Transaction) -> dict:
    return {"id": t.id, "order_id": t.order_id, "type": t.type, "symbol": t.stock.symbol if t.stock else None,
            "quantity": t.quantity, "price": _f(t.price), "amount": float(t.amount), "balance_after": float(t.balance_after),
            "created_at": t.created_at.isoformat()}


def open_positions(db: Session, acc: PaperAccount) -> list[PaperPosition]:
    return list(db.execute(select(PaperPosition).where(PaperPosition.account_id == acc.id, PaperPosition.quantity > 0)
                           .order_by(PaperPosition.id)).unique().scalars().all())


def position_dict(p: PaperPosition) -> dict:
    st = market_data.stock(p.stock.symbol, include_inactive=True)
    q = market_data.quote(st)
    ltp = D(q.price) if q else D(p.avg_price)
    avg = D(p.avg_price)
    invested = q2(avg * p.quantity)
    mv = q2(ltp * p.quantity)
    upnl = mv - invested
    return {
        "symbol": p.stock.symbol, "name": p.stock.name, "sector": p.stock.sector, "quantity": p.quantity,
        "avg_price": float(q4(avg)), "ltp": float(ltp), "invested": float(invested), "market_value": float(mv),
        "unrealized_pnl": float(q2(upnl)), "unrealized_pnl_pct": round(float(upnl / invested * 100), 4) if invested else 0.0,
        "day_change_pct": round(q.change_pct, 4) if q else 0.0, "realized_pnl": float(p.realized_pnl),
    }


def account_dict(db: Session, acc: PaperAccount) -> dict:
    positions = open_positions(db, acc)
    hv = D("0")
    upnl = D("0")
    day = D("0")
    today = live_market.session_date
    for p in positions:
        st = market_data.stock(p.stock.symbol, include_inactive=True)
        q = market_data.quote(st)
        ltp = D(q.price) if q else D(p.avg_price)
        hv += ltp * p.quantity
        upnl += (ltp - D(p.avg_price)) * p.quantity
        if q is not None:
            opened_today = p.opened_at is not None and today is not None and p.opened_at.date().isoformat() >= today
            base = D(p.avg_price) if opened_today else D(q.prev_close)
            day += (ltp - base) * p.quantity
    cash = D(acc.cash_balance)
    equity = cash + hv
    init = D(acc.initial_capital)
    return {
        "id": acc.id, "name": acc.name, "initial_capital": float(init), "cash_balance": float(q2(cash)),
        "blocked_margin": float(q2(D(acc.blocked_margin))), "holdings_value": float(q2(hv)), "equity": float(q2(equity)),
        "realized_pnl": float(q2(D(acc.realized_pnl))), "unrealized_pnl": float(q2(upnl)), "day_pnl": float(q2(day)),
        "total_return_pct": round(float((equity / init - 1) * 100), 4) if init else 0.0,
        "created_at": acc.created_at.isoformat(), "data_source": "PAPER_TRADING",
    }
