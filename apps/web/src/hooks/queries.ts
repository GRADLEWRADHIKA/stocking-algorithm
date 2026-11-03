'use client';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { del, get, patch, post, put, qs } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import type * as T from '@shared/types/api';

const authed = () => !!useAuth.getState().accessToken;

/* ------------------------------------------------------------------ market */
export const useMarketOverview = (date?: string) =>
  useQuery({
    queryKey: ['market', 'overview', date ?? 'live'],
    queryFn: () => get<T.MarketOverview>(`/market/overview${qs({ date })}`),
    refetchInterval: date ? false : 15_000,
    placeholderData: keepPreviousData,
  });

export const useMarketStatus = () =>
  useQuery({
    queryKey: ['market', 'status'],
    queryFn: () =>
      get<{ session: 'OPEN' | 'CLOSED' | 'PRE_OPEN'; simulator_running: boolean; data_source: T.DataSource; as_of: string }>('/market/status'),
    refetchInterval: 30_000,
  });

/* ------------------------------------------------------------------ stocks */
export interface StockQuery {
  q?: string;
  sector?: string;
  exchange?: string;
  min_price?: number | null;
  max_price?: number | null;
  min_volume?: number | null;
  min_mcap?: number | null;
  max_mcap?: number | null;
  screen?: T.ScreenKey | '';
  sort?: string;
  limit?: number;
  offset?: number;
}
export const useStocks = (p: StockQuery) =>
  useQuery({
    queryKey: ['stocks', p],
    queryFn: () => get<T.Paginated<T.StockSummary>>(`/stocks${qs({ ...p })}`),
    placeholderData: keepPreviousData,
  });

export const useSectors = () =>
  useQuery({ queryKey: ['stocks', 'sectors'], queryFn: () => get<string[]>('/stocks/sectors'), staleTime: Infinity });

export const useStock = (symbol: string) =>
  useQuery({ queryKey: ['stock', symbol], queryFn: () => get<T.StockDetail>(`/stocks/${symbol}`), enabled: !!symbol });

export const useCandles = (symbol: string, timeframe: T.Timeframe, limit = 600) =>
  useQuery({
    queryKey: ['candles', symbol, timeframe, limit],
    queryFn: () => get<T.CandleResponse>(`/stocks/${symbol}/candles${qs({ timeframe, limit })}`),
    enabled: !!symbol,
    placeholderData: keepPreviousData,
  });

export const useScreen = () =>
  useMutation({
    mutationFn: (body: { logic: 'AND' | 'OR'; conditions: T.RuleCondition[]; timeframe?: T.Timeframe }) =>
      post<T.Paginated<T.StockSummary & { matched: string[] }>>('/stocks/screen', body),
  });

/* ------------------------------------------------------------------ indicators & analysis */
export const useIndicatorCatalog = () =>
  useQuery({ queryKey: ['indicators', 'catalog'], queryFn: () => get<T.IndicatorMeta[]>('/indicators/catalog'), staleTime: Infinity });

export const useIndicators = (symbol: string, timeframe: T.Timeframe, specs: string[], limit = 600) =>
  useQuery({
    queryKey: ['indicators', symbol, timeframe, specs.join(','), limit],
    queryFn: () =>
      get<{ symbol: string; timeframe: T.Timeframe; data_source: T.DataSource; indicators: T.IndicatorSeries[] }>(
        `/indicators/${symbol}${qs({ timeframe, specs: specs.join(','), limit })}`,
      ),
    enabled: !!symbol && specs.length > 0,
    placeholderData: keepPreviousData,
  });

export const useAnalysis = (symbol: string, timeframe: T.Timeframe = '1d') =>
  useQuery({
    queryKey: ['analysis', symbol, timeframe],
    queryFn: () => get<T.StockAnalysis>(`/analysis/${symbol}${qs({ timeframe })}`),
    enabled: !!symbol,
  });

export const useSignals = (p: { symbol?: string; strategy_key?: string; action?: string; limit?: number } = {}) =>
  useQuery({ queryKey: ['signals', p], queryFn: () => get<T.Signal[]>(`/signals${qs(p)}`), refetchInterval: 60_000 });

export const useGenerateSignal = () =>
  useMutation({
    mutationFn: (b: { symbol: string; strategy_key: string; timeframe?: T.Timeframe; params?: Record<string, number> }) =>
      post<T.Signal>('/signals/generate', b),
  });

export const useScanSignals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { strategy_key?: string; timeframe?: T.Timeframe }) => post<T.Signal[]>('/signals/scan', b),
    onSuccess: (s) => {
      toast.success(`Scan complete`, { description: `${s.length} actionable signals across the universe` });
      qc.invalidateQueries({ queryKey: ['signals'] });
    },
  });
};

/* ------------------------------------------------------------------ strategies */
export const useBuiltinStrategies = () =>
  useQuery({ queryKey: ['strategies', 'builtin'], queryFn: () => get<T.BuiltinStrategy[]>('/strategies/builtin'), staleTime: Infinity });

export const useSavedStrategies = () =>
  useQuery({ queryKey: ['strategies', 'saved'], queryFn: () => get<T.SavedStrategy[]>('/strategies'), enabled: authed() });

export const useSaveStrategy = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { id?: number; name: string; description: string; definition: T.StrategyDefinition }) =>
      b.id ? put<T.SavedStrategy>(`/strategies/${b.id}`, b) : post<T.SavedStrategy>('/strategies', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategies', 'saved'] }),
  });
};

export const useDeleteStrategy = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => del(`/strategies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategies', 'saved'] }),
  });
};

export const useDuplicateStrategy = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => post<T.SavedStrategy>(`/strategies/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategies', 'saved'] }),
  });
};

export const useValidateStrategy = () =>
  useMutation({ mutationFn: (definition: T.StrategyDefinition) => post<{ valid: boolean; errors: string[] }>('/strategies/validate', { definition }) });

export const useEvaluateStrategy = () =>
  useMutation({
    mutationFn: (b: { definition: T.StrategyDefinition; symbol: string; timeframe?: T.Timeframe }) => post<T.Signal>('/strategies/evaluate', b),
  });

/* ------------------------------------------------------------------ backtesting */
export type BacktestListItem = {
  id: number;
  created_at: string;
  symbol: string;
  strategy_name: string;
  timeframe: T.Timeframe;
  total_return_pct: number;
  num_trades: number;
  max_drawdown_pct: number;
  sharpe_ratio: number | null;
};
export const useBacktests = () =>
  useQuery({ queryKey: ['backtests'], queryFn: () => get<BacktestListItem[]>('/backtests?limit=25'), enabled: authed() });

export const useBacktest = (id: number | null) =>
  useQuery({ queryKey: ['backtest', id], queryFn: () => get<T.BacktestResult>(`/backtests/${id}`), enabled: !!id });

export const useRunBacktest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: T.BacktestRequest) => post<T.BacktestResult>('/backtests', b),
    onSuccess: (r) => {
      qc.setQueryData(['backtest', r.id], r);
      qc.invalidateQueries({ queryKey: ['backtests'] });
    },
  });
};

export const useCompareBacktests = () =>
  useMutation({
    mutationFn: (b: { base: T.BacktestRequest; strategies: T.StrategyRef[] }) =>
      post<{ strategy_name: string; metrics: T.BacktestMetrics }[]>('/backtests/compare', b),
  });

/* ------------------------------------------------------------------ paper trading & portfolio */
export const useAccounts = () =>
  useQuery({ queryKey: ['paper', 'accounts'], queryFn: () => get<T.PaperAccount[]>('/paper-trading/accounts'), refetchInterval: 10_000 });

export const useCreateAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; initial_capital: number }) => post<T.PaperAccount>('/paper-trading/accounts', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper'] }),
  });
};

export const useOrders = (accountId: number | null, status?: string) =>
  useQuery({
    queryKey: ['paper', 'orders', accountId, status ?? 'all'],
    queryFn: () => get<T.PaperOrder[]>(`/paper-trading/accounts/${accountId}/orders${qs({ status })}`),
    enabled: !!accountId,
    refetchInterval: 5_000,
  });

export const usePositions = (accountId: number | null) =>
  useQuery({
    queryKey: ['paper', 'positions', accountId],
    queryFn: () => get<T.PaperPosition[]>(`/paper-trading/accounts/${accountId}/positions`),
    enabled: !!accountId,
    refetchInterval: 5_000,
  });

export const useTransactions = (accountId: number | null) =>
  useQuery({
    queryKey: ['paper', 'transactions', accountId],
    queryFn: () => get<T.PaperTransaction[]>(`/paper-trading/accounts/${accountId}/transactions`),
    enabled: !!accountId,
  });

export interface OrderInput {
  symbol: string;
  side: T.OrderSide;
  order_type: 'MARKET' | 'LIMIT';
  quantity: number;
  limit_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
}
export const usePlaceOrder = (accountId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: OrderInput) => post<T.PaperOrder>(`/paper-trading/accounts/${accountId}/orders`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper'] }),
  });
};

export const useCancelOrder = (accountId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: number) => post<T.PaperOrder>(`/paper-trading/accounts/${accountId}/orders/${orderId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paper'] }),
  });
};

export const usePortfolio = (accountId: number | null) =>
  useQuery({
    queryKey: ['paper', 'portfolio', accountId],
    queryFn: () => get<T.PortfolioSummary>(`/portfolio/${accountId}`),
    enabled: !!accountId,
    refetchInterval: 10_000,
  });

/* ------------------------------------------------------------------ watchlists, alerts, notifications */
export const useWatchlists = () =>
  useQuery({ queryKey: ['watchlists'], queryFn: () => get<T.Watchlist[]>('/watchlists'), refetchInterval: 15_000 });

export function useWatchlistMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['watchlists'] });
  return {
    create: useMutation({ mutationFn: (name: string) => post<T.Watchlist>('/watchlists', { name }), onSuccess: done }),
    rename: useMutation({ mutationFn: (b: { id: number; name: string }) => patch<T.Watchlist>(`/watchlists/${b.id}`, { name: b.name }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => del(`/watchlists/${id}`), onSuccess: done }),
    addItem: useMutation({ mutationFn: (b: { id: number; symbol: string }) => post<T.Watchlist>(`/watchlists/${b.id}/items`, { symbol: b.symbol }), onSuccess: done }),
    removeItem: useMutation({ mutationFn: (b: { id: number; symbol: string }) => del(`/watchlists/${b.id}/items/${b.symbol}`), onSuccess: done }),
    reorder: useMutation({ mutationFn: (b: { id: number; symbols: string[] }) => put<T.Watchlist>(`/watchlists/${b.id}/order`, { symbols: b.symbols }), onSuccess: done }),
  };
}

export const useAlerts = () => useQuery({ queryKey: ['alerts'], queryFn: () => get<T.Alert[]>('/alerts') });

export function useAlertMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['alerts'] });
  return {
    create: useMutation({
      mutationFn: (b: { symbol: string; alert_type: T.AlertType; threshold?: number | null; params?: Record<string, number> }) => post<T.Alert>('/alerts', b),
      onSuccess: done,
    }),
    toggle: useMutation({ mutationFn: (b: { id: number; is_active: boolean }) => patch<T.Alert>(`/alerts/${b.id}`, { is_active: b.is_active }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => del(`/alerts/${id}`), onSuccess: done }),
  };
}

export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => get<T.Notification[]>('/notifications'), refetchInterval: 30_000 });

export function useNotificationMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  return {
    read: useMutation({ mutationFn: (id: number) => post(`/notifications/${id}/read`), onSuccess: done }),
    readAll: useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: done }),
  };
}

/* ------------------------------------------------------------------ assistant */
export const useAssistant = () =>
  useMutation({
    mutationFn: (b: { question: string; context?: { symbol?: string; backtest_id?: number; timeframe?: T.Timeframe } }) =>
      post<T.AssistantResponse>('/assistant/query', b),
  });

/* ------------------------------------------------------------------ user */
export const useUpdatePreferences = () =>
  useMutation({
    mutationFn: (b: Partial<T.UserPreferences>) => patch<T.User>('/users/me/preferences', b),
    onSuccess: (u) => useAuth.getState().setUser(u),
  });

export const useUpdateProfile = () =>
  useMutation({
    mutationFn: (b: { full_name: string }) => patch<T.User>('/users/me', b),
    onSuccess: (u) => useAuth.getState().setUser(u),
  });
