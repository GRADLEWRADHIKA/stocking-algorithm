"""Deterministic intent classification (keyword/regex scoring) and entity extraction."""
from __future__ import annotations

import difflib
import re

from app.ai_assistant.knowledge import CONCEPTS
from app.repositories.stocks import registry

INTENTS = ["explain_trend", "explain_indicator", "compare", "explain_signal", "strategy_risk", "backtest_summary",
           "explain_concept", "market_regime", "indicator_summary", "market_summary", "unknown"]

INDICATOR_WORDS = [
    (r"\brsi\b|relative strength", "rsi"), (r"\bmacd\b", "macd"), (r"bollinger|\bbbands?\b", "bbands"),
    (r"\bvwap\b", "vwap"), (r"\batr\b|average true range", "atr"), (r"\badx\b|directional", "adx"),
    (r"stochastic|\bstoch\b", "stoch"), (r"\bobv\b|on.balance", "obv"), (r"\bema\b|exponential moving", "ema"),
    (r"\bsma\b|simple moving|moving average", "sma"), (r"\broc\b|rate of change", "roc"),
    (r"super ?trend", "supertrend"),
]
STRATEGY_WORDS = [
    (r"(ma|ema|moving average)[ -]?cross", "ma_crossover"), (r"trend[ -]?following", "trend_following"),
    (r"breakout", "breakout"), (r"momentum", "momentum"), (r"mean[ -]?reversion|bollinger (strategy|reversion)", "bollinger"),
    (r"vwap (strategy|reclaim)", "vwap"), (r"macd (strategy|cross)", "macd"), (r"rsi (strategy|reversal)", "rsi"),
    (r"super ?trend", "supertrend"),
]
TIMEFRAME_WORDS = [
    (r"\b1\s*(m|min|minute)\b", "1m"), (r"\b5\s*(m|min|minute)s?\b", "5m"), (r"\b15\s*(m|min|minute)s?\b", "15m"),
    (r"\b30\s*(m|min|minute)s?\b", "30m"), (r"\b(1\s*h|hourly|1\s*hour)\b", "1h"), (r"\b4\s*(h|hour)s?\b", "4h"),
    (r"\b(daily|1\s*d|day chart)\b", "1d"), (r"\b(weekly|1\s*w)\b", "1w"), (r"\b(monthly)\b", "1M"),
]
STOPWORDS = {"what", "which", "where", "show", "about", "today", "stock", "stocks", "share", "shares", "market",
             "price", "trend", "explain", "signal", "compare", "versus", "with", "does", "this", "that", "their",
             "there", "between", "bullish", "bearish", "summary", "indicator", "indicators", "strategy", "risks",
             "backtest", "drawdown", "maximum", "regime", "bank", "india", "industries", "limited", "motors", "steel",
             "power", "finance", "technologies", "services", "company", "consultancy", "tata", "oil", "state",
             "trading", "momentum", "breakout", "crossover", "should", "would", "could", "right", "now", "they", "supertrend"}


def _aliases() -> dict[str, str]:
    out: dict[str, str] = {}
    for s in registry.all(instrument_type=None):
        out[s.symbol.lower()] = s.symbol
        name = re.sub(r"\b(ltd|limited|the|of|and|india|co|corporation|company)\b\.?", " ", s.name.lower())
        name = re.sub(r"[^a-z0-9& ]", " ", name)
        name = re.sub(r"\s+", " ", name).strip()
        if name:
            out[name] = s.symbol
            first = name.split(" ")[0]
            if len(first) >= 4 and first not in STOPWORDS:
                out.setdefault(first, s.symbol)
    extra = {"nifty": "NIFTY50", "nifty 50": "NIFTY50", "bank nifty": "NIFTYBANK", "nifty bank": "NIFTYBANK",
             "nifty it": "NIFTYIT", "midcap": "NIFTYMIDCAP", "sensex": "SENSEX", "hdfc bank": "HDFCBANK", "sbi": "SBIN",
             "airtel": "BHARTIARTL", "infosys": "INFY", "hul": "HINDUNILVR", "l&t": "LT", "larsen": "LT",
             "mahindra": "M&M", "m&m": "M&M", "kotak": "KOTAKBANK", "icici": "ICICIBANK", "axis": "AXISBANK"}
    for k, v in extra.items():
        if registry.get(v):
            out[k] = v
    return out


def extract_symbols(text: str) -> list[str]:
    found: list[tuple[int, str]] = []
    low = " " + text.lower() + " "
    aliases = _aliases()
    for alias, sym in sorted(aliases.items(), key=lambda kv: -len(kv[0])):
        if len(alias) < 2:
            continue
        pat = r"(?<![a-z0-9&])" + re.escape(alias) + r"(?![a-z0-9&])"
        m = re.search(pat, low)
        if m and sym not in [s for _, s in found]:
            if alias == sym.lower() and len(alias) <= 3 and not re.search(r"(?<![A-Za-z0-9&])" + re.escape(sym) + r"(?![A-Za-z0-9&])", text):
                continue  # short tickers (e.g. "it", "lt") must be written in upper case
            found.append((m.start(), sym))
            low = low[:m.start()] + " " * len(alias) + low[m.end():]
    # fuzzy single-word matches for misspelled company names
    keys = [k for k in aliases if " " not in k and len(k) >= 5]
    for w in re.findall(r"[a-z]{5,}", low):
        if w in STOPWORDS:
            continue
        m = difflib.get_close_matches(w, keys, n=1, cutoff=0.85)
        if m and aliases[m[0]] not in [s for _, s in found]:
            found.append((low.find(w), aliases[m[0]]))
    return [s for _, s in sorted(found)]


def extract_entities(text: str, context: dict | None = None) -> dict:
    context = context or {}
    low = text.lower()
    symbols = extract_symbols(text)
    if not symbols and context.get("symbol") and registry.get(context["symbol"]):
        symbols = [registry.get(context["symbol"]).symbol]
    timeframe = None
    for pat, tf in TIMEFRAME_WORDS:
        if re.search(pat, low):
            timeframe = tf
            break
    timeframe = timeframe or context.get("timeframe")
    indicator = next((k for pat, k in INDICATOR_WORDS if re.search(pat, low)), None)
    strategy = next((k for pat, k in STRATEGY_WORDS if re.search(pat, low)), None)
    return {"symbols": symbols, "timeframe": timeframe, "indicator": indicator, "strategy_key": strategy}


def detect_concept(text: str) -> str | None:
    low = " " + text.lower() + " "
    best, best_len = None, 0
    for key, c in CONCEPTS.items():
        for kw in c["keywords"]:
            if kw in low and len(kw) > best_len:
                best, best_len = key, len(kw)
    return best


def classify(text: str, ent: dict) -> tuple[str, dict[str, float]]:
    low = text.lower()
    n_sym = len(ent["symbols"])
    s = {k: 0.0 for k in INTENTS}

    def has(pat: str) -> bool:
        return re.search(pat, low) is not None

    if has(r"\bcompare\b|\bvs\.?\b|\bversus\b|better than|\bor\b.*\bwhich\b"):
        s["compare"] += 3
    if n_sym >= 2:
        s["compare"] += 2
    if has(r"backtest"):
        s["backtest_summary"] += 2
        if has(r"\b(last|latest|my|recent|previous)\b"):
            s["backtest_summary"] += 2
    if has(r"\brisk"):
        s["strategy_risk"] += 1.5 + (2 if ent["strategy_key"] else 0) + (1 if has(r"strateg") else 0)
    if has(r"\bsignal|\bbuy\b|\bsell\b|should i (buy|sell)|entry|exit"):
        s["explain_signal"] += 2 + (1 if n_sym else 0)
    if ent["indicator"]:
        s["explain_indicator"] += 1.5 + (1.5 if n_sym else 0)
        if has(r"indicat|say|tell|reading|mean|crossover|cross"):
            s["explain_indicator"] += 1
    if has(r"what is|what's|what are|explain|define|meaning|concept|how does|how do"):
        s["explain_concept"] += 1.5 + (1.5 if not n_sym else 0)
        if ent["indicator"] and n_sym:
            s["explain_indicator"] += 1
    if detect_concept(text) and not n_sym:
        s["explain_concept"] += 2
    if has(r"trend|bullish|bearish|uptrend|downtrend|going up|going down|why is .* (up|down|rising|falling)"):
        s["explain_trend"] += 2 + (1 if n_sym else 0)
    if has(r"regime|market condition|market phase|risk.on|risk.off"):
        s["market_regime"] += 3.5 + (2.5 if has(r"market|current|now|today|nifty") or n_sym else 0)
    if has(r"indicator summary|technical summary|technicals|all indicators|indicators (for|of|on)|summary of (the )?indicators"):
        s["indicator_summary"] += 4
    if has(r"market|nifty|sensex|breadth|overview|today|gainers|losers|sector"):
        s["market_summary"] += 1.5 + (1 if not n_sym else 0)
        if has(r"summary|overview|how is|how's|today"):
            s["market_summary"] += 1
    if has(r"max(imum)? drawdown|sharpe|sortino|profit factor|win rate|look.ahead|slippage|overfit|position siz"):
        s["explain_concept"] += 2
        if has(r"backtest") and has(r"\b(last|latest|my|recent)\b"):
            s["explain_concept"] -= 2
    best = max(s, key=lambda k: s[k])
    if s[best] <= 0:
        return "unknown", s
    return best, s
