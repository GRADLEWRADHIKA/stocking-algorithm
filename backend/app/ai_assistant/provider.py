"""Provider-independent assistant interface + the local rule-based provider ('rule-based-v1').

Pipeline: intent classification -> entity extraction -> retrieval from local services (candles, indicators,
analysis, signals, backtests, market overview) -> deterministic analysis -> templated markdown answer with
observations (facts), interpretations (educational reading), a data table, suggestions and disclaimers.
No LLM, no internet access, no news; when data is missing the answer says so.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from app.ai_assistant.knowledge import CONCEPTS, STRATEGY_RISKS
from app.ai_assistant.nlp import classify, detect_concept, extract_entities
from app.core.errors import AppError
from app.models import BacktestRun
from app.strategies.builtin import BUILTIN_STRATEGIES

BASE_DISCLAIMERS = [
    "Educational, rule-based analysis of locally stored data. Not investment advice.",
    "Prices in QuantDesk are SIMULATED unless labelled HISTORICAL_DATASET; they are not live NSE/BSE prices.",
    "The assistant has no internet access and no news feed; it only uses data stored in this application.",
]


class AssistantProvider(ABC):
    name: str

    @abstractmethod
    def answer(self, question: str, context: dict | None, db: Session, user_id: int | None) -> dict: ...


def _fmt(x, nd=2, suffix=""):
    if x is None:
        return "n/a"
    return f"{x:,.{nd}f}{suffix}"


class RuleBasedProvider(AssistantProvider):
    name = "rule-based-v1"

    def answer(self, question: str, context: dict | None, db: Session, user_id: int | None) -> dict:
        question = (question or "").strip()[:1000]
        context = context or {}
        ent = extract_entities(question, context)
        intent, _scores = classify(question, ent)
        handler = getattr(self, f"_h_{intent}", self._h_unknown)
        try:
            res = handler(question, ent, context, db, user_id)
        except AppError as exc:
            res = {"answer": f"I could not complete that request: {exc.detail}", "observations": [],
                   "interpretations": [], "data": [], "suggestions": self._default_suggestions(ent)}
        return {
            "intent": intent, "entities": ent, "answer": res["answer"], "observations": res.get("observations", []),
            "interpretations": res.get("interpretations", []), "data": res.get("data", []),
            "suggestions": res.get("suggestions") or self._default_suggestions(ent),
            "disclaimers": BASE_DISCLAIMERS + res.get("extra_disclaimers", []), "provider": self.name,
        }

    # ------------------------------------------------------------ helpers
    @staticmethod
    def _default_suggestions(ent: dict) -> list[str]:
        sym = ent["symbols"][0] if ent["symbols"] else "RELIANCE"
        return [f"Why is {sym} in its current trend?", f"What does RSI indicate for {sym}?",
                f"Explain the latest MACD crossover on {sym}", "How is the market today?", "What is maximum drawdown?"]

    @staticmethod
    def _need_symbol(ent: dict, what: str) -> dict | None:
        if ent["symbols"]:
            return None
        return {"answer": f"Please mention a stock symbol or company name to {what} (for example RELIANCE, TCS or "
                          "HDFC Bank).", "observations": [], "interpretations": [], "data": []}

    @staticmethod
    def _analysis(sym: str, tf: str | None, history: bool = False) -> dict:
        from app.services.analysis import analyze

        return analyze(sym, tf or "1d", include_history=history)

    # ------------------------------------------------------------ intents
    def _h_explain_trend(self, q, ent, ctx, db, uid) -> dict:
        miss = self._need_symbol(ent, "explain its trend")
        if miss:
            return miss
        a = self._analysis(ent["symbols"][0], ent["timeframe"])
        t = a["trend"]
        reasons = []
        if t["ema_20"] and t["ema_50"]:
            reasons.append(f"EMA20 ({_fmt(t['ema_20'])}) is {'above' if t['ema_20'] > t['ema_50'] else 'below'} EMA50 ({_fmt(t['ema_50'])})")
        if t["slope_20_pct"] is not None:
            reasons.append(f"EMA20 changed {t['slope_20_pct']:+.2f}% over the last 5 bars")
        if t["sma_200"]:
            reasons.append(f"price is {'above' if a['price'] > t['sma_200'] else 'below'} SMA200 ({_fmt(t['sma_200'])})")
        if t["adx"] is not None:
            reasons.append(f"ADX is {t['adx']:.1f} ({t['strength'].lower()} trend strength)")
        word = {"UPTREND": "bullish (uptrend)", "DOWNTREND": "bearish (downtrend)", "SIDEWAYS": "sideways / no clear trend"}[t["direction"]]
        ans = (f"### {a['symbol']} trend ({a['timeframe']}, {a['data_source']})\n\n"
               f"The rule-based trend classification is **{word}**, strength **{t['strength']}**.\n\n"
               "Why:\n" + "\n".join(f"- {r}" for r in reasons)
               + f"\n\nMomentum state: **{a['momentum']['state']}** (RSI {_fmt(a['momentum']['rsi'])}). "
               f"Regime: **{a['regime']['label']}** — {a['regime']['description']}")
        if t["direction"] == "UPTREND" and "bullish" not in q.lower():
            pass
        return {"answer": ans, "observations": a["observations"], "interpretations": a["interpretations"],
                "data": [{"label": "Price", "value": _fmt(a["price"])}, {"label": "Trend", "value": t["direction"]},
                         {"label": "Strength", "value": t["strength"]}, {"label": "ADX", "value": _fmt(t["adx"])},
                         {"label": "EMA20", "value": _fmt(t["ema_20"])}, {"label": "EMA50", "value": _fmt(t["ema_50"])},
                         {"label": "SMA200", "value": _fmt(t["sma_200"])}],
                "suggestions": [f"Show the indicator summary for {a['symbol']}", f"Explain the signals on {a['symbol']}",
                                f"What are the risks of the trend following strategy?"]}

    def _h_explain_indicator(self, q, ent, ctx, db, uid) -> dict:
        ind = ent["indicator"] or "rsi"
        concept_key = {"bbands": "bollinger", "stoch": "stochastic", "ema": "moving_average", "sma": "moving_average",
                       "roc": "moving_average"}.get(ind, ind)
        concept = CONCEPTS.get(concept_key)
        if not ent["symbols"]:
            return {"answer": f"### {concept['title'] if concept else ind.upper()}\n\n{concept['text'] if concept else ''}\n\n"
                              "Mention a symbol (e.g. 'What does RSI indicate for TCS?') to apply it to stored data.",
                    "observations": [], "interpretations": [], "data": []}
        a = self._analysis(ent["symbols"][0], ent["timeframe"])
        m, v, tr = a["momentum"], a["volatility"], a["trend"]
        obs, interp, data = [], [], []
        if ind == "rsi":
            r = m["rsi"]
            obs.append(f"RSI(14) is {_fmt(r)}.")
            zone = "overbought (>70)" if r and r >= 70 else "oversold (<30)" if r and r <= 30 else "neutral (30-70)"
            interp.append(f"RSI is in the {zone} zone. " + ("In an uptrend, overbought readings can persist." if r and r >= 70 else
                          "Oversold is not a reversal signal by itself; it needs confirmation (e.g. RSI crossing back above 30)." if r and r <= 30 else
                          "It is not signalling an extreme."))
            data.append({"label": "RSI(14)", "value": _fmt(r)})
        elif ind == "macd":
            hist = m["macd_histogram"]
            obs.append(f"MACD {_fmt(m['macd'])}, signal {_fmt(m['macd_signal'])}, histogram {_fmt(hist)}.")
            sig = next((s for s in a["signals"] if s["strategy_key"] == "macd"), None)
            if sig:
                cross = [c for c in sig["conditions"] if "crossed" in c["description"]]
                for c in cross:
                    obs.append(f"{c['description']}: {'yes' if c['satisfied'] else 'no'} on the latest bar.")
            interp.append("MACD above its signal line (positive histogram) means short-term momentum is stronger than the "
                          "longer-term average; a crossover marks the moment that relationship flips. "
                          + ("Currently the histogram is positive." if hist and hist > 0 else "Currently the histogram is negative."))
            data += [{"label": "MACD", "value": _fmt(m["macd"], 4)}, {"label": "Signal", "value": _fmt(m["macd_signal"], 4)},
                     {"label": "Histogram", "value": _fmt(hist, 4)}]
        elif ind in ("bbands",):
            obs.append(f"Bollinger band width is {_fmt(v['bb_width_pct'])}% of the middle band.")
            sig = next((s for s in a["signals"] if s["strategy_key"] == "bollinger"), None)
            if sig:
                iv = sig["indicator_values"]
                obs.append(f"Bands: upper {_fmt(iv.get('bb_upper'))}, middle {_fmt(iv.get('bb_middle'))}, lower {_fmt(iv.get('bb_lower'))}; close {_fmt(a['price'])}.")
            interp.append("Narrow bands indicate a quiet market; closes outside the bands are statistically large moves.")
            data.append({"label": "BB width %", "value": _fmt(v["bb_width_pct"])})
        elif ind == "atr":
            obs.append(f"ATR(14) is {_fmt(v['atr'])} ({_fmt(v['atr_pct'])}% of price).")
            interp.append("A 2x ATR stop would sit about " + _fmt((v["atr"] or 0) * 2) + " below the price.")
            data.append({"label": "ATR(14)", "value": _fmt(v["atr"])})
        elif ind == "adx":
            obs.append(f"ADX(14) is {_fmt(tr['adx'])}.")
            interp.append("ADX above ~25 is usually read as a trending market; below ~20 as range-bound.")
            data.append({"label": "ADX(14)", "value": _fmt(tr["adx"])})
        elif ind == "stoch":
            obs.append(f"Stochastic %K {_fmt(m['stoch_k'])}, %D {_fmt(m['stoch_d'])}.")
            interp.append("%K above 80 / below 20 are conventional overbought/oversold zones.")
            data += [{"label": "%K", "value": _fmt(m["stoch_k"])}, {"label": "%D", "value": _fmt(m["stoch_d"])}]
        elif ind == "obv":
            obs.append(f"OBV trend over 10 bars: {a['volume']['obv_trend']}.")
            interp.append("Rising OBV with rising price means volume is confirming the move.")
        elif ind == "vwap":
            sig = next((s for s in a["signals"] if s["strategy_key"] == "vwap"), None)
            vw = sig["indicator_values"].get("vwap") if sig else None
            obs.append(f"VWAP {_fmt(vw)} vs close {_fmt(a['price'])}.")
            interp.append("Close above VWAP means the price is above the volume-weighted average paid over the window.")
            data.append({"label": "VWAP", "value": _fmt(vw)})
        elif ind == "supertrend":
            sig = next((s for s in a["signals"] if s["strategy_key"] == "supertrend"), None)
            iv = sig["indicator_values"] if sig else {}
            line, d = iv.get("supertrend"), iv.get("supertrend_direction")
            if line is None or d is None:
                obs.append("Not enough history to compute Supertrend(10, 3) on this timeframe.")
            else:
                side = "up (line below price, acting as support)" if d > 0 else "down (line above price, acting as resistance)"
                obs.append(f"Supertrend(10, 3) is {_fmt(line)} with the close at {_fmt(a['price'])}; direction is {side}.")
                interp.append("While the direction is up the line works as a trailing stop; a close below it flips the trend. "
                              if d > 0 else "Price must close above the line to flip the trend back up. ")
                data += [{"label": "Supertrend", "value": _fmt(line)}, {"label": "Direction", "value": "UP" if d > 0 else "DOWN"}]
        else:
            obs.append(f"EMA20 {_fmt(tr['ema_20'])}, EMA50 {_fmt(tr['ema_50'])}, SMA200 {_fmt(tr['sma_200'])}.")
            interp.append("Price above rising moving averages is the simplest definition of an uptrend.")
        ans = (f"### {ind.upper()} on {a['symbol']} ({a['timeframe']}, {a['data_source']})\n\n" + "\n".join(f"- {o}" for o in obs)
               + "\n\n**Reading:** " + " ".join(interp)
               + (f"\n\n_About the indicator:_ {concept['text']}" if concept else ""))
        return {"answer": ans, "observations": obs, "interpretations": interp, "data": data,
                "suggestions": [f"Why is {a['symbol']} trending this way?", f"Indicator summary for {a['symbol']}"]}

    def _h_compare(self, q, ent, ctx, db, uid) -> dict:
        syms = ent["symbols"][:3]
        if len(syms) < 2:
            return {"answer": "Please name two symbols to compare, e.g. 'Compare TCS vs INFY'.", "observations": [],
                    "interpretations": [], "data": []}
        from app.services.market import stock_detail

        rows, obs, data = [], [], []
        for s in syms:
            a = self._analysis(s, ent["timeframe"])
            d = stock_detail(s)
            rows.append((s, a, d))
        hdr = "| Metric | " + " | ".join(s for s, _, _ in rows) + " |\n|---|" + "---|" * len(rows) + "\n"
        def line(label, fn):
            return f"| {label} | " + " | ".join(fn(a, d) for _, a, d in rows) + " |\n"
        table = (hdr + line("Price", lambda a, d: _fmt(d["price"])) + line("Day change", lambda a, d: _fmt(d["change_pct"], 2, "%"))
                 + line("1M return", lambda a, d: _fmt(d["performance"]["1M"], 2, "%"))
                 + line("1Y return", lambda a, d: _fmt(d["performance"]["1Y"], 2, "%"))
                 + line("Trend", lambda a, d: f"{a['trend']['direction']} ({a['trend']['strength']})")
                 + line("RSI(14)", lambda a, d: _fmt(a["momentum"]["rsi"]))
                 + line("Volatility (ann.)", lambda a, d: _fmt(d["stats"]["volatility_annualized"], 2, "%"))
                 + line("Beta vs NIFTY50", lambda a, d: _fmt(d["stats"]["beta"]))
                 + line("Regime", lambda a, d: a["regime"]["label"]))
        for s, a, d in rows:
            obs.append(f"{s}: {a['trend']['direction'].lower()}, RSI {_fmt(a['momentum']['rsi'])}, 1Y {_fmt(d['performance']['1Y'], 2, '%')}, "
                       f"volatility {_fmt(d['stats']['volatility_annualized'], 2, '%')}.")
            data.append({"label": f"{s} 1Y return", "value": _fmt(d["performance"]["1Y"], 2, "%")})
        best = max(rows, key=lambda r: r[2]["performance"]["1Y"] if r[2]["performance"]["1Y"] is not None else -1e9)
        calm = min(rows, key=lambda r: r[2]["stats"]["volatility_annualized"])
        interp = [f"{best[0]} has the higher trailing 1Y return in the stored data; {calm[0]} has the lower volatility.",
                  "Past (simulated) performance does not indicate which will do better in future."]
        return {"answer": f"### Comparison ({rows[0][1]['timeframe']}, {rows[0][1]['data_source']})\n\n{table}",
                "observations": obs, "interpretations": interp, "data": data,
                "suggestions": [f"Explain the trend of {syms[0]}", f"Explain the trend of {syms[1]}"]}

    def _h_explain_signal(self, q, ent, ctx, db, uid) -> dict:
        miss = self._need_symbol(ent, "explain its signals")
        if miss:
            return miss
        from app.services.analysis import generate_signal

        sym, tf = ent["symbols"][0], ent["timeframe"] or "1d"
        keys = [ent["strategy_key"]] if ent["strategy_key"] else list(BUILTIN_STRATEGIES)
        sigs = [generate_signal(sym, k, tf, include_history=bool(ent["strategy_key"])) for k in keys]
        want = "BUY" if "buy" in q.lower() else "SELL" if "sell" in q.lower() else None
        focus = [s for s in sigs if s["action"] == want] if want else [s for s in sigs if s["action"] != "HOLD"]
        if not focus:
            msg = (f"None of the {'selected' if ent['strategy_key'] else 'built-in'} strategies currently show "
                   f"{'a ' + want if want else 'a BUY or SELL'} signal on {sym} ({tf}); all are HOLD on the latest bar.")
            focus = sigs[:1]
        else:
            msg = f"{len(focus)} strategy signal(s) on {sym} ({tf}):"
        parts = [msg]
        for s in focus[:4]:
            met = [c["description"] for c in s["conditions"] if c["satisfied"]]
            parts.append(f"\n**{s['strategy']} — {s['action']}** (strength {s['strength']['score']:.0f}/100, {s['strength']['label']})\n"
                         f"- {s['explanation']}\n- Conditions met: {', '.join(met) if met else 'none'}")
            if s["stop_loss"]:
                parts.append(f"- Illustrative stop {s['stop_loss']:.2f}, target {s['take_profit']:.2f}, R:R {s['risk_reward']:.2f}")
            hp = s.get("historical_performance")
            if hp and hp["trades"]:
                parts.append(f"- Past simulated backtest on this symbol: {hp['trades']} trades, win rate {_fmt(hp['win_rate'])}% (not a probability).")
        data = [{"label": s["strategy"], "value": f"{s['action']} ({s['strength']['score']:.0f})"} for s in sigs]
        return {"answer": f"### Signals for {sym}\n\n" + "\n".join(parts), "observations": [s["explanation"] for s in focus[:4]],
                "interpretations": ["Signals are mechanical rule outputs; the strength score measures how decisively rule "
                                    "conditions are met, not the chance of profit.",
                                    "SELL means 'exit or avoid a long position' because the engine is long-only."],
                "data": data, "suggestions": [f"What are the risks of the {focus[0]['strategy_key'].replace('_', ' ')} strategy?",
                                              f"Backtest the {focus[0]['strategy_key']} strategy on {sym}"]}

    def _h_strategy_risk(self, q, ent, ctx, db, uid) -> dict:
        key = ent["strategy_key"]
        if not key:
            lines = [f"- **{BUILTIN_STRATEGIES[k].name}**: {v[0]}" for k, v in STRATEGY_RISKS.items()]
            return {"answer": "### Typical strategy risks\n\n" + "\n".join(lines)
                              + "\n\nAll strategies share: costs/slippage, regime changes, small-sample statistics and overfitting.",
                    "observations": [], "interpretations": [], "data": []}
        st = BUILTIN_STRATEGIES[key]
        obs, data = [], []
        if ent["symbols"]:
            from app.backtesting.service import run_backtest_request
            from app.schemas.backtest import BacktestRequest

            req = BacktestRequest(symbol=ent["symbols"][0], strategy={"type": "builtin", "key": key},
                                  timeframe=ent["timeframe"] or "1d", out_of_sample_pct=30)
            r = run_backtest_request(req, db, uid, persist=False)
            m = r["metrics"]
            obs += [f"Backtest on {r['symbol']} ({r['bars']} bars, {r['data_source']}): return {_fmt(m['total_return_pct'])}%, "
                    f"max drawdown {_fmt(m['max_drawdown_pct'])}%, trades {m['num_trades']}, win rate {_fmt(m['win_rate'])}%.",
                    f"Buy & hold over the same period: {_fmt(m['buy_and_hold_return_pct'])}%."]
            if r["out_of_sample"]:
                obs.append(f"Out-of-sample (last 30%): return {_fmt(r['out_of_sample']['total_return_pct'])}%, "
                           f"max drawdown {_fmt(r['out_of_sample']['max_drawdown_pct'])}%.")
            data = [{"label": "Max drawdown", "value": _fmt(m["max_drawdown_pct"], 2, "%")},
                    {"label": "Trades", "value": str(m["num_trades"])}, {"label": "Win rate", "value": _fmt(m["win_rate"], 2, "%")}]
        ans = (f"### Risks of {st.name}\n\n{st.description}\n\n" + "\n".join(f"- {x}" for x in STRATEGY_RISKS[key])
               + "\n- Costs and slippage reduce every trade's result; frequent trading amplifies this."
               + ("\n\n" + "\n".join(f"- {o}" for o in obs) if obs else "\n\nMention a symbol to see its backtest-based risk figures."))
        return {"answer": ans, "observations": obs, "interpretations": ["Drawdown and trade count show how the rules "
                "behaved historically; they are not forecasts."], "data": data}

    def _h_backtest_summary(self, q, ent, ctx, db, uid) -> dict:
        if uid is None:
            return {"answer": "Log in to see your backtests: backtest history is stored per user.", "observations": [],
                    "interpretations": [], "data": []}
        run = None
        if ctx.get("backtest_id"):
            run = db.get(BacktestRun, int(ctx["backtest_id"]))
            if run is not None and run.user_id != uid:
                run = None
        if run is None:
            from app.backtesting.service import list_runs

            runs = list_runs(db, uid, 1)
            run = runs[0] if runs else None
        if run is None:
            return {"answer": "You have no saved backtests yet. Run one from the Backtesting page.", "observations": [],
                    "interpretations": [], "data": []}
        m = run.metrics
        verdict = "outperformed" if m["total_return_pct"] > m["buy_and_hold_return_pct"] else "underperformed"
        obs = [f"{run.strategy_name} on {run.stock.symbol} ({run.timeframe}, {run.bars} bars, {run.data_source}).",
               f"Total return {_fmt(m['total_return_pct'])}% vs buy & hold {_fmt(m['buy_and_hold_return_pct'])}% — {verdict}.",
               f"Max drawdown {_fmt(m['max_drawdown_pct'])}%, Sharpe {_fmt(m['sharpe_ratio'])}, profit factor {_fmt(m['profit_factor'])}.",
               f"{m['num_trades']} trades, win rate {_fmt(m['win_rate'])}%, exposure {_fmt(m['exposure_pct'])}%, costs INR {_fmt(m['total_costs'])}."]
        if run.out_of_sample:
            obs.append(f"Out-of-sample return {_fmt(run.out_of_sample['total_return_pct'])}% vs in-sample "
                       f"{_fmt(run.in_sample['total_return_pct'] if run.in_sample else None)}%.")
        interp = []
        if m["num_trades"] < 10:
            interp.append("Fewer than 10 trades: the statistics are based on a very small sample.")
        if (m["max_drawdown_pct"] or 0) > 25:
            interp.append("A drawdown above 25% would be hard to sit through in practice.")
        interp.append("Backtest results on simulated data describe the rules' behaviour, not future returns.")
        return {"answer": f"### Backtest #{run.id} summary\n\n" + "\n".join(f"- {o}" for o in obs), "observations": obs,
                "interpretations": interp,
                "data": [{"label": k, "value": _fmt(m[k]) if isinstance(m[k], (int, float)) else str(m[k])}
                         for k in ("total_return_pct", "max_drawdown_pct", "sharpe_ratio", "win_rate", "num_trades")],
                "suggestions": ["What is maximum drawdown?", "What is the Sharpe ratio?"]}

    def _h_explain_concept(self, q, ent, ctx, db, uid) -> dict:
        key = detect_concept(q)
        if key is None and ent["indicator"]:
            key = {"bbands": "bollinger", "stoch": "stochastic", "ema": "moving_average", "sma": "moving_average"}.get(
                ent["indicator"], ent["indicator"])
        c = CONCEPTS.get(key or "")
        if c is None:
            return self._h_unknown(q, ent, ctx, db, uid)
        return {"answer": f"### {c['title']}\n\n{c['text']}", "observations": [], "interpretations": [],
                "data": [], "suggestions": ["Summarize my last backtest", "What does RSI indicate for INFY?"]}

    def _h_market_regime(self, q, ent, ctx, db, uid) -> dict:
        sym = ent["symbols"][0] if ent["symbols"] else "NIFTY50"
        a = self._analysis(sym, ent["timeframe"])
        r = a["regime"]
        ans = (f"### Regime for {sym} ({a['timeframe']}, {a['data_source']})\n\n**{r['label'].replace('_', ' ')}** — {r['description']}\n\n"
               f"Trend {a['trend']['direction']} ({a['trend']['strength']}), volatility state {a['volatility']['state']}, "
               f"ADX {_fmt(a['trend']['adx'])}.\n\n{CONCEPTS['regime']['text']}")
        interp = {"BULL_TREND": "Trend-following rules have historically fitted this kind of phase better than mean reversion.",
                  "BEAR_TREND": "Long-only strategies typically stay in cash more often in this phase.",
                  "RANGE_BOUND": "Mean-reversion rules (e.g. Bollinger) are more commonly applied in ranges.",
                  "HIGH_VOLATILITY": "Position sizes based on ATR shrink; gaps can jump stops."}[r["label"]]
        return {"answer": ans, "observations": a["observations"][:4], "interpretations": [interp],
                "data": [{"label": "Regime", "value": r["label"]}, {"label": "Trend", "value": a["trend"]["direction"]},
                         {"label": "Volatility", "value": a["volatility"]["state"]}]}

    def _h_indicator_summary(self, q, ent, ctx, db, uid) -> dict:
        miss = self._need_symbol(ent, "summarize its indicators")
        if miss:
            return miss
        a = self._analysis(ent["symbols"][0], ent["timeframe"])
        t, m, v, vol = a["trend"], a["momentum"], a["volatility"], a["volume"]
        data = [
            {"label": "Price", "value": _fmt(a["price"])}, {"label": "EMA20", "value": _fmt(t["ema_20"])},
            {"label": "EMA50", "value": _fmt(t["ema_50"])}, {"label": "SMA200", "value": _fmt(t["sma_200"])},
            {"label": "ADX", "value": _fmt(t["adx"])}, {"label": "RSI(14)", "value": _fmt(m["rsi"])},
            {"label": "MACD hist", "value": _fmt(m["macd_histogram"], 4)}, {"label": "Stoch %K", "value": _fmt(m["stoch_k"])},
            {"label": "ROC(10)", "value": _fmt(m["roc_10"], 2, "%")}, {"label": "ATR(14)", "value": _fmt(v["atr"])},
            {"label": "HV(20)", "value": _fmt(v["hist_vol_20"], 2, "%")}, {"label": "Volume ratio", "value": _fmt(vol["ratio"])},
            {"label": "OBV trend", "value": vol["obv_trend"]},
        ]
        buys = [s["strategy"] for s in a["signals"] if s["action"] == "BUY"]
        sells = [s["strategy"] for s in a["signals"] if s["action"] == "SELL"]
        ans = (f"### Indicator summary: {a['symbol']} ({a['timeframe']}, {a['data_source']})\n\n"
               + "\n".join(f"- {d['label']}: {d['value']}" for d in data)
               + f"\n\nTrend {t['direction']} ({t['strength']}); momentum {m['state']}; volatility {v['state']}; regime {a['regime']['label']}."
               + f"\n\nStrategy signals now — BUY: {', '.join(buys) or 'none'}; SELL: {', '.join(sells) or 'none'}.")
        return {"answer": ans, "observations": a["observations"], "interpretations": a["interpretations"], "data": data}

    def _h_market_summary(self, q, ent, ctx, db, uid) -> dict:
        from app.services.market import market_overview

        o = market_overview()
        data = [{"label": ix["symbol"], "value": f"{ix['value']:,.2f} ({ix['change_pct']:+.2f}%)"} for ix in o["indices"]]
        data.append({"label": "Breadth", "value": f"{o['breadth']['advancers']} up / {o['breadth']['decliners']} down"})
        ans = "### Market summary (live simulated session)\n\n" + "\n".join(f"- {s}" for s in o["market_summary"])
        interp = []
        b = o["breadth"]
        if b["advancers"] > b["decliners"] * 1.5:
            interp.append("Broad participation: most stocks are rising together.")
        elif b["decliners"] > b["advancers"] * 1.5:
            interp.append("Selling is broad-based across the universe.")
        else:
            interp.append("Breadth is mixed; moves are concentrated in specific stocks/sectors.")
        return {"answer": ans, "observations": o["market_summary"], "interpretations": interp, "data": data,
                "suggestions": ["What is the market regime?", f"Why is {o['top_gainers'][0]['symbol'] if o['top_gainers'] else 'RELIANCE'} rising?"]}

    def _h_unknown(self, q, ent, ctx, db, uid) -> dict:
        return {"answer": "I can answer questions about trends, indicators (RSI, MACD, Bollinger, VWAP, ATR, ADX...), "
                          "strategy signals and their risks, comparisons between stocks, your last backtest, market regime "
                          "and the overall (simulated) market. I cannot access news or the internet, and I do not give "
                          "investment advice. Try one of the suggestions below.",
                "observations": [], "interpretations": [], "data": []}


provider = RuleBasedProvider()
