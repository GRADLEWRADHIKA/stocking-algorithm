/**
 * COPY of E:/Stock-trading/shared/types/api.ts (QuantDesk API contract).
 * Source of truth: <repo>/shared/types/api.ts — keep this file in sync when the contract changes.
 * Copied verbatim below (do not edit by hand; re-copy instead).
 *
 * Backend notes not spelled out in the contract (confirmed against the running API):
 *  - indicator catalog includes roc, hv and supertrend (lines `value` and `direction` = +1 up / -1 down)
 *  - 9 built-in strategies incl. `supertrend`
 *  - validation errors are {detail, code, errors?: string[]}
 *  - create endpoints return 201; an order refused for funds/holdings returns 201 with status REJECTED
 */

/**
 * QuantDesk API contract — single source of truth shared by web and mobile.
 * Backend (FastAPI) Pydantic schemas mirror these shapes exactly.
 *
 * Conventions
 *  - All REST routes are prefixed with /api.
 *  - Money/price values are JSON numbers (DB stores DECIMAL).
 *  - Candle/series `time` is a UNIX timestamp in seconds (UTC).
 *  - Other timestamps are ISO-8601 strings with timezone offset.
 *  - Every market-data payload carries `data_source` so the UI can label it.
 *  - Errors: { detail: string, code?: string } with proper HTTP status.
 */

export type DataSource = 'HISTORICAL_DATASET' | 'SIMULATED' | 'PAPER_TRADING' | 'DEMO_ANALYSIS';
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
export type Role = 'USER' | 'ADMIN';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

// ---------------------------------------------------------------- auth / users
export interface UserPreferences {
  theme: 'dark' | 'light';
  default_timeframe: Timeframe;
  default_exchange: 'NSE' | 'BSE';
  chart_config: Record<string, unknown>; // saved indicator/chart layout
}
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  preferences: UserPreferences;
}
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number; // seconds
  user: User;
}
// POST /api/auth/register      {email, password, full_name}            -> TokenResponse
// POST /api/auth/login         {email, password}                       -> TokenResponse
// POST /api/auth/refresh       {refresh_token}                         -> TokenResponse
// POST /api/auth/logout        {refresh_token}                         -> {message}
// POST /api/auth/password-reset/request {email} -> {message, dev_reset_token?: string}  (token only returned when ENV=development)
// POST /api/auth/password-reset/confirm {token, new_password}          -> {message}
// GET  /api/users/me                                                   -> User
// PATCH /api/users/me          {full_name?}                            -> User
// PATCH /api/users/me/preferences  Partial<UserPreferences>            -> User

// ---------------------------------------------------------------- market
export interface Quote {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  sector: string;
  price: number;
  prev_close: number;
  change: number;
  change_pct: number;
  volume: number;
  data_source: DataSource;
}
export interface IndexQuote {
  symbol: string; // NIFTY50, SENSEX, NIFTYBANK, NIFTYIT, NIFTYMIDCAP
  name: string;
  value: number;
  change: number;
  change_pct: number;
  sparkline: number[]; // last ~60 closes
  data_source: DataSource;
}
export interface SectorPerformance {
  sector: string;
  change_pct: number;
  advancers: number;
  decliners: number;
  count: number;
}
export interface MarketOverview {
  as_of: string;
  data_source: DataSource;
  indices: IndexQuote[];
  breadth: { advancers: number; decliners: number; unchanged: number };
  top_gainers: Quote[];
  top_losers: Quote[];
  most_active: Quote[]; // by traded value
  highest_volume: Quote[];
  sectors: SectorPerformance[];
  market_summary: string[]; // rule-generated sentences, computed from the data above
}
// GET /api/market/overview?date=YYYY-MM-DD   -> MarketOverview  (date optional: replays the session as of that day)
// GET /api/market/indices                    -> IndexQuote[]
// GET /api/market/status -> {session: 'OPEN'|'CLOSED'|'PRE_OPEN', simulator_running: boolean, data_source: DataSource, as_of: string}
// WS  /ws/market?symbols=RELIANCE,TCS  (no auth needed)  server pushes:
export interface TickMessage {
  type: 'tick';
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  time: number;
  data_source: 'SIMULATED';
}
// also {type:'index', symbol, value, change, change_pct, time} and {type:'notification', notification: Notification} (when ?token=<access> passed)

// ---------------------------------------------------------------- stocks
export interface StockSummary extends Quote {
  market_cap: number | null; // INR crore
  sparkline: number[]; // last 30 daily closes
}
export interface Paginated<T> { items: T[]; total: number; limit: number; offset: number }
export type ScreenKey = 'gainers' | 'losers' | 'momentum' | 'breakout' | 'ma_crossover' | 'high_volatility' | 'oversold' | 'overbought';
// GET /api/stocks?q=&exchange=&sector=&min_price=&max_price=&min_volume=&min_mcap=&max_mcap=&screen=<ScreenKey>&sort=change_pct|-change_pct|volume|-volume|price|-price|symbol&limit=50&offset=0
//   -> Paginated<StockSummary>
// GET /api/stocks/sectors -> string[]
// POST /api/stocks/screen {logic: 'AND'|'OR', conditions: RuleCondition[], timeframe?: Timeframe} -> Paginated<StockSummary & {matched: string[]}>

export interface Fundamentals {
  market_cap: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  book_value: number | null;
  face_value: number | null;
  data_source: DataSource;
}
export interface StockDetail extends StockSummary {
  isin: string | null;
  description: string;
  fundamentals: Fundamentals;
  performance: Record<'1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y', number | null>; // percent returns
  stats: {
    high_52w: number; low_52w: number; avg_volume_20d: number;
    volatility_annualized: number; // percent
    beta: number | null; day_high: number; day_low: number; open: number;
  };
  available_timeframes: Timeframe[];
}
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface CandleResponse {
  symbol: string;
  timeframe: Timeframe;
  data_source: DataSource;
  candles: Candle[];
  available_timeframes: Timeframe[];
}
// GET /api/stocks/{symbol}                                    -> StockDetail
// GET /api/stocks/{symbol}/candles?timeframe=1d&start=&end=&limit=500 -> CandleResponse

// ---------------------------------------------------------------- indicators
export interface SeriesPoint { time: number; value: number }
export interface IndicatorSeries {
  id: string;           // e.g. "sma_20", "macd_12_26_9"
  indicator: string;    // "sma"
  name: string;         // "SMA(20)"
  pane: 'overlay' | 'separate';
  params: Record<string, number>;
  lines: Record<string, SeriesPoint[]>; // single-line indicators use key "value"; macd: macd/signal/histogram; bb: upper/middle/lower; stoch: k/d; adx: adx/plus_di/minus_di
}
// GET /api/indicators/catalog -> IndicatorMeta[]
export interface IndicatorMeta {
  key: string; // sma ema rsi macd bbands vwap atr adx stoch obv volume_sma
  name: string;
  pane: 'overlay' | 'separate';
  params: { name: string; label: string; default: number; min: number; max: number; step: number }[];
  fields: string[]; // selectable output fields for strategy builder, e.g. ["value"], ["macd","signal","histogram"]
  description: string;
}
// GET /api/indicators/{symbol}?timeframe=1d&specs=sma:20,ema:50,rsi:14,macd:12:26:9,bbands:20:2,vwap,atr:14,adx:14,stoch:14:3,obv,volume_sma:20&limit=500
//   -> {symbol, timeframe, data_source, indicators: IndicatorSeries[]}

// ---------------------------------------------------------------- analysis & signals
export interface SignalCondition { description: string; satisfied: boolean; value: string | null }
export interface Signal {
  id: number | null;
  symbol: string;
  exchange: string;
  strategy: string;       // human name
  strategy_key: string;
  timeframe: Timeframe;
  timestamp: string;      // bar time the signal was evaluated on
  data_source: DataSource;
  action: SignalAction;
  price: number;
  entry_conditions: string[];
  exit_conditions: string[];
  indicator_values: Record<string, number | null>;
  conditions: SignalCondition[];
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  position_size: { quantity: number; capital_required: number; capital_at_risk: number; risk_per_trade_pct: number; assumed_capital: number } | null;
  strength: {
    score: number; // 0-100, deterministic weighted score of condition margins. NOT a probability.
    label: 'WEAK' | 'MODERATE' | 'STRONG';
    method: string;
    components: { name: string; weight: number; value: number }[];
  };
  historical_performance: { trades: number; win_rate: number | null; avg_return_pct: number | null; lookback: string; note: string } | null;
  explanation: string;
  disclaimer: string;
}
export interface StockAnalysis {
  symbol: string;
  timeframe: Timeframe;
  data_source: DataSource;
  as_of: string;
  price: number;
  trend: { direction: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS'; strength: 'WEAK' | 'MODERATE' | 'STRONG'; adx: number | null; ema_20: number | null; ema_50: number | null; sma_200: number | null; slope_20_pct: number | null };
  momentum: { rsi: number | null; roc_10: number | null; macd: number | null; macd_signal: number | null; macd_histogram: number | null; stoch_k: number | null; stoch_d: number | null; state: string };
  volatility: { atr: number | null; atr_pct: number | null; hist_vol_20: number | null; bb_width_pct: number | null; state: 'LOW' | 'NORMAL' | 'HIGH' };
  volume: { latest: number; avg_20: number; ratio: number; obv_trend: 'RISING' | 'FALLING' | 'FLAT' };
  levels: { supports: number[]; resistances: number[] };
  regime: { label: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND' | 'HIGH_VOLATILITY'; description: string };
  observations: string[];    // facts derived from data
  interpretations: string[]; // educational reading of those facts
  signals: Signal[];         // one per built-in strategy
}
// GET /api/analysis/{symbol}?timeframe=1d -> StockAnalysis
// GET /api/signals?symbol=&strategy_key=&action=&limit=50 -> Signal[]   (persisted recent signals across the universe)
// POST /api/signals/generate {symbol, strategy_key, timeframe?, params?, capital?, risk_per_trade_pct?} -> Signal
// POST /api/signals/scan {strategy_key?, timeframe?} -> Signal[]   (runs all strategies across universe, persists non-HOLD)

// ---------------------------------------------------------------- strategies (builtin + builder)
export interface BuiltinStrategy {
  key: string; // ma_crossover rsi macd bollinger vwap momentum breakout trend_following
  name: string;
  description: string;
  params: { name: string; label: string; type: 'int' | 'float'; default: number; min: number; max: number }[];
}
export type Operand =
  | { type: 'indicator'; indicator: string; params: Record<string, number>; field?: string }
  | { type: 'price'; field: 'open' | 'high' | 'low' | 'close' | 'volume' }
  | { type: 'constant'; value: number };
export type ComparisonOperator = '>' | '<' | '>=' | '<=' | 'crosses_above' | 'crosses_below';
export interface RuleCondition { left: Operand; operator: ComparisonOperator; right: Operand }
export interface RuleGroup { logic: 'AND' | 'OR'; conditions: RuleCondition[] }
export interface StrategyDefinition {
  entry: RuleGroup;
  exit: RuleGroup;
  risk: { stop_loss_pct: number | null; take_profit_pct: number | null; position_size_pct: number };
  timeframe: Timeframe;
}
export interface SavedStrategy {
  id: number;
  name: string;
  description: string;
  definition: StrategyDefinition;
  created_at: string;
  updated_at: string;
}
// GET  /api/strategies/builtin                         -> BuiltinStrategy[]
// GET  /api/strategies                                 -> SavedStrategy[]  (current user)
// POST /api/strategies {name, description, definition} -> SavedStrategy   (400 with validation errors when invalid)
// GET/PUT/DELETE /api/strategies/{id}
// POST /api/strategies/{id}/duplicate                  -> SavedStrategy
// POST /api/strategies/validate {definition}           -> {valid: boolean, errors: string[]}
// POST /api/strategies/evaluate {definition, symbol, timeframe?} -> Signal  (evaluates rules on latest bar)

// ---------------------------------------------------------------- backtesting
export type StrategyRef =
  | { type: 'builtin'; key: string; params?: Record<string, number> }
  | { type: 'saved'; strategy_id: number }
  | { type: 'definition'; definition: StrategyDefinition };
export interface BacktestRequest {
  symbol: string;
  strategy: StrategyRef;
  timeframe: Timeframe;
  start: string | null; // YYYY-MM-DD
  end: string | null;
  initial_capital: number;
  position_size_pct: number;   // % of equity per trade
  brokerage_pct: number;       // e.g. 0.03
  brokerage_flat: number;      // INR cap per order, e.g. 20
  transaction_cost_pct: number;// STT+exchange+GST approximation
  slippage_bps: number;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  out_of_sample_pct: number;   // last N% of the period reported separately, 0 disables
}
export interface BacktestMetrics {
  initial_capital: number; final_capital: number; net_profit: number;
  total_return_pct: number; annualized_return_pct: number | null; buy_and_hold_return_pct: number;
  num_trades: number; winning_trades: number; losing_trades: number; win_rate: number | null;
  max_drawdown_pct: number; sharpe_ratio: number | null; sortino_ratio: number | null; profit_factor: number | null;
  avg_win: number | null; avg_loss: number | null; avg_trade_return_pct: number | null;
  exposure_pct: number; total_costs: number;
}
export interface BacktestTrade {
  entry_time: number; exit_time: number; side: 'LONG';
  entry_price: number; exit_price: number; quantity: number;
  pnl: number; pnl_pct: number; costs: number; bars_held: number;
  exit_reason: 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA';
}
export interface BacktestResult {
  id: number;
  created_at: string;
  symbol: string;
  strategy_name: string;
  config: BacktestRequest;
  data_source: DataSource;
  bars: number;
  period: { start: string; end: string };
  metrics: BacktestMetrics;
  in_sample: BacktestMetrics | null;
  out_of_sample: BacktestMetrics | null;
  equity_curve: { time: number; equity: number; benchmark: number }[];
  drawdown_curve: { time: number; drawdown_pct: number }[];
  trades: BacktestTrade[];
  assumptions: string[];
}
// POST /api/backtests BacktestRequest           -> BacktestResult
// GET  /api/backtests?limit=20                  -> {id, created_at, symbol, strategy_name, timeframe, total_return_pct, num_trades, max_drawdown_pct, sharpe_ratio}[]
// GET  /api/backtests/{id}                      -> BacktestResult
// POST /api/backtests/compare {base: BacktestRequest (strategy ignored), strategies: StrategyRef[]} -> {strategy_name, metrics}[]

// ---------------------------------------------------------------- paper trading
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
export type OrderStatus = 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export interface PaperAccount {
  id: number; name: string; initial_capital: number; cash_balance: number; blocked_margin: number;
  holdings_value: number; equity: number; realized_pnl: number; unrealized_pnl: number; day_pnl: number;
  total_return_pct: number; created_at: string; data_source: 'PAPER_TRADING';
}
export interface PaperOrder {
  id: number; account_id: number; symbol: string; side: OrderSide; order_type: OrderType;
  quantity: number; limit_price: number | null; trigger_price: number | null;
  stop_loss: number | null; take_profit: number | null; parent_order_id: number | null;
  status: OrderStatus; filled_quantity: number; avg_fill_price: number | null;
  rejection_reason: string | null; created_at: string; updated_at: string;
}
export interface PaperPosition {
  symbol: string; name: string; sector: string; quantity: number; avg_price: number; ltp: number;
  invested: number; market_value: number; unrealized_pnl: number; unrealized_pnl_pct: number;
  day_change_pct: number; realized_pnl: number;
}
export interface PaperTransaction {
  id: number; order_id: number | null; type: 'DEPOSIT' | 'BUY' | 'SELL' | 'FEES'; symbol: string | null;
  quantity: number | null; price: number | null; amount: number; balance_after: number; created_at: string;
}
// GET  /api/paper-trading/accounts                       -> PaperAccount[]
// POST /api/paper-trading/accounts {name, initial_capital} -> PaperAccount
// GET  /api/paper-trading/accounts/{id}                  -> PaperAccount
// DELETE /api/paper-trading/accounts/{id}
// POST /api/paper-trading/accounts/{id}/orders {symbol, side, order_type: 'MARKET'|'LIMIT', quantity, limit_price?, stop_loss?, take_profit?} -> PaperOrder
// GET  /api/paper-trading/accounts/{id}/orders?status=   -> PaperOrder[]
// POST /api/paper-trading/accounts/{id}/orders/{order_id}/cancel -> PaperOrder
// GET  /api/paper-trading/accounts/{id}/positions        -> PaperPosition[]
// GET  /api/paper-trading/accounts/{id}/transactions     -> PaperTransaction[]

// ---------------------------------------------------------------- portfolio
export interface PortfolioSummary {
  account: PaperAccount;
  positions: PaperPosition[];
  allocation_by_symbol: { label: string; value: number; pct: number }[];
  allocation_by_sector: { label: string; value: number; pct: number }[];
  equity_history: { time: number; equity: number }[];
  stats: { total_trades: number; winning_trades: number; losing_trades: number; win_rate: number | null; best_trade: number | null; worst_trade: number | null; avg_holding_days: number | null };
  risk: { largest_position_pct: number; top_sector_pct: number; cash_pct: number; portfolio_volatility_pct: number | null; portfolio_beta: number | null; var_95_1d: number | null };
}
// GET /api/portfolio/{account_id}               -> PortfolioSummary
// GET /api/portfolio/{account_id}/report.csv    -> text/csv download

// ---------------------------------------------------------------- watchlists, alerts, notifications
export interface WatchlistItem extends Quote { position: number }
export interface Watchlist { id: number; name: string; items: WatchlistItem[]; created_at: string }
// GET /api/watchlists -> Watchlist[] ; POST {name} ; PATCH /{id} {name} ; DELETE /{id}
// POST /api/watchlists/{id}/items {symbol} ; DELETE /api/watchlists/{id}/items/{symbol}
// PUT /api/watchlists/{id}/order {symbols: string[]}
export type AlertType = 'PRICE_ABOVE' | 'PRICE_BELOW' | 'PCT_CHANGE_ABOVE' | 'PCT_CHANGE_BELOW' | 'RSI_ABOVE' | 'RSI_BELOW' | 'MA_CROSS_UP' | 'MA_CROSS_DOWN';
export interface Alert {
  id: number; symbol: string; alert_type: AlertType; threshold: number | null;
  params: Record<string, number>; // e.g. {fast: 20, slow: 50} or {period: 14}
  is_active: boolean; triggered_at: string | null; created_at: string; description: string;
}
// GET /api/alerts ; POST /api/alerts {symbol, alert_type, threshold?, params?} ; DELETE /api/alerts/{id} ; PATCH /api/alerts/{id} {is_active}
export interface Notification { id: number; title: string; body: string; kind: 'ALERT' | 'ORDER' | 'SYSTEM' | 'SIGNAL'; is_read: boolean; created_at: string }
// GET /api/notifications?unread_only= ; POST /api/notifications/{id}/read ; POST /api/notifications/read-all

// ---------------------------------------------------------------- assistant
export interface AssistantResponse {
  intent: string; // explain_trend | explain_indicator | compare | explain_signal | strategy_risk | backtest_summary | explain_concept | market_regime | indicator_summary | market_summary | unknown
  entities: { symbols: string[]; timeframe: Timeframe | null; indicator: string | null; strategy_key: string | null };
  answer: string; // markdown
  observations: string[];
  interpretations: string[];
  data: { label: string; value: string }[];
  suggestions: string[]; // follow-up questions
  disclaimers: string[];
  provider: 'rule-based-v1';
}
// POST /api/assistant/query {question, context?: {symbol?, backtest_id?, timeframe?}} -> AssistantResponse

// ---------------------------------------------------------------- admin (role ADMIN)
// GET  /api/admin/users ; PATCH /api/admin/users/{id} {role?, is_active?}
// GET  /api/admin/stocks ; POST /api/admin/stocks {symbol,name,exchange,sector,...} ; PATCH /api/admin/stocks/{symbol} {is_active?}
// POST /api/admin/datasets/validate  multipart file (CSV) -> DatasetValidationReport
// POST /api/admin/datasets/import    multipart file (CSV) -> DatasetValidationReport & {imported_rows}
// GET  /api/admin/datasets           -> DatasetImport[]
// GET  /api/admin/simulator ; POST /api/admin/simulator {action: 'start'|'stop'|'reseed', seed?, tick_interval_ms?, regime?}
// GET  /api/admin/health -> {status, database, simulator, uptime_seconds, version, counts: Record<string, number>}
// GET  /api/admin/audit-logs?limit= ; GET /api/admin/jobs ; GET /api/admin/config ; GET /api/admin/backtests
export interface DatasetValidationReport {
  filename: string; rows: number; valid_rows: number; symbols: string[];
  errors: { row: number | null; message: string }[]; warnings: { row: number | null; message: string }[];
  duplicates_removed: number; is_valid: boolean;
}
