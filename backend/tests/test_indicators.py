"""Indicator math against hand-computed / published reference values."""
import numpy as np
import pandas as pd
import pytest

from app.indicators import core
from app.indicators.registry import IndicatorError, parse_specs, resolve_params

# Classic Wilder RSI example (StockCharts "RSI" ChartSchool table)
RSI_CLOSES = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931,
              46.0328, 45.6140, 46.2820, 46.2820, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521,
              45.7137, 46.4515, 45.7835, 45.3528, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314]
RSI_EXPECTED = {14: 70.53, 15: 66.32, 16: 66.55, 17: 69.41, 18: 66.36, 19: 57.97, 20: 62.93, 26: 39.99, 32: 37.77}


def test_sma_simple():
    out = core.sma([1, 2, 3, 4, 5], 3)
    assert np.isnan(out[:2]).all()
    assert out[2:].tolist() == [2.0, 3.0, 4.0]


def test_ema_seeded_with_sma():
    out = core.ema([2, 4, 6, 8, 12], 3)  # alpha = 0.5, seed = mean(2,4,6) = 4
    assert np.isnan(out[:2]).all()
    assert out[2] == pytest.approx(4.0)
    assert out[3] == pytest.approx(6.0)
    assert out[4] == pytest.approx(9.0)


def test_rsi_wilder_reference_values():
    r = core.rsi(RSI_CLOSES, 14)
    assert np.isnan(r[:14]).all()
    for idx, exp in RSI_EXPECTED.items():
        assert r[idx] == pytest.approx(exp, abs=0.02), idx


def test_rsi_all_gains_is_100():
    assert core.rsi(list(range(1, 30)), 14)[-1] == 100.0


def test_macd_consistency():
    c = np.cumsum(np.random.default_rng(1).normal(0, 1, 200)) + 100
    m = core.macd(c)
    line = core.ema(c, 12) - core.ema(c, 26)
    np.testing.assert_allclose(m["macd"], line, equal_nan=True)
    np.testing.assert_allclose(m["signal"], core.ema(line, 9), equal_nan=True)
    first_signal = np.where(~np.isnan(m["signal"]))[0][0]
    assert first_signal == 25 + 8  # slow EMA needs 26 bars, signal needs 9 MACD values
    np.testing.assert_allclose(m["histogram"], m["macd"] - m["signal"], equal_nan=True)


def test_bollinger_population_std():
    bb = core.bbands([1, 2, 3, 4], 4, 2)
    assert bb["middle"][-1] == pytest.approx(2.5)
    assert bb["upper"][-1] == pytest.approx(2.5 + 2 * np.sqrt(1.25))
    assert bb["lower"][-1] == pytest.approx(2.5 - 2 * np.sqrt(1.25))


def test_atr_wilder_hand_computed():
    a = core.atr([10, 11, 12], [9, 10, 10], [9.5, 10.5, 11], 2)
    assert np.isnan(a[0])
    assert a[1] == pytest.approx(1.25)
    assert a[2] == pytest.approx(1.625)


def test_stochastic():
    st = core.stochastic([3, 4, 5], [1, 2, 3], [2, 3, 4], 3, 1)
    assert st["k"][-1] == pytest.approx(75.0)
    assert st["d"][-1] == pytest.approx(75.0)


def test_obv_and_roc():
    assert core.obv([10, 11, 10, 10, 12], [100, 200, 300, 400, 500]).tolist() == [0, 200, -100, -100, 400]
    assert core.roc([10, 11, 12], 2)[-1] == pytest.approx(20.0)


def test_adx_trending_series():
    n = 80
    h = np.linspace(101, 180, n)
    lo = h - 2
    c = h - 0.5
    ad = core.adx(h, lo, c, 14)
    first = np.where(~np.isnan(ad["adx"]))[0][0]
    assert first == 2 * 14 - 1
    assert ad["plus_di"][-1] > ad["minus_di"][-1]
    assert 50 < ad["adx"][-1] <= 100


def test_vwap_session_resets_each_day():
    base1, base2 = 1793072700, 1793072700 + 86400
    t = [base1, base1 + 60, base2, base2 + 60]
    h, lo, c, v = [11, 13, 21, 23], [9, 11, 19, 21], [10, 12, 20, 22], [100, 100, 100, 300]
    vw = core.vwap_session(t, h, lo, c, v)
    assert vw[1] == pytest.approx(11.0)
    assert vw[2] == pytest.approx(20.0)  # reset at the new session
    assert vw[3] == pytest.approx((20 * 100 + 22 * 300) / 400)


def test_crosses():
    a, b = [1, 2, 3, 1], [2, 2, 2, 2]
    assert core.crosses_above(a, b).tolist() == [False, False, True, False]
    assert core.crosses_below(a, b).tolist() == [False, False, False, True]


def test_historical_volatility_constant_growth_is_zero():
    c = 100 * np.exp(0.01 * np.arange(40))
    assert core.historical_volatility(c, 20)[-1] == pytest.approx(0.0, abs=1e-9)


def test_indicators_are_causal():
    rng = np.random.default_rng(3)
    c = 100 + np.cumsum(rng.normal(0, 1, 300))
    h, lo, v = c + 1, c - 1, rng.integers(1000, 5000, 300).astype(float)
    k = 200
    full = {"rsi": core.rsi(c, 14), "ema": core.ema(c, 20), "atr": core.atr(h, lo, c, 14), "adx": core.adx(h, lo, c, 14)["adx"]}
    c2 = c.copy()
    c2[k:] *= 3  # change the future
    h2, lo2 = c2 + 1, c2 - 1
    part = {"rsi": core.rsi(c2, 14), "ema": core.ema(c2, 20), "atr": core.atr(h2, lo2, c2, 14),
            "adx": core.adx(h2, lo2, c2, 14)["adx"]}
    for key in full:
        np.testing.assert_allclose(full[key][:k], part[key][:k], equal_nan=True, err_msg=key)
    _ = pd, v


def test_spec_parsing_and_validation():
    parsed = parse_specs("sma:20,macd:12:26:9,bbands:20:2,vwap")
    assert [p[0] for p in parsed] == ["sma", "macd", "bbands", "vwap"]
    assert parsed[1][1] == {"fast": 12, "slow": 26, "signal": 9}
    with pytest.raises(IndicatorError):
        parse_specs("nope:3")
    with pytest.raises(IndicatorError):
        resolve_params("rsi", {"period": 1000})
    with pytest.raises(IndicatorError):
        resolve_params("macd", {"fast": 30, "slow": 26})


# ---------------------------------------------------------------- Supertrend
# Hand-computed: bars of range +/-1 around the close, closes 10,11,12,13 then a drop to 8; ATR(2), multiplier 1.
#   t=1 seed: ATR=2, HL2=11 -> up, bands 13/9, line 9
#   t=2: lower band ratchets 9->10, line 10; t=3: lower 11, line 11
#   t=4: TR=6 -> ATR=4, close 8 < previous lower band 11 -> flips down, line = new upper band min(12, 13) = 12
def test_supertrend_hand_computed():
    c = np.array([10, 11, 12, 13, 8], dtype=float)
    st = core.supertrend(c + 1, c - 1, c, n=2, mult=1.0)
    assert np.isnan(st["value"][0]) and np.isnan(st["direction"][0])
    assert st["direction"][1:].tolist() == [1, 1, 1, -1]
    assert np.allclose(st["value"][1:], [9, 10, 11, 12])


def test_supertrend_trails_and_is_causal():
    rng = np.random.default_rng(3)
    c = 100 * np.exp(np.cumsum(rng.normal(0.001, 0.015, 300)))
    h, lo = c * 1.01, c * 0.99
    st = core.supertrend(h, lo, c, 10, 3.0)
    d, line = st["direction"], st["value"]
    ok = ~np.isnan(d)
    # in an uptrend the line is never above the close; in a downtrend never below it
    assert (line[ok & (d > 0)] <= c[ok & (d > 0)] + 1e-9).all()
    assert (line[ok & (d < 0)] >= c[ok & (d < 0)] - 1e-9).all()
    # while the trend stays up the trailing line never moves down
    for t in range(1, len(c)):
        if d[t] > 0 and d[t - 1] > 0:
            assert line[t] >= line[t - 1] - 1e-9
    short = core.supertrend(h[:200], lo[:200], c[:200], 10, 3.0)
    assert np.allclose(short["value"], line[:200], equal_nan=True)


def test_supertrend_registry_params():
    assert parse_specs("supertrend")[0] == ("supertrend", {"period": 10, "multiplier": 3.0})
    with pytest.raises(IndicatorError):
        resolve_params("supertrend", {"multiplier": 20})
