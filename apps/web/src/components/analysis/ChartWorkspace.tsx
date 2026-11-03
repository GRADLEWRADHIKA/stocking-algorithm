'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import * as Popover from '@radix-ui/react-popover';
import { AreaChart, CandlestickChart, LineChart as LineIcon, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useCandles, useIndicatorCatalog, useIndicators, useUpdatePreferences } from '@/hooks/queries';
import { useAuth } from '@/stores/auth';
import { useLive } from '@/stores/live';
import { Segmented } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { SourceBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChartKind } from '@/components/charts/PriceChart';
import type { IndicatorMeta, Timeframe } from '@shared/types/api';

const PriceChart = dynamic(() => import('@/components/charts/PriceChart').then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[440px] w-full rounded-none" />,
});

const ALL_TF: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
const INTRADAY: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h'];

export interface IndicatorConfig {
  key: string;
  params: number[];
  enabled: boolean;
}

const DEFAULT_CONFIG: IndicatorConfig[] = [
  { key: 'ema', params: [20], enabled: true },
  { key: 'ema', params: [50], enabled: true },
  { key: 'sma', params: [200], enabled: false },
  { key: 'bbands', params: [20, 2], enabled: false },
  { key: 'vwap', params: [], enabled: false },
  { key: 'supertrend', params: [10, 3], enabled: false },
  { key: 'rsi', params: [14], enabled: true },
  { key: 'macd', params: [12, 26, 9], enabled: true },
  { key: 'stoch', params: [14, 3], enabled: false },
  { key: 'adx', params: [14], enabled: false },
  { key: 'atr', params: [14], enabled: false },
  { key: 'obv', params: [], enabled: false },
  { key: 'volume_sma', params: [20], enabled: false },
];

const spec = (c: IndicatorConfig) => [c.key, ...c.params].join(':');

function IndicatorPicker({ catalog, config, onChange }: { catalog: IndicatorMeta[]; config: IndicatorConfig[]; onChange: (c: IndicatorConfig[]) => void }) {
  const meta = (k: string) => catalog.find((m) => m.key === k);
  const update = (i: number, patch: Partial<IndicatorConfig>) => onChange(config.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="w-[340px] max-w-[calc(100vw-24px)]">
      <div className="panel-head">
        <span className="panel-title">Indicators</span>
        <button className="text-xs text-muted hover:text-ink" onClick={() => onChange(DEFAULT_CONFIG)}>
          Reset
        </button>
      </div>
      <ul className="max-h-[420px] overflow-y-auto py-1">
        {config.map((c, i) => {
          const m = meta(c.key);
          if (!m) return null;
          return (
            <li key={`${c.key}-${i}`} className="flex items-center gap-3 px-4 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" checked={c.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" />
                <span className="truncate">{m.name}</span>
                <span className="text-[11px] text-faint">{m.pane === 'overlay' ? 'on price' : 'own pane'}</span>
              </label>
              <div className="flex gap-1">
                {m.params.map((p, j) => (
                  <input
                    key={p.name}
                    type="number"
                    title={p.label}
                    aria-label={`${m.name} ${p.label}`}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={c.params[j] ?? p.default}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isNaN(v)) return;
                      const params = [...c.params];
                      params[j] = Math.min(p.max, Math.max(p.min, v));
                      update(i, { params });
                    }}
                    className="field num h-7 w-14 px-1.5 text-center text-xs"
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-rule px-4 py-2">
        <button
          className="text-xs text-muted hover:text-ink"
          onClick={() => {
            const k = catalog.find((m) => m.pane === 'overlay')?.key ?? 'sma';
            const m = meta(k)!;
            onChange([...config, { key: k, params: m.params.map((p) => p.default), enabled: true }]);
          }}
        >
          + Add another SMA/EMA to compare
        </button>
      </div>
    </div>
  );
}

export function ChartWorkspace({ symbol, available, compact = false, initialTf = '1d' }: { symbol: string; available: Timeframe[]; compact?: boolean; initialTf?: Timeframe }) {
  const user = useAuth((s) => s.user);
  const saved = (user?.preferences?.chart_config as { indicators?: IndicatorConfig[]; kind?: ChartKind } | undefined) ?? {};
  const [tf, setTf] = useState<Timeframe>(available.includes(initialTf) ? initialTf : available[available.length - 1] ?? '1d');
  const [kind, setKind] = useState<ChartKind>(saved.kind ?? 'candles');
  const [config, setConfig] = useState<IndicatorConfig[]>(saved.indicators?.length ? saved.indicators : DEFAULT_CONFIG);
  const catalog = useIndicatorCatalog();
  const prefs = useUpdatePreferences();
  const live = useLive((s) => s.ticks[symbol]);

  useEffect(() => {
    if (!available.includes(tf) && available.length) setTf(available.includes('1d') ? '1d' : available[0]);
  }, [available, tf]);

  const candles = useCandles(symbol, tf, compact ? 300 : 800);
  const enabled = config.filter((c) => c.enabled);
  const specs = useMemo(() => enabled.map(spec), [enabled]);
  const ind = useIndicators(symbol, tf, specs, compact ? 300 : 800);

  const overlays = useMemo(() => (ind.data?.indicators ?? []).filter((i) => i.pane === 'overlay'), [ind.data]);
  const panes = useMemo(() => (compact ? [] : (ind.data?.indicators ?? []).filter((i) => i.pane === 'separate')), [ind.data, compact]);
  const intraday = INTRADAY.includes(tf);
  const liveBar = useMemo(() => (live && !compact ? { price: live.price, time: live.time } : null), [live, compact]);

  const save = () =>
    prefs.mutate(
      { chart_config: { indicators: config, kind } },
      { onSuccess: () => toast.success('Chart layout saved to your profile'), onError: (e) => toast.error(e.message) },
    );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-2">
        <Segmented value={tf} onChange={setTf} items={ALL_TF.filter((t) => available.includes(t)).map((t) => ({ value: t, label: t }))} />
        <div className="flex items-center gap-0.5">
          {(
            [
              ['candles', CandlestickChart, 'Candles'],
              ['line', LineIcon, 'Line'],
              ['area', AreaChart, 'Area'],
            ] as const
          ).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setKind(k)} aria-label={`${label} chart`} title={label} className={cn('rounded p-1.5 transition-colors', kind === k ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {!compact && catalog.data && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button size="sm" variant="ghost">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Indicators · {enabled.length}
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="start" sideOffset={6} className="z-50 rounded-card border border-line bg-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
                <IndicatorPicker catalog={catalog.data} config={config} onChange={setConfig} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        <div className="ml-auto flex items-center gap-2">
          {ind.isFetching && <span className="text-xs text-faint">Calculating…</span>}
          <SourceBadge source={candles.data?.data_source} />
          {!compact && (
            <Button size="sm" variant="ghost" onClick={save} loading={prefs.isPending} title="Save indicators and chart type to your profile">
              <Save className="h-3.5 w-3.5" /> Save layout
            </Button>
          )}
        </div>
      </div>
      {candles.isError ? (
        <ErrorState error={candles.error} onRetry={() => candles.refetch()} />
      ) : !candles.data ? (
        <Skeleton className="h-[440px] w-full rounded-none" />
      ) : candles.data.candles.length < 2 ? (
        <div className="flex h-[300px] items-center justify-center text-[13px] text-muted">No {tf} bars in the dataset for {symbol}.</div>
      ) : (
        <PriceChart candles={candles.data.candles} kind={kind} overlays={overlays} panes={panes} intraday={intraday} height={compact ? 320 : 440} live={liveBar} />
      )}
    </div>
  );
}
