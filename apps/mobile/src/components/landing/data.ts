import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {http} from '../../api/client';
import type {BuiltinStrategy, CandleResponse, IndexQuote, IndicatorSeries, Signal, StockAnalysis, Timeframe} from '../../api/types';
import type {MarketStatus} from '../../api/endpoints';

/* Public endpoints only (auth: false): the welcome flow works before anyone logs in. Mirrors apps/web/src/components/landing/data.ts. */
const pub = {auth: false} as const;

export const useLandingIndices = () =>
  useQuery({queryKey: ['landing', 'indices'], queryFn: () => http.get<IndexQuote[]>('/market/indices', undefined, pub), refetchInterval: 5_000});

export const useLandingStatus = () =>
  useQuery({queryKey: ['landing', 'status'], queryFn: () => http.get<MarketStatus>('/market/status', undefined, pub), refetchInterval: 30_000});

export const useLatestSignals = () =>
  useQuery({queryKey: ['landing', 'signals'], queryFn: () => http.get<Signal[]>('/signals', {limit: 4}, pub)});

export const useLandingBuiltins = () =>
  useQuery({queryKey: ['landing', 'builtins'], queryFn: () => http.get<BuiltinStrategy[]>('/strategies/builtin', undefined, pub), staleTime: Infinity});

export const useLandingAnalysis = (symbol: string) =>
  useQuery({
    queryKey: ['landing', 'analysis', symbol],
    queryFn: () => http.get<StockAnalysis>(`/analysis/${encodeURIComponent(symbol)}`, undefined, pub),
    staleTime: 60_000,
  });

export const useChartData = (symbol: string, bars = 70) =>
  useQuery({
    queryKey: ['landing', 'chart', symbol, bars],
    queryFn: async () => {
      const [c, i] = await Promise.all([
        http.get<CandleResponse>(`/stocks/${encodeURIComponent(symbol)}/candles`, {timeframe: '1d', limit: bars}, pub),
        http.get<{indicators: IndicatorSeries[]}>(`/indicators/${encodeURIComponent(symbol)}`, {timeframe: '1d', specs: 'supertrend:10:3', limit: bars}, pub),
      ]);
      return {candles: c.candles, source: c.data_source, st: i.indicators[0]};
    },
    staleTime: 60_000,
  });

export interface DemoBody {
  symbol: string;
  strategy_key: string;
  timeframe: Timeframe;
  params: Record<string, number>;
}

export const useDemoSignal = (body: DemoBody) =>
  useQuery({
    queryKey: ['landing', 'demo', body],
    queryFn: () => http.post<Signal>('/signals/generate', body, pub),
    placeholderData: keepPreviousData,
  });
