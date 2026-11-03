'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, get, qs } from '@/lib/api';
import type * as T from '@shared/types/api';

/* Public endpoints only: the landing page works before anyone logs in. */

export const useIndices = () =>
  useQuery({ queryKey: ['landing', 'indices'], queryFn: () => get<T.IndexQuote[]>('/market/indices'), refetchInterval: 5_000 });

export const useStatus = () =>
  useQuery({
    queryKey: ['landing', 'status'],
    queryFn: () => get<{ session: 'OPEN' | 'CLOSED' | 'PRE_OPEN'; simulator_running: boolean; as_of: string }>('/market/status'),
    refetchInterval: 30_000,
  });

export const useMovers = () =>
  useQuery({ queryKey: ['landing', 'movers'], queryFn: () => get<T.Paginated<T.StockSummary>>('/stocks?limit=5&sort=-change_pct'), refetchInterval: 10_000 });

export const useLatestSignals = () => useQuery({ queryKey: ['landing', 'signals'], queryFn: () => get<T.Signal[]>('/signals?limit=4') });

export const useBuiltins = () => useQuery({ queryKey: ['landing', 'builtins'], queryFn: () => get<T.BuiltinStrategy[]>('/strategies/builtin'), staleTime: Infinity });

export const useLandingAnalysis = (symbol: string) =>
  useQuery({ queryKey: ['landing', 'analysis', symbol], queryFn: () => get<T.StockAnalysis>(`/analysis/${symbol}`), staleTime: 60_000 });

export const useChartData = (symbol: string, bars = 70) =>
  useQuery({
    queryKey: ['landing', 'chart', symbol, bars],
    queryFn: async () => {
      const [c, i] = await Promise.all([
        get<T.CandleResponse>(`/stocks/${symbol}/candles${qs({ timeframe: '1d', limit: bars })}`),
        get<{ indicators: T.IndicatorSeries[] }>(`/indicators/${symbol}${qs({ timeframe: '1d', specs: 'supertrend:10:3', limit: bars })}`),
      ]);
      return { candles: c.candles, source: c.data_source, st: i.indicators[0] };
    },
    staleTime: 60_000,
  });

export const useDemoSignal = (body: { symbol: string; strategy_key: string; timeframe: T.Timeframe; params: Record<string, number> }) =>
  useQuery({
    queryKey: ['landing', 'demo', body],
    queryFn: () => api<T.Signal>('/signals/generate', { method: 'POST', body, auth: false }),
    placeholderData: keepPreviousData,
  });

export const DEMO_SYMBOLS = ['INFY', 'RELIANCE', 'TCS', 'HDFCBANK', 'ITC', 'SBIN'];
