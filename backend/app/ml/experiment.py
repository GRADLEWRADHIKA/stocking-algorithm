"""Optional ML experiment: next-`horizon`-bar direction classification with walk-forward validation.

* Features (all causal, computed from bars <= t): 1/5/10-bar log returns, RSI(14), MACD histogram / close,
  Bollinger %B, ATR% , ADX, volume ratio vs 20-bar SMA, distance to EMA50, 20-bar realized volatility,
  20-bar z-score of close.
* Label: 1 if close[t+horizon] > close[t] else 0 (uses the future ONLY as the target).
* Validation: sklearn TimeSeriesSplit(n_splits=5, gap=horizon) — training rows never overlap the
  label window of the test fold (purged). Metrics are computed on out-of-sample folds only.
* Strategy check: out-of-sample predictions are turned into long/flat signals and run through the same
  backtester with costs and next-bar-open execution.
The core platform does not depend on this module.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.algorithms.processing import log_returns, rolling_zscore
from app.backtesting.engine import BacktestConfig, run_backtest
from app.backtesting.metrics import compute_metrics
from app.core.errors import InsufficientDataError, ValidationAppError
from app.indicators import core
from app.market_data.provider import market_data
from app.market_data.resample import bars_per_year

FEATURES = ["ret_1", "ret_5", "ret_10", "rsi_14", "macd_hist_pct", "bb_pctb", "atr_pct", "adx_14", "vol_ratio",
            "dist_ema50_pct", "rvol_20", "zscore_20"]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    c, h, lo, v = (df[k].to_numpy(float) for k in ("close", "high", "low", "volume"))
    lr = log_returns(c)
    bb = core.bbands(c, 20, 2)
    width = bb["upper"] - bb["lower"]
    with np.errstate(divide="ignore", invalid="ignore"):
        f = pd.DataFrame({
            "ret_1": lr,
            "ret_5": np.log(c / core.shift(c, 5)),
            "ret_10": np.log(c / core.shift(c, 10)),
            "rsi_14": core.rsi(c, 14),
            "macd_hist_pct": core.macd(c)["histogram"] / c * 100,
            "bb_pctb": np.where(width > 0, (c - bb["lower"]) / width, 0.5),
            "atr_pct": core.atr(h, lo, c, 14) / c * 100,
            "adx_14": core.adx(h, lo, c, 14)["adx"],
            "vol_ratio": v / core.sma(v, 20),
            "dist_ema50_pct": (c / core.ema(c, 50) - 1) * 100,
            "rvol_20": pd.Series(lr).rolling(20).std().to_numpy() * 100,
            "zscore_20": rolling_zscore(c, 20),
        })
    return f.replace([np.inf, -np.inf], np.nan)


def run_experiment(symbol: str, timeframe: str = "1d", model: str = "logistic", horizon: int = 5,
                   threshold: float = 0.5, seed: int = 42) -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    if model not in ("logistic", "random_forest"):
        raise ValidationAppError("model must be 'logistic' or 'random_forest'")
    if not 1 <= horizon <= 60:
        raise ValidationAppError("horizon must be between 1 and 60 bars")
    stock = market_data.stock(symbol)
    df = market_data.candles(stock, timeframe).reset_index(drop=True)
    X_all = build_features(df)
    c = df["close"].to_numpy(float)
    fwd = np.full(len(c), np.nan)
    fwd[:-horizon] = c[horizon:] / c[:-horizon] - 1
    y_all = (fwd > 0).astype(float)
    y_all[np.isnan(fwd)] = np.nan
    valid = X_all.notna().all(axis=1).to_numpy() & ~np.isnan(y_all)
    idx = np.where(valid)[0]
    if len(idx) < 200:
        raise InsufficientDataError(f"Need at least 200 labelled bars for an ML experiment; have {len(idx)}")
    X, y = X_all.iloc[idx].to_numpy(), y_all[idx].astype(int)

    def make():
        if model == "logistic":
            return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=0.5, random_state=seed))
        return RandomForestClassifier(n_estimators=200, max_depth=5, min_samples_leaf=20, random_state=seed, n_jobs=1)

    tss = TimeSeriesSplit(n_splits=5, gap=horizon)
    proba = np.full(len(idx), np.nan)
    folds = []
    for k, (tr, te) in enumerate(tss.split(X)):
        m = make()
        m.fit(X[tr], y[tr])
        p = m.predict_proba(X[te])[:, 1]
        proba[te] = p
        pred = (p >= threshold).astype(int)
        folds.append({"fold": k + 1, "train_size": int(len(tr)), "test_size": int(len(te)),
                      "accuracy": round(float(accuracy_score(y[te], pred)), 4),
                      "f1": round(float(f1_score(y[te], pred, zero_division=0)), 4),
                      "base_rate_up": round(float(y[te].mean()), 4)})
    oos = ~np.isnan(proba)
    yt, pp = y[oos], (proba[oos] >= threshold).astype(int)
    cm = confusion_matrix(yt, pp, labels=[0, 1])
    majority = max(yt.mean(), 1 - yt.mean())
    metrics = {
        "accuracy": round(float(accuracy_score(yt, pp)), 4),
        "precision": round(float(precision_score(yt, pp, zero_division=0)), 4),
        "recall": round(float(recall_score(yt, pp, zero_division=0)), 4),
        "f1": round(float(f1_score(yt, pp, zero_division=0)), 4),
        "baseline_majority_accuracy": round(float(majority), 4),
        "confusion_matrix": {"labels": ["DOWN_OR_FLAT", "UP"], "matrix": cm.tolist()},
        "oos_samples": int(oos.sum()),
    }

    # strategy-level check on out-of-sample bars only
    oos_rows = idx[oos]
    first = int(oos_rows[0])
    seg = df.iloc[first:].reset_index(drop=True)
    long_sig = np.zeros(len(df), dtype=bool)
    long_sig[oos_rows] = proba[oos] >= threshold
    entries = long_sig[first:]
    exits = ~long_sig[first:]
    bt = run_backtest(seg, entries, exits, BacktestConfig())
    bpy = bars_per_year(timeframe)
    strat_m = compute_metrics(bt, float(seg["open"].iloc[0]), float(seg["close"].iloc[-1]), bpy, len(seg))

    importances = None
    full = make()
    full.fit(X, y)
    if model == "random_forest":
        importances = dict(zip(FEATURES, [round(float(x), 4) for x in full.feature_importances_]))
    else:
        coefs = full.named_steps["logisticregression"].coef_[0]
        importances = dict(zip(FEATURES, [round(float(x), 4) for x in coefs]))

    edge = metrics["accuracy"] - metrics["baseline_majority_accuracy"]
    notes = [
        f"Walk-forward TimeSeriesSplit (5 folds, gap={horizon} bars to purge overlapping labels); metrics are out-of-sample only.",
        f"Out-of-sample accuracy {metrics['accuracy']:.3f} vs majority-class baseline {metrics['baseline_majority_accuracy']:.3f} "
        f"({'+' if edge >= 0 else ''}{edge:.3f}).",
        "On simulated random-walk-like data, accuracy close to the baseline is the expected, honest outcome; any "
        "apparent edge may be noise.",
        "Strategy result includes default costs and slippage with next-bar-open execution.",
    ]
    return {
        "symbol": stock.symbol, "timeframe": timeframe, "data_source": stock.data_source, "model": model,
        "horizon": horizon, "target": f"close[t+{horizon}] > close[t]", "features": FEATURES, "folds": folds,
        "metrics": metrics, "strategy_backtest": strat_m, "feature_importance": importances, "notes": notes,
        "disclaimer": "Experimental, educational model evaluation. Not a forecast and not investment advice.",
    }
