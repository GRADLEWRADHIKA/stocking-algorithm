"""Paper trading: validation, rejections, limit fills, brackets (OCO), cancel transitions, P&L accounting."""
from decimal import Decimal

import pytest

from app.core.db import SessionLocal
from app.core.errors import ConflictError
from app.market_data.live import live_market
from app.models import PaperOrder
from app.paper_trading.engine import fees_for, process_open_orders, set_status


@pytest.fixture
def account(client, fresh_user):
    h = fresh_user["headers"]
    r = client.post("/api/paper-trading/accounts", json={"name": "Test", "initial_capital": 100000}, headers=h)
    assert r.status_code == 201, r.text
    acc = r.json()
    assert acc["cash_balance"] == 100000 and acc["equity"] == 100000 and acc["data_source"] == "PAPER_TRADING"
    return h, acc["id"]


def order(client, h, aid, **kw):
    return client.post(f"/api/paper-trading/accounts/{aid}/orders", json=kw, headers=h)


def run_loop_check():
    with SessionLocal() as db:
        return process_open_orders(db, {s: q.price for s, q in live_market.snapshot().items()})


def test_validation_errors(client, account):
    h, aid = account
    assert order(client, h, aid, symbol="ITC", side="BUY", order_type="MARKET", quantity=0).status_code == 400
    assert order(client, h, aid, symbol="ITC", side="BUY", order_type="MARKET", quantity=1.5).status_code == 400
    assert order(client, h, aid, symbol="ITC", side="BUY", order_type="LIMIT", quantity=1).status_code == 400
    assert order(client, h, aid, symbol="ITC", side="BUY", order_type="LIMIT", quantity=1, limit_price=-5).status_code == 400
    r = order(client, h, aid, symbol="NOPE", side="BUY", order_type="MARKET", quantity=1)
    assert r.status_code == 404 and r.json()["code"] == "unknown_symbol"
    assert order(client, h, aid, symbol="NIFTY50", side="BUY", order_type="MARKET", quantity=1).status_code == 400
    price = live_market.price("ITC")
    assert order(client, h, aid, symbol="ITC", side="BUY", order_type="MARKET", quantity=1,
                 stop_loss=price * 1.1).status_code == 400


def test_insufficient_balance_and_oversell(client, account):
    h, aid = account
    price = live_market.price("TCS")
    r = order(client, h, aid, symbol="TCS", side="BUY", order_type="MARKET", quantity=int(100000 / price) + 5)
    assert r.status_code == 201 and r.json()["status"] == "REJECTED" and "Insufficient funds" in r.json()["rejection_reason"]
    r = order(client, h, aid, symbol="TCS", side="SELL", order_type="MARKET", quantity=1)
    assert r.json()["status"] == "REJECTED" and "short selling" in r.json()["rejection_reason"]
    acc = client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()
    assert acc["cash_balance"] == 100000  # rejected orders do not touch cash


def test_market_buy_sell_pnl_accounting(client, account):
    h, aid = account
    p0 = live_market.price("ITC")
    r = order(client, h, aid, symbol="ITC", side="BUY", order_type="MARKET", quantity=100)
    o = r.json()
    assert o["status"] == "FILLED" and o["filled_quantity"] == 100
    fill = Decimal(str(o["avg_fill_price"]))
    assert float(fill) == pytest.approx(p0 * 1.0005, abs=1e-3)  # adverse slippage
    value = (fill * 100).quantize(Decimal("0.01"))
    fee = fees_for(value)
    acc = client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()
    assert Decimal(str(acc["cash_balance"])) == Decimal("100000") - value - fee
    txs = client.get(f"/api/paper-trading/accounts/{aid}/transactions", headers=h).json()
    assert [t["type"] for t in txs][:3] == ["FEES", "BUY", "DEPOSIT"]
    assert txs[0]["balance_after"] == acc["cash_balance"]
    pos = client.get(f"/api/paper-trading/accounts/{aid}/positions", headers=h).json()[0]
    assert pos["quantity"] == 100 and pos["avg_price"] == pytest.approx(float((value + fee) / 100), abs=1e-4)
    # move the live price and sell part of the position
    live_market.set_price_for_test("ITC", p0 * 1.10)
    acc2 = client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()
    assert acc2["unrealized_pnl"] > 0
    r = order(client, h, aid, symbol="ITC", side="SELL", order_type="MARKET", quantity=40)
    assert r.json()["status"] == "FILLED"
    acc3 = client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()
    assert acc3["realized_pnl"] > 0
    # realized + unrealized reconcile with equity - initial capital
    assert acc3["realized_pnl"] + acc3["unrealized_pnl"] == pytest.approx(acc3["equity"] - 100000, abs=0.05)
    assert order(client, h, aid, symbol="ITC", side="SELL", order_type="MARKET", quantity=61).json()["status"] == "REJECTED"
    live_market.set_price_for_test("ITC", p0)


def test_limit_order_lifecycle_and_cancel(client, account):
    h, aid = account
    p = live_market.price("INFY")
    r = order(client, h, aid, symbol="INFY", side="BUY", order_type="LIMIT", quantity=10, limit_price=round(p * 0.95, 2))
    o = r.json()
    assert o["status"] == "OPEN"
    acc = client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()
    assert acc["blocked_margin"] > 0
    live_market.set_price_for_test("INFY", p * 0.94)
    assert run_loop_check() >= 1
    filled = [x for x in client.get(f"/api/paper-trading/accounts/{aid}/orders", headers=h).json() if x["id"] == o["id"]][0]
    assert filled["status"] == "FILLED" and filled["avg_fill_price"] <= round(p * 0.95, 2)
    assert client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()["blocked_margin"] == 0
    # second limit order cancelled; cancelling again / a filled order is a 409
    r2 = order(client, h, aid, symbol="INFY", side="BUY", order_type="LIMIT", quantity=5, limit_price=round(p * 0.5, 2))
    oid = r2.json()["id"]
    c = client.post(f"/api/paper-trading/accounts/{aid}/orders/{oid}/cancel", headers=h)
    assert c.status_code == 200 and c.json()["status"] == "CANCELLED"
    assert client.post(f"/api/paper-trading/accounts/{aid}/orders/{oid}/cancel", headers=h).status_code == 409
    assert client.post(f"/api/paper-trading/accounts/{aid}/orders/{o['id']}/cancel", headers=h).status_code == 409
    assert client.get(f"/api/paper-trading/accounts/{aid}", headers=h).json()["blocked_margin"] == 0
    open_only = client.get(f"/api/paper-trading/accounts/{aid}/orders?status=OPEN", headers=h).json()
    assert all(x["status"] == "OPEN" for x in open_only)
    live_market.set_price_for_test("INFY", p)


def test_bracket_orders_oco(client, account):
    h, aid = account
    p = live_market.price("SBIN")
    r = order(client, h, aid, symbol="SBIN", side="BUY", order_type="MARKET", quantity=20, stop_loss=round(p * 0.9, 2),
              take_profit=round(p * 1.1, 2))
    parent = r.json()
    orders = client.get(f"/api/paper-trading/accounts/{aid}/orders", headers=h).json()
    kids = [x for x in orders if x["parent_order_id"] == parent["id"]]
    assert {k["order_type"] for k in kids} == {"STOP_LOSS", "TAKE_PROFIT"} and all(k["status"] == "OPEN" for k in kids)
    live_market.set_price_for_test("SBIN", p * 1.12)
    run_loop_check()
    kids = {x["order_type"]: x for x in client.get(f"/api/paper-trading/accounts/{aid}/orders", headers=h).json()
            if x["parent_order_id"] == parent["id"]}
    assert kids["TAKE_PROFIT"]["status"] == "FILLED" and kids["STOP_LOSS"]["status"] == "CANCELLED"
    assert client.get(f"/api/paper-trading/accounts/{aid}/positions", headers=h).json() == []
    notes = client.get("/api/notifications", headers=h).json()
    assert any(n["kind"] == "ORDER" for n in notes)
    live_market.set_price_for_test("SBIN", p)


def test_status_transition_table():
    o = PaperOrder(status="FILLED")
    with pytest.raises(ConflictError):
        set_status(o, "CANCELLED")
    o2 = PaperOrder(status="PENDING")
    set_status(o2, "OPEN")
    with pytest.raises(ConflictError):
        set_status(o2, "REJECTED")


def test_portfolio_summary_and_csv(client, auth):
    accs = client.get("/api/paper-trading/accounts", headers=auth).json()
    assert accs and accs[0]["name"] == "Demo Portfolio"
    s = client.get(f"/api/portfolio/{accs[0]['id']}", headers=auth).json()
    assert set(s) == {"account", "positions", "allocation_by_symbol", "allocation_by_sector", "equity_history", "stats", "risk"}
    assert len(s["equity_history"]) > 20 and s["stats"]["total_trades"] >= 1
    assert sum(a["pct"] for a in s["allocation_by_symbol"]) == pytest.approx(100, abs=0.1)
    assert s["risk"]["var_95_1d"] is not None and s["risk"]["portfolio_volatility_pct"] is not None
    csv = client.get(f"/api/portfolio/{accs[0]['id']}/report.csv", headers=auth)
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv") and "transactions" in csv.text


def test_other_users_cannot_access_account(client, account, auth):
    _, aid = account
    assert client.get(f"/api/paper-trading/accounts/{aid}", headers=auth).status_code == 404
    assert client.get(f"/api/portfolio/{aid}", headers=auth).status_code == 404
