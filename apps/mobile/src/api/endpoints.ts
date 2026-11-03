import {http, requestText} from './client';
import type {
  Alert,
  AlertType,
  AssistantResponse,
  BacktestMetrics,
  BacktestRequest,
  BacktestResult,
  BuiltinStrategy,
  CandleResponse,
  DataSource,
  DatasetValidationReport,
  IndexQuote,
  IndicatorMeta,
  IndicatorSeries,
  MarketOverview,
  Notification,
  OrderSide,
  OrderStatus,
  Paginated,
  PaperAccount,
  PaperOrder,
  PaperPosition,
  PaperTransaction,
  PortfolioSummary,
  Role,
  RuleCondition,
  SavedStrategy,
  ScreenKey,
  Signal,
  SignalAction,
  StockAnalysis,
  StockDetail,
  StockSummary,
  StrategyDefinition,
  StrategyRef,
  Timeframe,
  TokenResponse,
  User,
  UserPreferences,
  Watchlist,
} from './types';

export interface MarketStatus {
  session: 'OPEN' | 'CLOSED' | 'PRE_OPEN';
  simulator_running: boolean;
  data_source: DataSource;
  as_of: string;
}

/** GET /api/stocks query (same fields as web StockQuery). */
export interface StockListParams {
  q?: string;
  exchange?: string;
  sector?: string;
  min_price?: number | null;
  max_price?: number | null;
  min_volume?: number | null;
  min_mcap?: number | null;
  max_mcap?: number | null;
  screen?: ScreenKey | '';
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface IndicatorsResponse {
  symbol: string;
  timeframe: Timeframe;
  data_source: DataSource;
  indicators: IndicatorSeries[];
}

export interface BacktestListItem {
  id: number;
  created_at: string;
  symbol: string;
  strategy_name: string;
  timeframe: Timeframe;
  total_return_pct: number;
  num_trades: number;
  max_drawdown_pct: number;
  sharpe_ratio: number | null;
}

export interface PlaceOrderBody {
  symbol: string;
  side: OrderSide;
  order_type: 'MARKET' | 'LIMIT';
  quantity: number;
  limit_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
}

export interface CreateAlertBody {
  symbol: string;
  alert_type: AlertType;
  threshold?: number | null;
  params?: Record<string, number>;
}

export type ScreenResult = Paginated<StockSummary & {matched: string[]}>;

// ---------------------------------------------------------------- admin shapes (from the running API)
export interface SimulatorState {
  running: boolean;
  tick_interval_ms: number;
  ticks: number;
  seed: number;
  regime: string | null;
  live_session_date?: string;
  last_tick_at: string | null;
  instruments: number;
  ws_clients: number;
  errors: number;
  data_source: DataSource;
}
export interface AdminHealth {
  status: string;
  database: string;
  simulator: SimulatorState;
  uptime_seconds: number;
  version: string;
  counts: Record<string, number>;
  cache?: Record<string, number>;
}
export interface AdminStock {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry?: string | null;
  isin: string | null;
  instrument_type?: string;
  data_source: DataSource;
  is_active: boolean;
  market_cap: number | null;
}
export interface AdminJob {
  name: string;
  status: string;
  detail: string;
  last_run: string | null;
}
export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: string | number | null;
  ip_address: string | null;
  success: boolean;
  details: Record<string, unknown>;
  created_at: string;
}
export interface DatasetImport {
  id: number;
  filename: string;
  rows?: number;
  imported_rows?: number;
  created_at: string;
  [k: string]: unknown;
}
export interface SimulatorAction {
  action: 'start' | 'stop' | 'reseed';
  seed?: number;
  tick_interval_ms?: number;
  regime?: string | null;
}

const enc = encodeURIComponent;

export const api = {
  auth: {
    login: (email: string, password: string) => http.post<TokenResponse>('/auth/login', {email, password}, {auth: false}),
    register: (email: string, password: string, full_name: string) =>
      http.post<TokenResponse>('/auth/register', {email, password, full_name}, {auth: false}),
    logout: (refresh_token: string) => http.post<{message: string}>('/auth/logout', {refresh_token}),
    requestReset: (email: string) =>
      http.post<{message: string; dev_reset_token?: string}>('/auth/password-reset/request', {email}, {auth: false}),
    confirmReset: (token: string, new_password: string) =>
      http.post<{message: string}>('/auth/password-reset/confirm', {token, new_password}, {auth: false}),
  },
  users: {
    me: () => http.get<User>('/users/me'),
    update: (body: {full_name?: string}) => http.patch<User>('/users/me', body),
    updatePreferences: (prefs: Partial<UserPreferences>) => http.patch<User>('/users/me/preferences', prefs),
  },
  market: {
    overview: (date?: string) => http.get<MarketOverview>('/market/overview', {date}),
    indices: () => http.get<IndexQuote[]>('/market/indices'),
    status: () => http.get<MarketStatus>('/market/status'),
  },
  stocks: {
    list: (p: StockListParams = {}) =>
      http.get<Paginated<StockSummary>>('/stocks', {limit: 50, ...p} as Record<string, string | number | null | undefined>),
    sectors: () => http.get<string[]>('/stocks/sectors'),
    detail: (symbol: string) => http.get<StockDetail>(`/stocks/${enc(symbol)}`),
    candles: (symbol: string, timeframe: Timeframe, limit = 300) =>
      http.get<CandleResponse>(`/stocks/${enc(symbol)}/candles`, {timeframe, limit}),
    screen: (body: {logic: 'AND' | 'OR'; conditions: RuleCondition[]; timeframe?: Timeframe}) =>
      http.post<ScreenResult>('/stocks/screen', body),
  },
  indicators: {
    catalog: () => http.get<IndicatorMeta[]>('/indicators/catalog'),
    get: (symbol: string, timeframe: Timeframe, specs: string[], limit = 300) =>
      http.get<IndicatorsResponse>(`/indicators/${enc(symbol)}`, {timeframe, specs: specs.join(','), limit}),
  },
  analysis: {
    get: (symbol: string, timeframe: Timeframe = '1d') => http.get<StockAnalysis>(`/analysis/${enc(symbol)}`, {timeframe}),
  },
  signals: {
    list: (p: {symbol?: string; strategy_key?: string; action?: SignalAction | ''; limit?: number} = {}) =>
      http.get<Signal[]>('/signals', {limit: 50, ...p}),
    generate: (b: {symbol: string; strategy_key: string; timeframe?: Timeframe; params?: Record<string, number>}) =>
      http.post<Signal>('/signals/generate', b),
    scan: (b: {strategy_key?: string; timeframe?: Timeframe} = {}) => http.post<Signal[]>('/signals/scan', b),
  },
  strategies: {
    builtin: () => http.get<BuiltinStrategy[]>('/strategies/builtin'),
    saved: () => http.get<SavedStrategy[]>('/strategies'),
    get: (id: number) => http.get<SavedStrategy>(`/strategies/${id}`),
    create: (b: {name: string; description: string; definition: StrategyDefinition}) => http.post<SavedStrategy>('/strategies', b),
    update: (id: number, b: {name: string; description: string; definition: StrategyDefinition}) =>
      http.put<SavedStrategy>(`/strategies/${id}`, b),
    remove: (id: number) => http.del<void>(`/strategies/${id}`),
    duplicate: (id: number) => http.post<SavedStrategy>(`/strategies/${id}/duplicate`),
    validate: (definition: StrategyDefinition) => http.post<{valid: boolean; errors: string[]}>('/strategies/validate', {definition}),
    evaluate: (b: {definition: StrategyDefinition; symbol: string; timeframe?: Timeframe}) => http.post<Signal>('/strategies/evaluate', b),
  },
  backtests: {
    run: (body: BacktestRequest) => http.post<BacktestResult>('/backtests', body),
    list: (limit = 25) => http.get<BacktestListItem[]>('/backtests', {limit}),
    get: (id: number) => http.get<BacktestResult>(`/backtests/${id}`),
    compare: (b: {base: BacktestRequest; strategies: StrategyRef[]}) =>
      http.post<{strategy_name: string; metrics: BacktestMetrics}[]>('/backtests/compare', b),
  },
  paper: {
    accounts: () => http.get<PaperAccount[]>('/paper-trading/accounts'),
    createAccount: (name: string, initial_capital: number) => http.post<PaperAccount>('/paper-trading/accounts', {name, initial_capital}),
    placeOrder: (accountId: number, body: PlaceOrderBody) => http.post<PaperOrder>(`/paper-trading/accounts/${accountId}/orders`, body),
    orders: (accountId: number, status?: OrderStatus) => http.get<PaperOrder[]>(`/paper-trading/accounts/${accountId}/orders`, {status}),
    cancelOrder: (accountId: number, orderId: number) =>
      http.post<PaperOrder>(`/paper-trading/accounts/${accountId}/orders/${orderId}/cancel`),
    positions: (accountId: number) => http.get<PaperPosition[]>(`/paper-trading/accounts/${accountId}/positions`),
    transactions: (accountId: number) => http.get<PaperTransaction[]>(`/paper-trading/accounts/${accountId}/transactions`),
  },
  portfolio: {
    summary: (accountId: number) => http.get<PortfolioSummary>(`/portfolio/${accountId}`),
    /** Authenticated CSV report (text/csv). */
    reportCsv: (accountId: number) => requestText(`/portfolio/${accountId}/report.csv`),
  },
  watchlists: {
    list: () => http.get<Watchlist[]>('/watchlists'),
    create: (name: string) => http.post<Watchlist>('/watchlists', {name}),
    rename: (id: number, name: string) => http.patch<Watchlist>(`/watchlists/${id}`, {name}),
    remove: (id: number) => http.del<void>(`/watchlists/${id}`),
    addItem: (id: number, symbol: string) => http.post<Watchlist>(`/watchlists/${id}/items`, {symbol}),
    removeItem: (id: number, symbol: string) => http.del<Watchlist>(`/watchlists/${id}/items/${enc(symbol)}`),
    reorder: (id: number, symbols: string[]) => http.put<Watchlist>(`/watchlists/${id}/order`, {symbols}),
  },
  alerts: {
    list: () => http.get<Alert[]>('/alerts'),
    create: (body: CreateAlertBody) => http.post<Alert>('/alerts', body),
    remove: (id: number) => http.del<void>(`/alerts/${id}`),
    setActive: (id: number, is_active: boolean) => http.patch<Alert>(`/alerts/${id}`, {is_active}),
  },
  notifications: {
    list: (unread_only?: boolean) => http.get<Notification[]>('/notifications', {unread_only}),
    read: (id: number) => http.post<unknown>(`/notifications/${id}/read`),
    readAll: () => http.post<unknown>('/notifications/read-all'),
  },
  assistant: {
    query: (question: string, context?: {symbol?: string; backtest_id?: number; timeframe?: Timeframe}) =>
      http.post<AssistantResponse>('/assistant/query', {question, context}),
  },
  admin: {
    health: () => http.get<AdminHealth>('/admin/health'),
    simulator: () => http.get<SimulatorState>('/admin/simulator'),
    simulatorAction: (b: SimulatorAction) => http.post<SimulatorState>('/admin/simulator', b),
    users: () => http.get<User[]>('/admin/users'),
    updateUser: (id: number, b: {role?: Role; is_active?: boolean}) => http.patch<User>(`/admin/users/${id}`, b),
    stocks: () => http.get<AdminStock[]>('/admin/stocks'),
    updateStock: (symbol: string, b: {is_active: boolean}) => http.patch<AdminStock>(`/admin/stocks/${enc(symbol)}`, b),
    jobs: () => http.get<AdminJob[]>('/admin/jobs'),
    config: () => http.get<Record<string, unknown>>('/admin/config'),
    auditLogs: (limit = 50) => http.get<AuditLog[]>('/admin/audit-logs', {limit}),
    datasets: () => http.get<DatasetImport[]>('/admin/datasets'),
    backtests: () => http.get<Array<BacktestListItem & {user_id?: number | null}>>('/admin/backtests'),
  },
};

export type {DatasetValidationReport};
