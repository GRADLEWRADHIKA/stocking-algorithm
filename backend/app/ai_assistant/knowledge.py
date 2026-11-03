"""Local knowledge base of concept explanations (static educational text, no external sources)."""
from __future__ import annotations

CONCEPTS: dict[str, dict] = {
    "rsi": {"title": "Relative Strength Index (RSI)", "keywords": ["rsi", "relative strength"],
            "text": "RSI compares the size of recent gains to recent losses on a 0-100 scale using Wilder's smoothing "
                    "(default 14 bars). Readings above 70 are conventionally called overbought and below 30 oversold. "
                    "In strong trends RSI can stay at extremes for a long time, so it is usually combined with a trend filter."},
    "macd": {"title": "MACD", "keywords": ["macd", "moving average convergence"],
             "text": "MACD is the 12-period EMA minus the 26-period EMA. Its 9-period EMA is the signal line and the "
                     "difference between them is the histogram. A MACD crossover above the signal line indicates that "
                     "short-term momentum is improving relative to the longer-term trend; a cross below indicates the "
                     "opposite. Crossovers lag price and produce many false signals in sideways markets."},
    "bollinger": {"title": "Bollinger Bands", "keywords": ["bollinger", "bbands", "bands"],
                  "text": "Bollinger Bands plot a 20-period SMA with bands two standard deviations above and below. Band "
                          "width expands with volatility. A close outside a band is a statistically large move; mean-"
                          "reversion strategies wait for price to close back inside before acting."},
    "vwap": {"title": "VWAP", "keywords": ["vwap", "volume weighted"],
             "text": "VWAP is the volume-weighted average of the typical price. Intraday it is anchored to the session "
                     "open and resets daily; QuantDesk uses a rolling 20-bar VWAP on daily and higher timeframes. Price "
                     "above VWAP means recent buyers are, on average, in profit."},
    "atr": {"title": "Average True Range (ATR)", "keywords": ["atr", "average true range", "true range"],
            "text": "ATR is Wilder's smoothed average of the true range (largest of high-low, |high-prev close|, "
                    "|low-prev close|). It measures volatility in price units and is commonly used to size stops."},
    "adx": {"title": "ADX / DMI", "keywords": ["adx", "directional"],
            "text": "ADX measures trend strength (not direction) on a 0-100 scale; above ~25 is usually treated as a "
                    "trending market. +DI and -DI show which side is dominant."},
    "stochastic": {"title": "Stochastic Oscillator", "keywords": ["stochastic", "stoch"],
                   "text": "%K locates the close within the last N bars' high-low range (0-100); %D is its 3-bar average. "
                           "Above 80 / below 20 are conventional overbought/oversold zones."},
    "obv": {"title": "On-Balance Volume", "keywords": ["obv", "on-balance", "on balance"],
            "text": "OBV adds volume on up-closes and subtracts it on down-closes. Its direction is used to judge "
                    "whether volume confirms a price trend."},
    "moving_average": {"title": "Moving averages (SMA / EMA)", "keywords": ["moving average", "sma", "ema"],
                       "text": "An SMA is the plain average of the last N closes; an EMA weights recent closes more "
                               "(alpha = 2/(N+1)). Price above a rising average is the simplest definition of an uptrend."},
    "supertrend": {"title": "Supertrend", "keywords": ["supertrend", "super trend"],
                   "text": "Supertrend draws ATR-based bands around the bar midpoint (H+L)/2 at a multiple of ATR "
                           "(commonly 10, 3). The band only moves in the trend's direction, so it trails price like a "
                           "stop. A close above the upper band flips it up (the line becomes support); a close below "
                           "the lower band flips it down. It lags by design and whipsaws in ranges."},
    "max_drawdown": {"title": "Maximum drawdown", "keywords": ["drawdown", "max drawdown", "maximum drawdown"],
                     "text": "Maximum drawdown is the largest peak-to-trough fall of the equity curve, in percent: "
                             "max over time of (1 - equity / running peak). A 50% drawdown needs a 100% gain to recover, "
                             "so it is a key measure of how painful a strategy is to hold."},
    "sharpe": {"title": "Sharpe ratio", "keywords": ["sharpe"],
               "text": "Sharpe = mean(return) / std(return), annualized. QuantDesk uses per-bar returns, a 0% risk-free "
                       "rate and sqrt(bars per year). It rewards return per unit of total volatility; values from short "
                       "or simulated samples are noisy."},
    "sortino": {"title": "Sortino ratio", "keywords": ["sortino"],
                "text": "Like Sharpe but divides by downside deviation only, so upside volatility is not penalized."},
    "profit_factor": {"title": "Profit factor", "keywords": ["profit factor"],
                      "text": "Gross profit of winning trades divided by gross loss of losing trades. Above 1 means the "
                              "strategy made more than it lost before considering capital usage."},
    "win_rate": {"title": "Win rate", "keywords": ["win rate", "hit rate"],
                 "text": "Share of closed trades with positive P&L. A low win rate can still be profitable when average "
                         "wins are much larger than average losses, and vice versa."},
    "stop_loss": {"title": "Stop-loss and take-profit", "keywords": ["stop loss", "stop-loss", "take profit", "take-profit", "target"],
                  "text": "A stop-loss exits a position when price moves against it by a predefined amount; a take-profit "
                          "exits at a predefined gain. QuantDesk's signals use 2x ATR stops and 3x ATR targets "
                          "(risk/reward 1.5) as illustrative defaults."},
    "position_sizing": {"title": "Position sizing", "keywords": ["position size", "position sizing", "how many shares", "risk per trade"],
                        "text": "Fixed-fractional sizing risks a fixed percent of capital per trade: quantity = "
                                "(capital x risk%) / (entry - stop). Wider stops therefore mean smaller positions."},
    "backtesting": {"title": "Backtesting", "keywords": ["backtest", "backtesting"],
                    "text": "A backtest replays historical bars through a rule set. QuantDesk evaluates signals on a bar's "
                            "close and fills at the next open with slippage and costs, so results cannot use future data. "
                            "Backtests describe the past; they do not predict the future."},
    "look_ahead": {"title": "Look-ahead bias", "keywords": ["look-ahead", "lookahead", "look ahead", "future data"],
                   "text": "Look-ahead bias happens when a test uses information that was not available at decision time "
                           "(e.g. trading at the same bar's close that generated the signal using that close's high)."},
    "slippage": {"title": "Slippage and transaction costs", "keywords": ["slippage", "brokerage", "transaction cost", "costs"],
                 "text": "Slippage is the gap between the expected and actual fill price. QuantDesk applies a basis-point "
                         "slippage adversely plus brokerage (capped per order) and a percentage for statutory charges."},
    "overfitting": {"title": "Overfitting", "keywords": ["overfit", "curve fit", "curve-fit", "optimiz"],
                    "text": "Tuning many parameters to past data tends to fit noise. Out-of-sample testing (the last part of "
                            "the period held back) helps reveal it."},
    "volatility": {"title": "Volatility", "keywords": ["volatility", "volatile", "historical volatility"],
                   "text": "Historical volatility is the annualized standard deviation of log returns (20 bars by default). "
                           "Higher volatility means wider price swings in both directions."},
    "beta": {"title": "Beta", "keywords": ["beta"],
             "text": "Beta is cov(stock, market) / var(market) of daily returns. QuantDesk measures it against its "
                     "simulated NIFTY50 aggregate."},
    "var": {"title": "Value at Risk (VaR)", "keywords": ["value at risk", " var "],
            "text": "1-day 95% historical VaR is the loss exceeded on only 5% of past days, using the portfolio's current "
                    "weights on recent daily returns. It says nothing about how large losses beyond it can be."},
    "support_resistance": {"title": "Support and resistance", "keywords": ["support", "resistance"],
                           "text": "Levels where price previously turned. QuantDesk clusters confirmed swing highs/lows "
                                   "(3 bars each side) within about half an ATR to find them."},
    "regime": {"title": "Market regime", "keywords": ["regime"],
               "text": "QuantDesk labels each instrument BULL_TREND, BEAR_TREND, RANGE_BOUND or HIGH_VOLATILITY using EMA "
                       "structure, ADX and volatility relative to its own history. Different strategy styles tend to suit "
                       "different regimes."},
}

STRATEGY_RISKS: dict[str, list[str]] = {
    "ma_crossover": ["Whipsaws in sideways markets generate repeated small losses.",
                     "Crossovers lag: entries come after part of the move and exits give back gains."],
    "rsi": ["Oversold can stay oversold in strong downtrends; the trend filter reduces but does not remove this.",
            "Few signals when the trend filter is on, so statistics rest on small samples."],
    "macd": ["Signal-line crosses are frequent and noisy in ranges.", "Lagging EMAs make exits late after sharp reversals."],
    "bollinger": ["Mean reversion fails when a breakout starts: price can keep riding the band.",
                  "Exits at the middle band cap upside while losses are not capped without a stop."],
    "vwap": ["On daily bars a rolling VWAP is only an approximation of intraday VWAP behaviour.",
             "Volume spikes can be one-off events that do not persist."],
    "momentum": ["Momentum crashes: sharp reversals after strong runs can be costly.",
                 "Threshold choice strongly affects trade count (overfitting risk)."],
    "breakout": ["False breakouts: price closes above resistance and immediately reverses.",
                 "Entries happen after large up-bars, so stops placed at ATR distances can be wide."],
    "trend_following": ["Low win rate is typical; profits rely on a few large trends.",
                        "Needs long warm-up (EMA200) and gives back profits at trend ends."],
    "supertrend": ["In sideways markets the line flips often, producing repeated small losses; the ADX filter reduces "
                   "but does not remove this.",
                   "The exit waits for a close beyond a band 3 ATR away, so a sharp reversal can give back a large "
                   "part of the gain or gap through the line."],
}
