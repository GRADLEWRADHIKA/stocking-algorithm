"""Support/resistance via swing-pivot clustering (causal).

A swing high at bar i is confirmed only at bar i+k (needs k bars on the right), so at evaluation bar t
only pivots with i <= t-k are used. Nearby pivots (within `tolerance` = max(0.5*ATR, 1% of price))
are clustered; each cluster's level is the mean of its pivots and its strength the number of touches.
"""
from __future__ import annotations

import numpy as np


def swing_pivots(high, low, k: int = 3, upto: int | None = None) -> tuple[list[int], list[int]]:
    h = np.asarray(high, dtype=float)
    lo = np.asarray(low, dtype=float)
    n = len(h) if upto is None else min(len(h), upto + 1)
    highs, lows = [], []
    for i in range(k, n - k):
        wh = h[i - k: i + k + 1]
        wl = lo[i - k: i + k + 1]
        if h[i] == wh.max() and (wh[:k] < h[i]).all():
            highs.append(i)
        if lo[i] == wl.min() and (wl[:k] > lo[i]).all():
            lows.append(i)
    return highs, lows


def _cluster(prices: list[float], tol: float) -> list[tuple[float, int]]:
    if not prices:
        return []
    ps = sorted(prices)
    clusters: list[list[float]] = [[ps[0]]]
    for p in ps[1:]:
        if p - np.mean(clusters[-1]) <= tol:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return [(float(np.mean(c)), len(c)) for c in clusters]


def support_resistance(high, low, close, atr_value: float | None = None, k: int = 3, lookback: int = 250,
                       max_levels: int = 3) -> dict[str, list[float]]:
    h = np.asarray(high, dtype=float)
    lo = np.asarray(low, dtype=float)
    c = np.asarray(close, dtype=float)
    if len(c) < 2 * k + 2:
        return {"supports": [], "resistances": []}
    start = max(0, len(c) - lookback)
    hs, ls = swing_pivots(h[start:], lo[start:], k)
    price = float(c[-1])
    tol = max(0.5 * (atr_value or 0.0), 0.01 * price)
    levels = _cluster([float(h[start + i]) for i in hs] + [float(lo[start + i]) for i in ls], tol)
    supports = sorted([lv for lv in levels if lv[0] < price], key=lambda x: (price - x[0]))
    resist = sorted([lv for lv in levels if lv[0] > price], key=lambda x: (x[0] - price))
    return {
        "supports": [round(lv[0], 2) for lv in supports[:max_levels]],
        "resistances": [round(lv[0], 2) for lv in resist[:max_levels]],
    }
