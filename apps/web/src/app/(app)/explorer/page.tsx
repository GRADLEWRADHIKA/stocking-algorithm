'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, Rows3, SlidersHorizontal, X } from 'lucide-react';
import { useSectors, useStocks, type StockQuery } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { Page, PageHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { SourceBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { FlashPrice } from '@/components/ui/numbers';
import { Sparkline } from '@/components/charts/Sparkline';
import { compact, pct, price, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ScreenKey, StockSummary } from '@shared/types/api';

const SCREENS: { value: ScreenKey | ''; label: string; hint: string }[] = [
  { value: '', label: 'All', hint: 'Every active instrument' },
  { value: 'gainers', label: 'Gainers', hint: 'Positive change today, strongest first' },
  { value: 'losers', label: 'Losers', hint: 'Negative change today, weakest first' },
  { value: 'momentum', label: 'Momentum', hint: '20-day rate of change above 5% with volume above its 20-day average' },
  { value: 'breakout', label: 'Breakouts', hint: 'Close above the prior 20-day high on above-average volume' },
  { value: 'ma_crossover', label: 'MA crossover', hint: 'EMA 20 crossed EMA 50 within the last 5 sessions' },
  { value: 'high_volatility', label: 'High volatility', hint: '20-day annualised volatility in the top quintile' },
  { value: 'oversold', label: 'Oversold', hint: 'RSI 14 below 30' },
  { value: 'overbought', label: 'Overbought', hint: 'RSI 14 above 70' },
];

const SORTS = [
  { v: '-change_pct', l: 'Change, high to low' },
  { v: 'change_pct', l: 'Change, low to high' },
  { v: '-volume', l: 'Volume, high to low' },
  { v: '-price', l: 'Price, high to low' },
  { v: 'price', l: 'Price, low to high' },
  { v: 'symbol', l: 'Symbol A–Z' },
];

function StockCard({ s, i }: { s: StockSummary; i: number }) {
  const live = useLive((st) => st.ticks[s.symbol]);
  const c = live?.change_pct ?? s.change_pct;
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
      <Link href={`/stocks/${s.symbol}`} className="panel block p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-faint">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{s.symbol}</div>
            <div className="truncate text-xs text-muted">{s.name}</div>
          </div>
          <span className="flex-none text-[11px] text-faint">{s.exchange}</span>
        </div>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <FlashPrice value={live?.price ?? s.price} dir={live?.dir} className="text-base" />
            <div className={cn('num text-xs', toneClass(c))}>{pct(c)}</div>
          </div>
          <Sparkline data={s.sparkline} width={88} height={32} />
        </div>
        <div className="mt-3 flex justify-between text-[11px] text-muted">
          <span>{s.sector}</span>
          <span className="num">Vol {compact(live?.volume ?? s.volume)}</span>
        </div>
      </Link>
    </motion.div>
  );
}

function Explorer() {
  const params = useSearchParams();
  const router = useRouter();
  const sectors = useSectors();
  const ticks = useLive((s) => s.ticks);
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [f, setF] = useState<StockQuery>({
    sector: params.get('sector') ?? '',
    exchange: '',
    screen: (params.get('screen') as ScreenKey) ?? '',
    sort: '-change_pct',
    min_price: null,
    max_price: null,
    min_volume: null,
    min_mcap: null,
    max_mcap: null,
    limit: 50,
    offset: 0,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => ({ ...f, q: debounced }), [f, debounced]);
  const { data, isLoading, isError, error, refetch, isFetching } = useStocks(query);
  const set = (p: Partial<StockQuery>) => setF((o) => ({ ...o, offset: 0, ...p }));
  const activeFilters = [f.sector, f.exchange, f.min_price, f.max_price, f.min_volume, f.min_mcap, f.max_mcap].filter((v) => v !== '' && v !== null && v !== undefined).length;
  const num = (v: string) => (v === '' ? null : Number(v));
  const screen = SCREENS.find((s) => s.value === f.screen);

  return (
    <Page>
      <PageHeader
        title="Stock explorer"
        sub={
          <>
            <span>{data ? `${data.total} instruments match` : 'Searching…'}</span>
            <SourceBadge source={data?.items[0]?.data_source ?? 'SIMULATED'} />
          </>
        }
        actions={
          <Button size="sm" variant="ghost" onClick={() => router.push('/strategies?mode=screen')}>
            Build a custom screen
          </Button>
        }
      />

      <Tabs value={f.screen ?? ''} onChange={(v) => set({ screen: v as ScreenKey | '' })} items={SCREENS.map((s) => ({ value: s.value, label: s.label }))} />
      <p className="mt-2 text-xs text-muted">{screen?.hint}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or ticker" className="h-8 w-full sm:w-64" aria-label="Search by company or ticker" />
        <Select value={f.sector} onChange={(e) => set({ sector: e.target.value })} className="h-8 w-auto text-xs" aria-label="Sector">
          <option value="">All sectors</option>
          {(sectors.data ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="h-8 w-auto text-xs" aria-label="Sort">
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </Select>
        <Button size="sm" variant={showFilters || activeFilters ? 'secondary' : 'ghost'} onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {isFetching && <span className="mr-2 text-xs text-faint">Updating…</span>}
          <button onClick={() => setView('table')} className={cn('rounded p-1.5', view === 'table' ? 'bg-raised text-ink' : 'text-muted hover:text-ink')} aria-label="Table view">
            <Rows3 className="h-4 w-4" />
          </button>
          <button onClick={() => setView('cards')} className={cn('rounded p-1.5', view === 'cards' ? 'bg-raised text-ink' : 'text-muted hover:text-ink')} aria-label="Card view">
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-4 lg:grid-cols-7">
              <label className="space-y-1">
                <span className="label">Exchange</span>
                <Select value={f.exchange} onChange={(e) => set({ exchange: e.target.value })} className="h-8 text-xs">
                  <option value="">Any</option>
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </Select>
              </label>
              {(
                [
                  ['min_price', 'Min price ₹'],
                  ['max_price', 'Max price ₹'],
                  ['min_volume', 'Min volume'],
                  ['min_mcap', 'Min mcap ₹Cr'],
                  ['max_mcap', 'Max mcap ₹Cr'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="space-y-1">
                  <span className="label">{l}</span>
                  <Input type="number" min={0} value={f[k] ?? ''} onChange={(e) => set({ [k]: num(e.target.value) })} className="num h-8 text-xs" />
                </label>
              ))}
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => set({ sector: '', exchange: '', min_price: null, max_price: null, min_volume: null, min_mcap: null, max_mcap: null })}
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4">
        {isLoading ? (
          <div className="panel">
            <SkeletonRows rows={10} />
          </div>
        ) : isError ? (
          <div className="panel">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="panel">
            <EmptyState title="Nothing matches these conditions" body="Loosen a filter or pick another screen." />
          </div>
        ) : view === 'cards' ? (
          <motion.div layout className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence>
              {data.items.map((s, i) => (
                <StockCard key={s.symbol} s={s} i={i} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="hidden md:table-cell">Company</th>
                  <th className="hidden lg:table-cell">Sector</th>
                  <th className="r">Price</th>
                  <th className="r">Change</th>
                  <th className="r hidden sm:table-cell">Volume</th>
                  <th className="r hidden lg:table-cell">Mcap ₹Cr</th>
                  <th className="r hidden md:table-cell">30 sessions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s, i) => {
                  const l = ticks[s.symbol];
                  const c = l?.change_pct ?? s.change_pct;
                  return (
                    <motion.tr
                      key={s.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 20) * 0.015 }}
                      className="row-link cursor-pointer"
                      onClick={() => router.push(`/stocks/${s.symbol}`)}
                    >
                      <td>
                        <span className="font-medium">{s.symbol}</span>
                        <span className="ml-2 text-[11px] text-faint">{s.exchange}</span>
                      </td>
                      <td className="hidden max-w-[240px] truncate text-muted md:table-cell">{s.name}</td>
                      <td className="hidden text-muted lg:table-cell">{s.sector}</td>
                      <td className="r">
                        <FlashPrice value={l?.price ?? s.price} dir={l?.dir} />
                      </td>
                      <td className={cn('r num', toneClass(c))}>{pct(c)}</td>
                      <td className="r num hidden sm:table-cell">{compact(l?.volume ?? s.volume)}</td>
                      <td className="r num hidden text-muted lg:table-cell">{s.market_cap ? price(s.market_cap, 0) : '—'}</td>
                      <td className="r hidden md:table-cell">
                        <span className="inline-block">
                          <Sparkline data={s.sparkline} width={80} height={22} />
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span className="num">
              {data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={data.offset === 0} onClick={() => setF((o) => ({ ...o, offset: Math.max(0, (o.offset ?? 0) - (o.limit ?? 50)) }))}>
                Previous
              </Button>
              <Button size="sm" disabled={data.offset + data.limit >= data.total} onClick={() => setF((o) => ({ ...o, offset: (o.offset ?? 0) + (o.limit ?? 50) }))}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense>
      <Explorer />
    </Suspense>
  );
}
