"""Rule-based assistant: intent classification, entity extraction and grounded answers."""
import pytest

CASES = [
    ("Why is RELIANCE bullish?", "explain_trend", ["RELIANCE"]),
    ("What does RSI indicate for Infosys?", "explain_indicator", ["INFY"]),
    ("Explain the MACD crossover on TCS", "explain_indicator", ["TCS"]),
    ("Compare TCS vs INFY", "compare", ["TCS", "INFY"]),
    ("Explain the BUY signal on HDFC Bank", "explain_signal", ["HDFCBANK"]),
    ("What are the risks of the breakout strategy?", "strategy_risk", []),
    ("Summarize my last backtest", "backtest_summary", []),
    ("What is maximum drawdown?", "explain_concept", []),
    ("What is the current market regime?", "market_regime", []),
    ("Give me the indicator summary for SBIN", "indicator_summary", ["SBIN"]),
    ("How is the market today?", "market_summary", []),
    ("Tell me a joke about cats", "unknown", []),
]


@pytest.mark.parametrize("q,intent,symbols", CASES)
def test_intents_and_entities(client, auth, q, intent, symbols):
    r = client.post("/api/assistant/query", json={"question": q}, headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == intent, (q, body["intent"])
    assert body["entities"]["symbols"][: len(symbols)] == symbols
    assert body["provider"] == "rule-based-v1"
    assert set(body) == {"intent", "entities", "answer", "observations", "interpretations", "data", "suggestions",
                         "disclaimers", "provider"}
    assert body["answer"] and body["disclaimers"] and body["suggestions"]
    assert any("not investment advice" in d.lower() for d in body["disclaimers"])


def test_answers_are_grounded_in_stored_data(client):
    a = client.get("/api/analysis/RELIANCE").json()
    r = client.post("/api/assistant/query", json={"question": "Why is RELIANCE in this trend?"}).json()
    assert a["trend"]["strength"] in r["answer"]
    assert any(d["label"] == "Trend" and d["value"] == a["trend"]["direction"] for d in r["data"])


def test_entities_timeframe_strategy_and_context(client):
    r = client.post("/api/assistant/query", json={"question": "Explain the momentum strategy signal on the 15 min chart",
                                                  "context": {"symbol": "TCS"}}).json()
    assert r["entities"] == {"symbols": ["TCS"], "timeframe": "15m", "indicator": None, "strategy_key": "momentum"}


def test_backtest_summary_requires_login_and_uses_user_runs(client, auth):
    anon = client.post("/api/assistant/query", json={"question": "Summarize my last backtest"}).json()
    assert "Log in" in anon["answer"]
    client.post("/api/backtests", headers=auth, json={"symbol": "ITC", "strategy": {"type": "builtin", "key": "macd"},
                                                     "timeframe": "1d", "initial_capital": 50000})
    r = client.post("/api/assistant/query", json={"question": "Summarize my last backtest"}, headers=auth).json()
    assert "ITC" in r["answer"] and "MACD Signal Cross" in r["answer"]


def test_missing_symbol_is_stated(client):
    r = client.post("/api/assistant/query", json={"question": "Give me the indicator summary"}).json()
    assert "mention a stock symbol" in r["answer"].lower()
