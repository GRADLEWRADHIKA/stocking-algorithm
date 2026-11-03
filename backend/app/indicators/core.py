"""Technical indicators implemented with numpy/pandas (no TA-Lib). All are strictly causal:
the value at bar t uses only bars <= t. Leading values without enough history are NaN.

Definitions
  SMA(n)       simple rolling mean.
  EMA(n)       alpha = 2/(n+1), seeded with the SMA of the first n valid values.
  RSI(n)       Wilder: first avg gain/loss = simple mean of first n changes, then
               avg = (prev_avg*(n-1) + current)/n. RSI = 100 - 100/(1+avg_gain/avg_loss).
  MACD(f,s,g)  EMA_f - EMA_s; signal = EMA_g(MACD) (seeded with SMA); histogram = MACD - signal.
  BBANDS(n,k)  middle = SMA(n); upper/lower = middle +/- k * population std (ddof=0).
  VWAP         intraday: session-anchored cumulative sum(TP*V)/sum(V) reset each session;
               daily+ timeframes: rolling n-bar sum(TP*V)/sum(V) (TP = (H+L+C)/3), default n=20.
  ATR(n)       Wilder smoothing of True Range; TR[0] = H-L; first ATR = mean(TR[0..n-1]).
  ADX(n)       Wilder: +DM/-DM smoothed with Wilder's method, +DI/-DI = 100*smDM/ATR,
               DX = 100*|+DI - -DI|/(+DI + -DI), ADX = Wilder average of DX (seeded with mean of first n DX).
  STOCH(k,d)   %K = 100*(C - LL_k)/(HH_k - LL_k); %D = SMA_d(%K).
  OBV          cumulative sum of sign(close change) * volume (starts at 0).
  ROC(n)       100 * (C_t / C_{t-n} - 1).
  HV(n)        stdev of n log returns (ddof=1) * sqrt(bars_per_year) * 100.
  SUPERTREND   ATR(n) bands at HL2 +/- k*ATR that ratchet with the trend; direction +1/-1 flips on a
               close beyond the previous band (see supertrend()).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _arr(x) -> np.ndarray:
    return np.asarray(x, dtype=float)


def sma(values, n: int) -> np.ndarray:
    s = pd.Series(_arr(values))
    return s.rolling(n, min_periods=n).mean().to_numpy()


def ema(values, n: int) -> np.ndarray:
    x = _arr(values)
    out = np.full(len(x), np.nan)
    if n <= 0 or len(x) == 0:
        return out
    valid = ~np.isnan(x)
    # first index where n consecutive valid values end
    run = 0
    seed_idx = -1
    for i in range(len(x)):
        run = run + 1 if valid[i] else 0
        if run >= n:
            seed_idx = i
            break
    if seed_idx < 0:
        return out
    alpha = 2.0 / (n + 1.0)
    prev = float(np.mean(x[seed_idx - n + 1: seed_idx + 1]))
    out[seed_idx] = prev
    for i in range(seed_idx + 1, len(x)):
        if np.isnan(x[i]):
            out[i] = prev  # carry forward through gaps
            continue
        prev = alpha * x[i] + (1 - alpha) * prev
        out[i] = prev
    return out


def wilder_smooth(values, n: int, start: int = 0) -> np.ndarray:
    """Wilder's moving average (alpha = 1/n) seeded with simple mean of values[start:start+n]."""
    x = _arr(values)
    out = np.full(len(x), np.nan)
    if len(x) < start + n:
        return out
    prev = float(np.mean(x[start:start + n]))
    out[start + n - 1] = prev
    for i in range(start + n, len(x)):
        prev = (prev * (n - 1) + x[i]) / n
        out[i] = prev
    return out


def rsi(close, n: int = 14) -> np.ndarray:
    c = _arr(close)
    out = np.full(len(c), np.nan)
    if len(c) <= n:
        return out
    delta = np.diff(c)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_g = wilder_smooth(gain, n)
    avg_l = wilder_smooth(loss, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = avg_g / avg_l
        r = 100.0 - 100.0 / (1.0 + rs)
    r = np.where((avg_l == 0) & (avg_g > 0), 100.0, r)
    r = np.where((avg_l == 0) & (avg_g == 0), 50.0, r)
    out[1:] = r
    return out


def macd(close, fast: int = 12, slow: int = 26, signal: int = 9) -> dict[str, np.ndarray]:
    c = _arr(close)
    line = ema(c, fast) - ema(c, slow)
    sig = ema(line, signal)
    return {"macd": line, "signal": sig, "histogram": line - sig}


def bbands(close, n: int = 20, k: float = 2.0) -> dict[str, np.ndarray]:
    s = pd.Series(_arr(close))
    mid = s.rolling(n, min_periods=n).mean()
    sd = s.rolling(n, min_periods=n).std(ddof=0)
    return {"upper": (mid + k * sd).to_numpy(), "middle": mid.to_numpy(), "lower": (mid - k * sd).to_numpy()}


def typical_price(high, low, close) -> np.ndarray:
    return (_arr(high) + _arr(low) + _arr(close)) / 3.0


def vwap_session(times, high, low, close, volume) -> np.ndarray:
    """Session-anchored VWAP for intraday bars (resets at each IST trading day)."""
    t = np.asarray(times, dtype=np.int64)
    day = (t + 19800) // 86400
    tp = typical_price(high, low, close)
    v = _arr(volume)
    df = pd.DataFrame({"d": day, "pv": tp * v, "v": v})
    cpv = df.groupby("d")["pv"].cumsum().to_numpy()
    cv = df.groupby("d")["v"].cumsum().to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(cv > 0, cpv / cv, tp)
    return out


def vwap_rolling(high, low, close, volume, n: int = 20) -> np.ndarray:
    tp = typical_price(high, low, close)
    v = _arr(volume)
    pv = pd.Series(tp * v).rolling(n, min_periods=n).sum()
    vs = pd.Series(v).rolling(n, min_periods=n).sum()
    with np.errstate(divide="ignore", invalid="ignore"):
        return (pv / vs.replace(0, np.nan)).to_numpy()


def true_range(high, low, close) -> np.ndarray:
    h, lo, c = _arr(high), _arr(low), _arr(close)
    prev_c = np.concatenate([[np.nan], c[:-1]])
    tr = np.nanmax(np.vstack([h - lo, np.abs(h - prev_c), np.abs(lo - prev_c)]), axis=0)
    tr[0] = h[0] - lo[0] if len(h) else np.nan
    return tr


def atr(high, low, close, n: int = 14) -> np.ndarray:
    return wilder_smooth(true_range(high, low, close), n)


def adx(high, low, close, n: int = 14) -> dict[str, np.ndarray]:
    h, lo, c = _arr(high), _arr(low), _arr(close)
    L = len(c)
    nan = np.full(L, np.nan)
    if L < 2 * n + 1:
        return {"adx": nan.copy(), "plus_di": nan.copy(), "minus_di": nan.copy()}
    up = np.diff(h)
    down = -np.diff(lo)
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    tr = true_range(h, lo, c)[1:]
    # Wilder smoothing (averages; DI ratios identical to Wilder's running sums)
    s_tr = wilder_smooth(tr, n)
    s_p = wilder_smooth(plus_dm, n)
    s_m = wilder_smooth(minus_dm, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100.0 * s_p / s_tr
        mdi = 100.0 * s_m / s_tr
        dx = 100.0 * np.abs(pdi - mdi) / (pdi + mdi)
    dx = np.where((pdi + mdi) == 0, 0.0, dx)
    first = n - 1  # first valid DI index in the diff-space arrays
    adx_d = np.full(len(dx), np.nan)
    if len(dx) >= first + n:
        adx_d = wilder_smooth(np.where(np.isnan(dx), 0.0, dx), n, start=first)
        adx_d[: first + n - 1] = np.nan
    out_adx, out_p, out_m = nan.copy(), nan.copy(), nan.copy()
    out_adx[1:] = adx_d
    out_p[1:] = pdi
    out_m[1:] = mdi
    return {"adx": out_adx, "plus_di": out_p, "minus_di": out_m}


def stochastic(high, low, close, k: int = 14, d: int = 3) -> dict[str, np.ndarray]:
    hh = pd.Series(_arr(high)).rolling(k, min_periods=k).max()
    ll = pd.Series(_arr(low)).rolling(k, min_periods=k).min()
    rng = (hh - ll).replace(0, np.nan)
    kk = 100.0 * (pd.Series(_arr(close)) - ll) / rng
    kk = kk.where(~((hh - ll) == 0), 50.0)
    dd = kk.rolling(d, min_periods=d).mean()
    return {"k": kk.to_numpy(), "d": dd.to_numpy()}


def obv(close, volume) -> np.ndarray:
    c, v = _arr(close), _arr(volume)
    if len(c) == 0:
        return c
    sign = np.sign(np.diff(c))
    return np.concatenate([[0.0], np.cumsum(sign * v[1:])])


def roc(close, n: int = 10) -> np.ndarray:
    c = _arr(close)
    out = np.full(len(c), np.nan)
    if len(c) > n:
        with np.errstate(divide="ignore", invalid="ignore"):
            out[n:] = 100.0 * (c[n:] / c[:-n] - 1.0)
    return out


def log_returns(close) -> np.ndarray:
    c = _arr(close)
    out = np.full(len(c), np.nan)
    if len(c) > 1:
        out[1:] = np.log(c[1:] / c[:-1])
    return out


def historical_volatility(close, n: int = 20, bars_per_year: float = 252.0) -> np.ndarray:
    lr = pd.Series(log_returns(close))
    return (lr.rolling(n, min_periods=n).std(ddof=1) * np.sqrt(bars_per_year) * 100.0).to_numpy()


def supertrend(high, low, close, n: int = 10, mult: float = 3.0) -> dict[str, np.ndarray]:
    """Supertrend: ATR bands around HL2 that only ratchet in the trend's direction.

    basic_upper = HL2 + mult*ATR, basic_lower = HL2 - mult*ATR
    final_upper[t] = basic_upper[t] if basic_upper[t] < final_upper[t-1] or close[t-1] > final_upper[t-1] else final_upper[t-1]
    final_lower[t] = basic_lower[t] if basic_lower[t] > final_lower[t-1] or close[t-1] < final_lower[t-1] else final_lower[t-1]
    direction flips to +1 when close > previous final_upper, to -1 when close < previous final_lower.
    value = final_lower while direction is +1 (support / trailing stop), final_upper while -1.
    """
    h, lo, c = _arr(high), _arr(low), _arr(close)
    L = len(c)
    value, direction = np.full(L, np.nan), np.full(L, np.nan)
    a = atr(h, lo, c, n)
    hl2 = (h + lo) / 2.0
    bu, bl = hl2 + mult * a, hl2 - mult * a
    start = int(np.argmax(~np.isnan(a))) if L and not np.isnan(a).all() else L
    if start >= L:
        return {"value": value, "direction": direction}
    fu, fl, d = bu[start], bl[start], 1.0 if c[start] >= hl2[start] else -1.0
    value[start], direction[start] = (fl if d > 0 else fu), d
    for t in range(start + 1, L):
        nfu = bu[t] if (bu[t] < fu or c[t - 1] > fu) else fu
        nfl = bl[t] if (bl[t] > fl or c[t - 1] < fl) else fl
        if c[t] > fu:
            d = 1.0
        elif c[t] < fl:
            d = -1.0
        fu, fl = nfu, nfl
        value[t], direction[t] = (fl if d > 0 else fu), d
    return {"value": value, "direction": direction}


def rolling_max(values, n: int) -> np.ndarray:
    return pd.Series(_arr(values)).rolling(n, min_periods=n).max().to_numpy()


def rolling_min(values, n: int) -> np.ndarray:
    return pd.Series(_arr(values)).rolling(n, min_periods=n).min().to_numpy()


def shift(values, k: int = 1) -> np.ndarray:
    x = _arr(values)
    out = np.full(len(x), np.nan)
    if k < len(x):
        out[k:] = x[:-k] if k > 0 else x
    return out


def crosses_above(a, b) -> np.ndarray:
    a, b = _arr(a), _arr(b)
    pa, pb = shift(a), shift(b)
    with np.errstate(invalid="ignore"):
        res = (a > b) & (pa <= pb)
    return np.nan_to_num(res, nan=0).astype(bool) & ~np.isnan(a) & ~np.isnan(b) & ~np.isnan(pa) & ~np.isnan(pb)


def crosses_below(a, b) -> np.ndarray:
    a, b = _arr(a), _arr(b)
    pa, pb = shift(a), shift(b)
    with np.errstate(invalid="ignore"):
        res = (a < b) & (pa >= pb)
    return np.nan_to_num(res, nan=0).astype(bool) & ~np.isnan(a) & ~np.isnan(b) & ~np.isnan(pa) & ~np.isnan(pb)
