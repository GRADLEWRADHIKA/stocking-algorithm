import {useEffect} from 'react';
import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {api, type CreateAlertBody, type PlaceOrderBody, type SimulatorAction, type StockListParams} from './endpoints';
import type {
  AlertType,
  BacktestRequest,
  OrderStatus,
  Role,
  RuleCondition,
  SignalAction,
  StrategyDefinition,
  StrategyRef,
  Timeframe,
  UserPreferences,
} from './types';
import {useAccountStore} from '../store/account';
import {useAuthStore} from '../store/auth';
import {toast} from '../components/Toast';

/** Query keys mirror the web's (apps/web/src/hooks/queries.ts) so invalidation reads the same. */
export const qk = {
  overview: (date?: string) => ['market', 'overview', date ?? 'live'] as const,
  indices: ['market', 'indices'] as const,
  marketStatus: ['market', 'status'] as const,
  stocks: (p: StockListParams) => ['stocks', p] as const,
  sectors: ['stocks', 'sectors'] as const,
  stock: (s: string) => ['stock', s] as const,
  candles: (s: string, tf: Timeframe, limit: number) => ['candles', s, tf, limit] as const,
  catalog: ['indicators', 'catalog'] as const,
  indicators: (s: string, tf: Timeframe, specs: string[], limit: number) => ['indicators', s, tf, specs.join(','), limit] as const,
  analysis: (s: string, tf: Timeframe) => ['analysis', s, tf] as const,
  signals: (p: object) => ['signals', p] as const,
  builtin: ['strategies', 'builtin'] as const,
  saved: ['strategies', 'saved'] as const,
  backtests: ['backtests'] as const,
  backtest: (id: number) => ['backtest', id] as const,
  accounts: ['paper', 'accounts'] as const,
  orders: (id: number, status?: string) => ['paper', 'orders', id, status ?? 'all'] as const,
  positions: (id: number) => ['paper', 'positions', id] as const,
  transactions: (id: number) => ['paper', 'transactions', id] as const,
  portfolio: (id: number) => ['paper', 'portfolio', id] as const,
  watchlists: ['watchlists'] as const,
  alerts: ['alerts'] as const,
  notifications: ['notifications'] as const,
  admin: (k: string) => ['admin', k] as const,
};

const authed = () => useAuthStore.getState().status === 'authenticated';

// ------------------------------------------------------------------ market
/** Live overview (refetch 15 s) or a replay of a past session when `date` is given. */
export const useOverview = (date?: string) =>
  useQuery({
    queryKey: qk.overview(date),
    queryFn: () => api.market.overview(date),
    refetchInterval: date ? false : 15_000,
    placeholderData: keepPreviousData,
  });
export const useIndices = () => useQuery({queryKey: qk.indices, queryFn: api.market.indices});
export const useMarketStatus = () => useQuery({queryKey: qk.marketStatus, queryFn: api.market.status, refetchInterval: 30_000});

// ------------------------------------------------------------------ stocks
export const useStocks = (p: StockListParams, enabled = true) =>
  useQuery({queryKey: qk.stocks(p), queryFn: () => api.stocks.list(p), placeholderData: keepPreviousData, enabled});
export const useSectors = () => useQuery({queryKey: qk.sectors, queryFn: api.stocks.sectors, staleTime: Infinity});
export const useStockDetail = (symbol: string) =>
  useQuery({queryKey: qk.stock(symbol), queryFn: () => api.stocks.detail(symbol), enabled: !!symbol});
export const useStock = useStockDetail;
export const useCandles = (symbol: string, tf: Timeframe, limit = 300) =>
  useQuery({
    queryKey: qk.candles(symbol, tf, limit),
    queryFn: () => api.stocks.candles(symbol, tf, limit),
    placeholderData: keepPreviousData,
    enabled: !!symbol,
  });
export const useScreen = () =>
  useMutation({
    mutationFn: (body: {logic: 'AND' | 'OR'; conditions: RuleCondition[]; timeframe?: Timeframe}) => api.stocks.screen(body),
  });

// ------------------------------------------------------------------ indicators & analysis
export const useIndicatorCatalog = () => useQuery({queryKey: qk.catalog, queryFn: api.indicators.catalog, staleTime: Infinity});
export const useIndicators = (symbol: string, tf: Timeframe, specs: string[], limit = 300) =>
  useQuery({
    queryKey: qk.indicators(symbol, tf, specs, limit),
    queryFn: () => api.indicators.get(symbol, tf, specs, limit),
    enabled: !!symbol && specs.length > 0,
    placeholderData: keepPreviousData,
  });
export const useAnalysis = (symbol: string, tf: Timeframe = '1d') =>
  useQuery({queryKey: qk.analysis(symbol, tf), queryFn: () => api.analysis.get(symbol, tf), enabled: !!symbol});

export const useSignals = (p: {symbol?: string; action?: SignalAction | ''; strategy_key?: string; limit?: number} = {}) =>
  useQuery({queryKey: qk.signals(p), queryFn: () => api.signals.list(p), refetchInterval: 60_000});
export const useGenerateSignal = () =>
  useMutation({
    mutationFn: (b: {symbol: string; strategy_key: string; timeframe?: Timeframe; params?: Record<string, number>}) => api.signals.generate(b),
  });
/** Web copy: toast "Scan complete · N actionable signals across the universe". */
export function useScanSignals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: {strategy_key?: string; timeframe?: Timeframe} = {}) => api.signals.scan(b),
    onSuccess: s => {
      toast.success('Scan complete', {description: `${s.length} actionable signals across the universe`});
      qc.invalidateQueries({queryKey: ['signals']});
    },
    onError: e => toast.error('Scan failed', {description: (e as Error).message}),
  });
}

// ------------------------------------------------------------------ strategies
export const useBuiltinStrategies = () => useQuery({queryKey: qk.builtin, queryFn: api.strategies.builtin, staleTime: Infinity});
export const useSavedStrategies = () => useQuery({queryKey: qk.saved, queryFn: api.strategies.saved, enabled: authed()});
export function useStrategyMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({queryKey: qk.saved});
  return {
    save: useMutation({
      mutationFn: (b: {id?: number; name: string; description: string; definition: StrategyDefinition}) =>
        b.id ? api.strategies.update(b.id, b) : api.strategies.create(b),
      onSuccess: done,
    }),
    remove: useMutation({mutationFn: (id: number) => api.strategies.remove(id), onSuccess: done}),
    duplicate: useMutation({mutationFn: (id: number) => api.strategies.duplicate(id), onSuccess: done}),
  };
}
export const useValidateStrategy = () => useMutation({mutationFn: (d: StrategyDefinition) => api.strategies.validate(d)});
export const useEvaluateStrategy = () =>
  useMutation({mutationFn: (b: {definition: StrategyDefinition; symbol: string; timeframe?: Timeframe}) => api.strategies.evaluate(b)});

// ------------------------------------------------------------------ backtests
export const useBacktests = () => useQuery({queryKey: qk.backtests, queryFn: () => api.backtests.list(25), enabled: authed()});
export const useBacktest = (id: number | null) =>
  useQuery({queryKey: qk.backtest(id ?? -1), queryFn: () => api.backtests.get(id as number), enabled: !!id});
export function useRunBacktest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: BacktestRequest) => api.backtests.run(req),
    onSuccess: res => {
      qc.setQueryData(qk.backtest(res.id), res);
      qc.invalidateQueries({queryKey: qk.backtests});
    },
  });
}
export const useCompareBacktests = () =>
  useMutation({mutationFn: (b: {base: BacktestRequest; strategies: StrategyRef[]}) => api.backtests.compare(b)});

// ------------------------------------------------------------------ paper trading / portfolio
export const usePaperAccounts = () => useQuery({queryKey: qk.accounts, queryFn: api.paper.accounts, refetchInterval: 10_000});
export const useAccounts = usePaperAccounts;

/** Resolves the selected paper account (defaults to the first one) — web `useUi.activeAccountId`. */
export function useActiveAccount() {
  const accounts = usePaperAccounts();
  const accountId = useAccountStore(s => s.accountId);
  const setAccountId = useAccountStore(s => s.setAccountId);
  const list = accounts.data ?? [];
  const active = list.find(a => a.id === accountId) ?? list[0] ?? null;
  useEffect(() => {
    if (active && active.id !== accountId) {
      setAccountId(active.id);
    }
  }, [active, accountId, setAccountId]);
  return {...accounts, accounts: list, active, setAccountId};
}

export function useCreateAccount() {
  const qc = useQueryClient();
  const setAccountId = useAccountStore(s => s.setAccountId);
  return useMutation({
    mutationFn: (v: {name: string; initial_capital: number}) => api.paper.createAccount(v.name, v.initial_capital),
    onSuccess: acc => {
      setAccountId(acc.id);
      qc.invalidateQueries({queryKey: ['paper']});
    },
  });
}

export const usePortfolio = (accountId: number | null | undefined) =>
  useQuery({
    queryKey: qk.portfolio(accountId ?? -1),
    queryFn: () => api.portfolio.summary(accountId as number),
    enabled: !!accountId,
    refetchInterval: 10_000,
  });
export const useOrders = (accountId: number | null | undefined, status?: OrderStatus) =>
  useQuery({
    queryKey: qk.orders(accountId ?? -1, status),
    queryFn: () => api.paper.orders(accountId as number, status),
    enabled: !!accountId,
    refetchInterval: 5_000,
  });
export const usePositions = (accountId: number | null | undefined) =>
  useQuery({
    queryKey: qk.positions(accountId ?? -1),
    queryFn: () => api.paper.positions(accountId as number),
    enabled: !!accountId,
    refetchInterval: 5_000,
  });
export const useTransactions = (accountId: number | null | undefined) =>
  useQuery({
    queryKey: qk.transactions(accountId ?? -1),
    queryFn: () => api.paper.transactions(accountId as number),
    enabled: !!accountId,
  });

function useInvalidateTrading() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({queryKey: ['paper']});
    qc.invalidateQueries({queryKey: qk.notifications});
  };
}
export function usePlaceOrder() {
  const invalidate = useInvalidateTrading();
  return useMutation({
    mutationFn: (v: {accountId: number; body: PlaceOrderBody}) => api.paper.placeOrder(v.accountId, v.body),
    onSettled: invalidate,
  });
}
export function useCancelOrder() {
  const invalidate = useInvalidateTrading();
  return useMutation({
    mutationFn: (v: {accountId: number; orderId: number}) => api.paper.cancelOrder(v.accountId, v.orderId),
    onSettled: invalidate,
  });
}

// ------------------------------------------------------------------ watchlists
export const useWatchlists = () => useQuery({queryKey: qk.watchlists, queryFn: api.watchlists.list, refetchInterval: 15_000});
export function useWatchlistMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({queryKey: qk.watchlists});
  return {
    create: useMutation({mutationFn: (name: string) => api.watchlists.create(name), onSettled: done}),
    rename: useMutation({mutationFn: (v: {id: number; name: string}) => api.watchlists.rename(v.id, v.name), onSettled: done}),
    remove: useMutation({mutationFn: (id: number) => api.watchlists.remove(id), onSettled: done}),
    addItem: useMutation({mutationFn: (v: {id: number; symbol: string}) => api.watchlists.addItem(v.id, v.symbol), onSettled: done}),
    removeItem: useMutation({mutationFn: (v: {id: number; symbol: string}) => api.watchlists.removeItem(v.id, v.symbol), onSettled: done}),
    reorder: useMutation({mutationFn: (v: {id: number; symbols: string[]}) => api.watchlists.reorder(v.id, v.symbols), onSettled: done}),
  };
}

// ------------------------------------------------------------------ alerts & notifications
export const useAlerts = () => useQuery({queryKey: qk.alerts, queryFn: api.alerts.list});
export function useAlertMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({queryKey: qk.alerts});
  return {
    create: useMutation({
      mutationFn: (b: CreateAlertBody & {alert_type: AlertType}) => api.alerts.create(b),
      onSettled: done,
    }),
    remove: useMutation({mutationFn: (id: number) => api.alerts.remove(id), onSettled: done}),
    setActive: useMutation({mutationFn: (v: {id: number; active: boolean}) => api.alerts.setActive(v.id, v.active), onSettled: done}),
  };
}

export const useNotifications = () =>
  useQuery({queryKey: qk.notifications, queryFn: () => api.notifications.list(), refetchInterval: 30_000});
export function useNotificationMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({queryKey: qk.notifications});
  return {
    read: useMutation({mutationFn: (id: number) => api.notifications.read(id), onSettled: done}),
    readAll: useMutation({mutationFn: () => api.notifications.readAll(), onSettled: done}),
  };
}

// ------------------------------------------------------------------ assistant & user
export function useAssistant() {
  return useMutation({
    mutationFn: (v: {question: string; symbol?: string; context?: {symbol?: string; backtest_id?: number; timeframe?: Timeframe}}) =>
      api.assistant.query(v.question, v.context ?? (v.symbol ? {symbol: v.symbol} : undefined)),
  });
}

export function useUpdatePreferences() {
  const setUser = useAuthStore(s => s.setUser);
  return useMutation({
    mutationFn: (prefs: Partial<UserPreferences>) => api.users.updatePreferences(prefs),
    onSuccess: user => setUser(user),
  });
}
export function useUpdateProfile() {
  const setUser = useAuthStore(s => s.setUser);
  return useMutation({mutationFn: (b: {full_name: string}) => api.users.update(b), onSuccess: user => setUser(user)});
}

// ------------------------------------------------------------------ admin (role ADMIN)
export const useAdminHealth = () => useQuery({queryKey: qk.admin('health'), queryFn: api.admin.health, refetchInterval: 10_000});
export const useAdminUsers = () => useQuery({queryKey: qk.admin('users'), queryFn: api.admin.users});
export const useAdminStocks = () => useQuery({queryKey: qk.admin('stocks'), queryFn: api.admin.stocks});
export const useAdminJobs = () => useQuery({queryKey: qk.admin('jobs'), queryFn: api.admin.jobs, refetchInterval: 10_000});
export const useAdminConfig = () => useQuery({queryKey: qk.admin('config'), queryFn: api.admin.config});
export const useAdminAudit = () => useQuery({queryKey: qk.admin('audit'), queryFn: () => api.admin.auditLogs(50)});
export const useAdminBacktests = () => useQuery({queryKey: qk.admin('backtests'), queryFn: api.admin.backtests});
export const useAdminDatasets = () => useQuery({queryKey: qk.admin('datasets'), queryFn: api.admin.datasets});
export function useAdminMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({queryKey: ['admin']});
  return {
    simulator: useMutation({mutationFn: (b: SimulatorAction) => api.admin.simulatorAction(b), onSettled: done}),
    updateUser: useMutation({mutationFn: ({id, ...b}: {id: number; role?: Role; is_active?: boolean}) => api.admin.updateUser(id, b), onSettled: done}),
    updateStock: useMutation({
      mutationFn: (v: {symbol: string; is_active: boolean}) => api.admin.updateStock(v.symbol, {is_active: v.is_active}),
      onSettled: () => {
        done();
        qc.invalidateQueries({queryKey: ['stocks']});
      },
    }),
  };
}
