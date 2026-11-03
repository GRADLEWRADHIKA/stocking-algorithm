'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMarketOverview, useStocks } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { SourceBadge } from '@/components/ui/badge';
import { ErrorState, SkeletonRows } from '@/components/ui/states';
import { IndexStrip, SectorBars, BreadthBar } from '@/components/market/MarketBlocks';
import { QuoteTable } from '@/components/market/QuoteTable';
import { Segmented } from '@/components/ui/tabs';
import { compact, pct, price } from '@/lib/format';
import type { StockSummary } from '@shared/types/api';

/** Heat colour: one hue per sign, intensity by magnitude (capped at ±3%). */
function heat(c: number) {
  const a = Math.min(1, Math.abs(c) / 3);
  const alpha = 0.12 + a * 0.6;
  return c >= 0 ? `rgb(var(--up) / ${alpha})` : `rgb(var(--down) / ${alpha})`;
}

function Heatmap({ stocks, sizeBy }: { stocks: StockSummary[]; sizeBy: 'mcap' | 'equal' }) {
  const ticks = useLive((s) => s.ticks);
  const bySector = useMemo(() => {
    const m = new Map<string, StockSummary[]>();
    stocks.forEach((s) => m.set(s.sector, [...(m.get(s.sector) ?? []), s]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [stocks]);

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {bySector.map(([sector, list], gi) => {
        const total = list.reduce((s, x) => s + (x.market_cap ?? 1), 0);
        return (
          <div key={sector}>
            <div className="mb-1.5 text-xs text-muted">{sector}</div>
            <div className="flex flex-wrap gap-1">
              {[...list]
                .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
                .map((s, i) => {
                  const l = ticks[s.symbol];
                  const c = l?.change_pct ?? s.change_pct;
                  const grow = sizeBy === 'mcap' ? Math.max(0.6, ((s.market_cap ?? 1) / total) * list.length) : 1;
                  return (
                    <motion.div
                      key={s.symbol}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: gi * 0.05 + i * 0.02, duration: 0.35 }}
                      style={{ flexGrow: grow, flexBasis: `${70 * grow}px` }}
                      className="min-w-[70px]"
                    >
                      <Link
                        href={`/stocks/${s.symbol}`}
                        className="flex h-16 flex-col justify-center rounded px-2 transition-[filter,transform,background-color] duration-500 hover:brightness-125 active:scale-[0.98]"
                        style={{ background: heat(c) }}
                        title={`${s.name} · ${price(l?.price ?? s.price)} · ${pct(c)}`}
                      >
                        <span className="truncate text-xs font-semibold text-ink">{s.symbol}</span>
                        <span className="num text-[11px] text-ink/80">{pct(c)}</span>
                      </Link>
                    </motion.div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MarketsPage() {
  const overview = useMarketOverview();
  const stocks = useStocks({ limit: 200, sort: '-change_pct' });
  const [sizeBy, setSizeBy] = useState<'mcap' | 'equal'>('mcap');
  const o = overview.data;

  return (
    <Page>
      <PageHeader
        title="Markets"
        sub={
          <>
            <span>NSE and BSE universe, intraday heat by percentage change</span>
            <SourceBadge source={o?.data_source} />
          </>
        }
      />
      {overview.isError ? (
        <div className="panel">
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        </div>
      ) : (
        <Stagger className="grid grid-cols-12 gap-4">
          <Panel className="col-span-12">{o ? <IndexStrip indices={o.indices} /> : <SkeletonRows rows={2} />}</Panel>
          <Panel
            className="col-span-12"
            title="Heat map by sector"
            action={
              <Segmented
                value={sizeBy}
                onChange={setSizeBy}
                items={[
                  { value: 'mcap', label: 'Size by market cap' },
                  { value: 'equal', label: 'Equal size' },
                ]}
              />
            }
          >
            {stocks.data ? <Heatmap stocks={stocks.data.items} sizeBy={sizeBy} /> : <SkeletonRows rows={6} />}
          </Panel>
          <Panel className="col-span-12 lg:col-span-5" title="Sector performance" bodyClassName="p-4">
            {o ? (
              <>
                <BreadthBar {...o.breadth} />
                <div className="mt-5">
                  <SectorBars sectors={o.sectors} />
                </div>
              </>
            ) : (
              <SkeletonRows rows={8} />
            )}
          </Panel>
          <Panel className="col-span-12 md:col-span-6 lg:col-span-4" title="Most active by traded value">
            {o ? <QuoteTable rows={o.most_active} metric="value" limit={8} /> : <SkeletonRows />}
          </Panel>
          <Panel className="col-span-12 md:col-span-6 lg:col-span-3" title="Highest volume">
            {o ? (
              <ul>
                {o.highest_volume.slice(0, 8).map((q) => (
                  <li key={q.symbol} className="border-t border-rule first:border-t-0">
                    <Link href={`/stocks/${q.symbol}`} className="flex h-10 items-center px-4 hover:bg-raised/60">
                      <span className="font-medium">{q.symbol}</span>
                      <span className="num ml-auto">{compact(q.volume)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <SkeletonRows />
            )}
          </Panel>
        </Stagger>
      )}
    </Page>
  );
}
