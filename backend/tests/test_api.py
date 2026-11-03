"""Integration tests for the main REST routes and the WebSocket, checked against the api.ts shapes."""
import pytest

from app.core.db import SessionLocal
from app.market_data.live import live_market
from app.services.alerts import evaluate_alerts

QUOTE = {"symbol", "name", "exchange", "sector", "price", "prev_close", "change", "change_pct", "volume", "data_source"}


def test_health_and_status(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["database"] == "ok"
    s = client.get("/api/market/status").json()
    assert s["session"] in ("OPEN", "CLOSED", "PRE_OPEN") and s["data_source"] == "SIMULATED"
    assert {"simulator_running", "as_of"} <= set(s)


def test_market_overview_live_and_replay(client):
    o = client.get("/api/market/overview").json()
    assert set(o) >= {"as_of", "data_source", "indices", "breadth", "top_gainers", "top_losers", "most_active",
                      "highest_volume", "sectors", "market_summary"}
    assert o["data_source"] == "SIMULATED"
    syms = [i["symbol"] for i in o["indices"]]
    assert syms[:2] == ["NIFTY50", "SENSEX"] and "NIFTYBANK" in syms and "NIFTYIT" in syms
    ix = o["indices"][0]
    assert set(ix) == {"symbol", "name", "value", "change", "change_pct", "sparkline", "data_source"}
    assert len(ix["sparkline"]) == 60
    b = o["breadth"]
    assert b["advancers"] + b["decliners"] + b["unchanged"] >= 12
    assert all(QUOTE <= set(q) for q in o["top_gainers"] + o["most_active"])
    assert any("SIMULATED" in s for s in o["market_summary"])
    replay = client.get("/api/market/overview?date=2026-10-30")
    assert replay.status_code == 200
    assert replay.json()["as_of"].startswith("2026-10-30")
    assert client.get("/api/market/overview?date=2026-11-01").status_code == 400  # Sunday
    assert len(client.get("/api/market/indices").json()) >= 4


def test_index_is_derived_from_constituents(client):
    from app.repositories.stocks import registry

    nifty = live_market.index_snapshot()["NIFTY50"]
    num = sum(w * live_market.get(s).price for s, w in nifty.members)
    den = sum(w * live_market.get(s).prev_close for s, w in nifty.members)
    assert nifty.value == pytest.approx(nifty.prev_close * num / den, abs=0.02)
    assert registry.get("NIFTY50").is_index


def test_stocks_list_filters_and_screens(client):
    r = client.get("/api/stocks?limit=5&sort=-change_pct").json()
    assert set(r) == {"items", "total", "limit", "offset"} and r["total"] >= 12 and len(r["items"]) == 5
    item = r["items"][0]
    assert QUOTE | {"market_cap", "sparkline"} <= set(item) and len(item["sparkline"]) == 30
    pcts = [i["change_pct"] for i in r["items"]]
    assert pcts == sorted(pcts, reverse=True)
    banks = client.get("/api/stocks?sector=Banking").json()
    assert banks["total"] >= 3 and all(i["sector"] == "Banking" for i in banks["items"])
    assert client.get("/api/stocks?q=reli").json()["items"][0]["symbol"] == "RELIANCE"
    assert "IT" in client.get("/api/stocks/sectors").json()
    for screen in ("gainers", "losers", "momentum", "breakout", "ma_crossover", "high_volatility", "oversold", "overbought"):
        assert client.get(f"/api/stocks?screen={screen}").status_code == 200
    g = client.get("/api/stocks?screen=gainers").json()["items"]
    assert all(i["change_pct"] > 0 for i in g)
    assert client.get("/api/stocks?screen=nope").status_code == 400
    cond = {"left": {"type": "indicator", "indicator": "rsi", "params": {"period": 14}}, "operator": ">",
            "right": {"type": "constant", "value": 0}}
    sc = client.post("/api/stocks/screen", json={"logic": "AND", "conditions": [cond]}).json()
    assert sc["total"] >= 12 and sc["items"][0]["matched"] == ["RSI(14) > 0"]


def test_stock_detail_and_candles(client):
    d = client.get("/api/stocks/RELIANCE").json()
    assert d["isin"] == "INE002A01018" and d["data_source"] == "SIMULATED"
    assert d["fundamentals"]["data_source"] == "SIMULATED" and d["fundamentals"]["eps"] > 0
    assert set(d["performance"]) == {"1W", "1M", "3M", "6M", "YTD", "1Y", "3Y"} and d["performance"]["3Y"] is None
    assert set(d["stats"]) == {"high_52w", "low_52w", "avg_volume_20d", "volatility_annualized", "beta", "day_high",
                               "day_low", "open"}
    assert d["available_timeframes"] == ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
    for tf, n in (("1m", 750), ("5m", 150), ("15m", 50), ("1h", 14), ("4h", 4)):
        c = client.get(f"/api/stocks/RELIANCE/candles?timeframe={tf}&limit=5000").json()
        assert c["timeframe"] == tf and len(c["candles"]) == n, tf
        assert set(c["candles"][0]) == {"time", "open", "high", "low", "close", "volume"}
    daily = client.get("/api/stocks/RELIANCE/candles?timeframe=1d&limit=10").json()["candles"]
    assert len(daily) == 10 and all(x["high"] >= max(x["open"], x["close"]) for x in daily)
    rng = client.get("/api/stocks/RELIANCE/candles?timeframe=1d&start=2026-10-01&end=2026-10-31").json()["candles"]
    assert 15 <= len(rng) <= 23
    assert client.get("/api/stocks/RELIANCE/candles?timeframe=2h").status_code == 400
    nf = client.get("/api/stocks/NOPE")
    assert nf.status_code == 404 and nf.json()["code"] == "unknown_symbol"


def test_indicators_endpoint(client):
    cat = client.get("/api/indicators/catalog").json()
    keys = {c["key"] for c in cat}
    assert {"sma", "ema", "rsi", "macd", "bbands", "vwap", "atr", "adx", "stoch", "obv", "volume_sma"} <= keys
    r = client.get("/api/indicators/TCS?timeframe=1d&specs=sma:20,macd:12:26:9,bbands:20:2,vwap,adx:14,stoch:14:3&limit=100").json()
    ids = [i["id"] for i in r["indicators"]]
    assert ids == ["sma_20", "macd_12_26_9", "bbands_20_2", "vwap_20", "adx_14", "stoch_14_3"]
    macd = r["indicators"][1]
    assert set(macd["lines"]) == {"macd", "signal", "histogram"} and macd["pane"] == "separate"
    assert set(r["indicators"][2]["lines"]) == {"upper", "middle", "lower"}
    assert len(r["indicators"][0]["lines"]["value"]) == 100
    intraday = client.get("/api/indicators/TCS?timeframe=5m&specs=vwap").json()
    assert intraday["indicators"][0]["lines"]["value"]
    assert client.get("/api/indicators/TCS?specs=foo:1").status_code == 400


def test_analysis_and_signals(client):
    a = client.get("/api/analysis/TCS").json()
    assert a["trend"]["direction"] in ("UPTREND", "DOWNTREND", "SIDEWAYS")
    assert a["regime"]["label"] in ("BULL_TREND", "BEAR_TREND", "RANGE_BOUND", "HIGH_VOLATILITY")
    assert a["volatility"]["state"] in ("LOW", "NORMAL", "HIGH") and a["volume"]["obv_trend"] in ("RISING", "FALLING", "FLAT")
    assert len(a["signals"]) == 9 and {s["strategy_key"] for s in a["signals"]} == {
        "ma_crossover", "rsi", "macd", "bollinger", "vwap", "momentum", "breakout", "trend_following", "supertrend"}
    assert a["observations"] and a["interpretations"]
    assert client.get("/api/analysis/TCS?timeframe=15m").status_code == 200
    sig = client.post("/api/signals/generate", json={"symbol": "INFY", "strategy_key": "rsi", "capital": 500000,
                                                     "risk_per_trade_pct": 2}).json()
    assert sig["strategy_key"] == "rsi" and sig["action"] in ("BUY", "SELL", "HOLD")
    scan = client.post("/api/signals/scan", json={"strategy_key": "macd"})
    assert scan.status_code == 200 and all(s["action"] != "HOLD" for s in scan.json())
    recent = client.get("/api/signals?limit=20").json()
    assert isinstance(recent, list) and all(s["id"] is not None for s in recent)
    if recent:
        sym = recent[0]["symbol"]
        assert all(s["symbol"] == sym for s in client.get(f"/api/signals?symbol={sym}").json())


def test_strategy_builder_crud(client, auth):
    from tests.test_strategies import GOOD_DEF

    assert len(client.get("/api/strategies/builtin").json()) == 9
    v = client.post("/api/strategies/validate", json={"definition": GOOD_DEF}).json()
    assert v == {"valid": True, "errors": []}
    bad = client.post("/api/strategies/validate", json={"definition": {**GOOD_DEF, "entry": {"logic": "AND", "conditions": []}}}).json()
    assert bad["valid"] is False and bad["errors"]
    r = client.post("/api/strategies", headers=auth, json={"name": "My EMA", "description": "d", "definition": GOOD_DEF})
    assert r.status_code == 201
    s = r.json()
    assert set(s) == {"id", "name", "description", "definition", "created_at", "updated_at"}
    inv = client.post("/api/strategies", headers=auth, json={"name": "x", "definition": {"entry": {}}})
    assert inv.status_code == 400 and inv.json()["errors"]
    dup = client.post(f"/api/strategies/{s['id']}/duplicate", headers=auth).json()
    assert dup["name"] == "My EMA (copy)"
    upd = client.put(f"/api/strategies/{s['id']}", headers=auth, json={"name": "Renamed"}).json()
    assert upd["name"] == "Renamed"
    ev = client.post("/api/strategies/evaluate", json={"definition": GOOD_DEF, "symbol": "TCS"}).json()
    assert ev["strategy_key"] == "custom" and ev["conditions"]
    bt = client.post("/api/backtests", headers=auth, json={"symbol": "TCS", "strategy": {"type": "saved", "strategy_id": s["id"]},
                                                           "timeframe": "1d", "initial_capital": 100000})
    assert bt.status_code == 201 and bt.json()["strategy_name"] == "Renamed"
    with SessionLocal() as db:
        from app.models import StrategyCondition

        assert db.query(StrategyCondition).filter_by(strategy_id=s["id"]).count() == 3
    assert client.delete(f"/api/strategies/{dup['id']}", headers=auth).status_code == 200
    assert client.get(f"/api/strategies/{dup['id']}", headers=auth).status_code == 404


def test_watchlists(client, fresh_user):
    h = fresh_user["headers"]
    wl = client.post("/api/watchlists", headers=h, json={"name": "Tech"}).json()
    for sym in ("TCS", "INFY", "PERSISTENT"):
        assert client.post(f"/api/watchlists/{wl['id']}/items", headers=h, json={"symbol": sym}).status_code == 201
    assert client.post(f"/api/watchlists/{wl['id']}/items", headers=h, json={"symbol": "TCS"}).status_code == 409
    r = client.put(f"/api/watchlists/{wl['id']}/order", headers=h, json={"symbols": ["PERSISTENT", "TCS", "INFY"]}).json()
    assert [i["symbol"] for i in r["items"]] == ["PERSISTENT", "TCS", "INFY"] and [i["position"] for i in r["items"]] == [0, 1, 2]
    assert QUOTE | {"position"} <= set(r["items"][0])
    r = client.delete(f"/api/watchlists/{wl['id']}/items/TCS", headers=h).json()
    assert [i["symbol"] for i in r["items"]] == ["PERSISTENT", "INFY"]
    assert client.patch(f"/api/watchlists/{wl['id']}", headers=h, json={"name": "IT"}).json()["name"] == "IT"
    assert client.post("/api/watchlists", headers=h, json={"name": "IT"}).status_code == 409
    assert client.delete(f"/api/watchlists/{wl['id']}", headers=h).status_code == 200
    assert client.get("/api/watchlists", headers=h).json() == []


def test_alerts_trigger_and_notify(client, fresh_user):
    h = fresh_user["headers"]
    p = live_market.price("HDFCBANK")
    a = client.post("/api/alerts", headers=h, json={"symbol": "HDFCBANK", "alert_type": "PRICE_ABOVE", "threshold": round(p * 1.05, 2)}).json()
    assert a["is_active"] and "HDFCBANK" in a["description"]
    rsi = client.post("/api/alerts", headers=h, json={"symbol": "HDFCBANK", "alert_type": "RSI_BELOW", "threshold": 1}).json()
    assert rsi["params"] == {"period": 14.0}
    ma = client.post("/api/alerts", headers=h, json={"symbol": "HDFCBANK", "alert_type": "MA_CROSS_UP", "params": {"fast": 10, "slow": 30}})
    assert ma.status_code == 201
    assert client.post("/api/alerts", headers=h, json={"symbol": "HDFCBANK", "alert_type": "PRICE_ABOVE"}).status_code == 400
    assert client.post("/api/alerts", headers=h, json={"symbol": "HDFCBANK", "alert_type": "BOGUS", "threshold": 1}).status_code == 400
    live_market.set_price_for_test("HDFCBANK", p * 1.06)
    with SessionLocal() as db:
        assert evaluate_alerts(db) >= 1
    got = {x["id"]: x for x in client.get("/api/alerts", headers=h).json()}
    assert got[a["id"]]["is_active"] is False and got[a["id"]]["triggered_at"] is not None
    assert got[rsi["id"]]["is_active"] is True
    notes = client.get("/api/notifications?unread_only=true", headers=h).json()
    n = next(x for x in notes if x["kind"] == "ALERT")
    assert set(n) == {"id", "title", "body", "kind", "is_read", "created_at"}
    assert client.post(f"/api/notifications/{n['id']}/read", headers=h).json()["is_read"] is True
    client.post("/api/notifications/read-all", headers=h)
    assert client.get("/api/notifications?unread_only=true", headers=h).json() == []
    assert client.patch(f"/api/alerts/{a['id']}", headers=h, json={"is_active": True}).json()["is_active"] is True
    assert client.delete(f"/api/alerts/{a['id']}", headers=h).status_code == 200
    live_market.set_price_for_test("HDFCBANK", p)


def test_websocket_ticks_and_notifications(client, fresh_user):
    import json

    from app.services.notifications import notification_bus
    from app.services.simulation import controller

    token = fresh_user["tokens"]["access_token"]
    uid = fresh_user["tokens"]["user"]["id"]
    with client.websocket_connect(f"/ws/market?symbols=RELIANCE,TCS&token={token}") as ws:
        msgs = [json.loads(ws.receive_text()) for _ in range(2 + 5)]
        ticks = [m for m in msgs if m["type"] == "tick"]
        assert {t["symbol"] for t in ticks} == {"RELIANCE", "TCS"}
        assert set(ticks[0]) == {"type", "symbol", "price", "change", "change_pct", "volume", "time", "data_source"}
        assert ticks[0]["data_source"] == "SIMULATED"
        assert any(m["type"] == "index" for m in msgs)
        # REST and WS agree on the live price
        q = client.get("/api/stocks/RELIANCE").json()
        assert q["price"] == next(t["price"] for t in ticks if t["symbol"] == "RELIANCE")
        notification_bus.put((uid, {"id": 1, "title": "t", "body": "b", "kind": "SYSTEM", "is_read": False, "created_at": "x"}))
        controller.drain_notifications()
        got = json.loads(ws.receive_text())
        assert got["type"] == "notification" and got["notification"]["title"] == "t"


def test_simulator_admin_controls(client, admin_auth):
    st = client.get("/api/admin/simulator", headers=admin_auth).json()
    assert st["data_source"] == "SIMULATED"
    r = client.post("/api/admin/simulator", headers=admin_auth, json={"action": "start", "tick_interval_ms": 500}).json()
    assert r["running"] is True and r["tick_interval_ms"] == 500
    r = client.post("/api/admin/simulator", headers=admin_auth, json={"action": "stop"}).json()
    assert r["running"] is False
    before = live_market.ticks
    live_market.step()
    assert live_market.ticks == before + 1
    assert client.get("/api/admin/jobs", headers=admin_auth).status_code == 200
    assert client.get("/api/admin/datasets", headers=admin_auth).status_code == 200
    assert client.get("/api/admin/backtests", headers=admin_auth).status_code == 200
    s = client.post("/api/admin/stocks", headers=admin_auth, json={"symbol": "NEWADM", "name": "New Admin Co"}).json()
    assert s["data_source"] == "HISTORICAL_DATASET"
    assert client.patch("/api/admin/stocks/NEWADM", headers=admin_auth, json={"is_active": False}).json()["is_active"] is False


def test_error_shape_and_validation(client):
    r = client.post("/api/auth/login", json={"email": "x"})
    assert r.status_code == 422 and set(r.json()) >= {"detail", "code"}
    assert client.get("/api/does-not-exist").json()["code"] == "not_found"


def test_ml_experiment(client):
    r = client.post("/api/analysis/RELIANCE/ml-experiment", json={"timeframe": "1d", "model": "logistic", "horizon": 5})
    assert r.status_code == 200, r.text
    m = r.json()
    assert {"accuracy", "precision", "recall", "f1", "confusion_matrix", "baseline_majority_accuracy"} <= set(m["metrics"])
    assert len(m["folds"]) == 5 and "num_trades" in m["strategy_backtest"]
    cm = m["metrics"]["confusion_matrix"]["matrix"]
    assert sum(map(sum, cm)) == m["metrics"]["oos_samples"]
    rf = client.post("/api/analysis/TCS/ml-experiment", json={"model": "random_forest", "horizon": 3})
    assert rf.status_code == 200 and len(rf.json()["feature_importance"]) == 12
