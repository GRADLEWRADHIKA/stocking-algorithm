'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Radar, Sparkles } from 'lucide-react';
import { useAccounts, useMarketOverview, useOrders, useScanSignals, useSignals, useWatchlists } from '@/hooks/queries';
import { useUi } from '@/stores/ui';
import { useLive } from '@/stores/live';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { SourceBadge } from '@/components/ui/badge';
import { AnimatedNumber } from '@/components/ui/numbers';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { BreadthBar, IndexStrip, SectorBars, SignalsTable } from '@/components/market/MarketBlocks';
import { QuoteTable } from '@/components/market/QuoteTable';
import { Tabs } from '@/components/ui/tabs';
import { dateTime, inr, pct, price, signedInr, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';

function PortfolioSnapshot() {
  const { data: accounts, isLoading } = useAccounts();
  const activeId = useUi((s) => s.activeAccountId);
  const acc = accounts?.find((a) => a.id === activeId) ?? accounts?.[0];
  const orders = useOrders(acc?.id ?? null);
  if (isLoading) return <SkeletonRows rows={4} />;
  if (!acc)
    return (
      <EmptyState
        title="No paper account yet"
        body="Create a virtual account to start simulated trading."
        action={
          <Button asChild size="sm" variant="primary">
            <Link href="/paper-trading">Open paper trading</Link>
          </Button>
        }
      />
    );
  const recent = (orders.data ?? []).filter((o) => o.status === 'FILLED').slice(0, 4);
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <div className="label">{acc.name} · equity</div>
        <AnimatedNumber value={acc.equity} format={(v) => inr(v)} className="mt-1 block text-[30px] font-medium leading-tight tracking-tight" />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-muted">
            Today <span className={cn('num', toneClass(acc.day_pnl))}>{signedInr(acc.day_pnl)}</span>
          </span>
          <span className="text-muted">
            Since start <span className={cn('num', toneClass(acc.total_return_pct))}>{pct(acc.total_return_pct)}</span>
          </span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 border-y border-rule">
        {[
          ['Cash', inr(acc.cash_balance, 0)],
          ['Holdings', inr(acc.holdings_value, 0)],
          ['Unrealised', signedInr(acc.unrealized_pnl, 0)],
        ].map(([k, v], i) => (
          <div key={k} className={cn('px-4 py-3', i > 0 && 'border-l border-rule')}>
            <dt className="label">{k}</dt>
            <dd className={cn('num mt-0.5 text-[13px]', k === 'Unrealised' && toneClass(acc.unrealized_pnl))}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex-1 px-4 py-3">
        <div className="label mb-2">Recent paper fills</div>
        {recent.length === 0 ? (
          <p className="text-xs text-muted">No filled orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-xs">
                <span className={cn('w-8 font-semibold', o.side === 'BUY' ? 'text-up' : 'text-down')}>{o.side}</span>
                <span className="font-medium">{o.symbol}</span>
                <span className="num text-muted">
                  {o.filled_quantity} @ {price(o.avg_fill_price)}
                </span>
                <span className="num ml-auto text-faint">{dateTime(o.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link href="/portfolio" className="flex items-center justify-between border-t border-rule px-4 py-2.5 text-xs text-muted transition-colors hover:text-ink">
        Open portfolio <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function WatchlistSummary() {
  const { data, isLoading } = useWatchlists();
  const ticks = useLive((s) => s.ticks);
  const wl = data?.[0];
  if (isLoading) return <SkeletonRows rows={4} />;
  if (!wl || wl.items.length === 0)
    return <EmptyState title="Watchlist is empty" body="Add symbols from any stock page." action={<Button asChild size="sm"><Link href="/watchlist">Go to watchlists</Link></Button>} />;
  return (
    <ul>
      {wl.items.slice(0, 6).map((it) => {
        const l = ticks[it.symbol];
        const c = l?.change_pct ?? it.change_pct;
        return (
          <li key={it.symbol} className="border-t border-rule first:border-t-0">
            <Link href={`/stocks/${it.symbol}`} className="flex h-10 items-center gap-3 px-4 hover:bg-raised/60">
              <span className="w-24 font-medium">{it.symbol}</span>
              <span className="num ml-auto">{price(l?.price ?? it.price)}</span>
              <span className={cn('num w-16 text-right text-xs', toneClass(c))}>{pct(c)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const [date, setDate] = useState('');
  const overview = useMarketOverview(date || undefined);
  const signals = useSignals({ limit: 8 });
  const scan = useScanSignals();
  const [movers, setMovers] = useState<'gainers' | 'losers' | 'active' | 'volume'>('gainers');
  const o = overview.data;

  return (
    <Page>
      <PageHeader
        title="Market overview"
        sub={
          <>
            <span>{o ? `${date ? 'Replay of the session on' : 'As of'} ${dateTime(o.as_of, !date)} IST` : 'Loading session…'}</span>
            <SourceBadge source={o?.data_source} />
          </>
        }
        actions={
          <>
            <label className="sr-only" htmlFor="replay">
              Replay a past session
            </label>
            <input
              id="replay"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="field h-8 w-[150px] text-xs"
              title="Replay a past session from the dataset"
            />
            {date && (
              <Button size="sm" variant="ghost" onClick={() => setDate('')}>
                Back to live
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => scan.mutate({})} loading={scan.isPending}>
              <Radar className="h-3.5 w-3.5" /> Run signal scan
            </Button>
          </>
        }
      />

      {overview.isError ? (
        <div className="panel">
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        </div>
      ) : (
        <Stagger className="grid grid-cols-12 gap-4">
          <Panel className="col-span-12" bodyClassName="">
            {o ? <IndexStrip indices={o.indices} /> : <SkeletonRows rows={2} />}
          </Panel>

          <Panel
            className="col-span-12 xl:col-span-8"
            title="Breadth and sectors"
            action={<span className="text-xs text-muted">{o ? `${o.breadth.advancers + o.breadth.decliners + o.breadth.unchanged} stocks in universe` : ''}</span>}
            bodyClassName="p-4"
          >
            {o ? (
              <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
                <div>
                  <BreadthBar {...o.breadth} />
                  <div className="mt-6">
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                      <Sparkles className="h-3.5 w-3.5 text-accent" /> Session summary, computed from the figures on this page
                    </div>
                    <ul className="space-y-2 text-[13px] leading-relaxed">
                      {o.market_summary.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-2 h-1 w-1 flex-none rounded-full bg-faint" />
                          {line}
                        </li>
                      ))}
                    </ul>
                    <Link href="/assistant?q=Summarize%20today%27s%20market" className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                      Ask the assistant for more <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
                <SectorBars sectors={o.sectors} />
              </div>
            ) : (
              <SkeletonRows rows={6} />
            )}
          </Panel>

          <Panel className="col-span-12 md:col-span-6 xl:col-span-4" title="Paper portfolio" action={<SourceBadge source="PAPER_TRADING" />}>
            <PortfolioSnapshot />
          </Panel>

          <Panel
            className="col-span-12 md:col-span-6 xl:col-span-4"
            title={
              <Tabs
                ruled={false}
                size="sm"
                value={movers}
                onChange={setMovers}
                items={[
                  { value: 'gainers', label: 'Top gainers' },
                  { value: 'losers', label: 'Top losers' },
                  { value: 'active', label: 'Most active' },
                  { value: 'volume', label: 'Volume' },
                ]}
              />
            }
          >
            {o ? (
              <QuoteTable
                key={movers}
                rows={movers === 'gainers' ? o.top_gainers : movers === 'losers' ? o.top_losers : movers === 'active' ? o.most_active : o.highest_volume}
                metric={movers === 'active' ? 'value' : movers === 'volume' ? 'volume' : 'change'}
                limit={6}
              />
            ) : (
              <SkeletonRows />
            )}
          </Panel>

          <Panel
            className="col-span-12 xl:col-span-5"
            title="Latest strategy signals"
            action={
              <Link href="/signals" className="text-xs text-muted hover:text-ink">
                View all
              </Link>
            }
          >
            {signals.isLoading ? (
              <SkeletonRows />
            ) : signals.isError ? (
              <ErrorState error={signals.error} onRetry={() => signals.refetch()} />
            ) : (signals.data ?? []).length === 0 ? (
              <EmptyState title="No signals stored yet" body="Run a scan to evaluate every built-in strategy across the universe." />
            ) : (
              <SignalsTable signals={(signals.data ?? []).slice(0, 6)} compact />
            )}
          </Panel>

          <Panel
            className="col-span-12 md:col-span-6 xl:col-span-3"
            title="Watchlist"
            action={
              <Link href="/watchlist" className="text-xs text-muted hover:text-ink">
                Manage
              </Link>
            }
          >
            <WatchlistSummary />
          </Panel>
        </Stagger>
      )}
    </Page>
  );
}
