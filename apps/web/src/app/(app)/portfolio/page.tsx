'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/hooks/queries';
import { api } from '@/lib/api';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { SourceBadge } from '@/components/ui/badge';
import { AnimatedNumber } from '@/components/ui/numbers';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Donut } from '@/components/charts/Donut';
import { LineChart } from '@/components/charts/LineChart';
import { AccountSwitcher, NewAccountButton, useActiveAccount } from '@/components/trading/AccountSwitcher';
import { inr, pct, price, signedInr, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';

function Row({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex justify-between border-t border-rule py-2 text-[13px] first:border-t-0">
      <span className="text-muted">{k}</span>
      <span className={cn('num', cls)}>{v}</span>
    </div>
  );
}

export default function PortfolioPage() {
  const acc = useActiveAccount();
  const q = usePortfolio(acc?.id ?? null);
  const [downloading, setDownloading] = useState(false);
  const d = q.data;

  const eq = useMemo(() => (d ? [{ name: 'Equity', color: 'rgb(var(--accent))', fill: true, points: d.equity_history.map((p) => ({ time: p.time, value: p.equity })) }] : []), [d]);

  const download = async () => {
    if (!acc) return;
    setDownloading(true);
    try {
      const res = await api<Response>(`/portfolio/${acc.id}/report.csv`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quantdesk-paper-${acc.name.replace(/\W+/g, '-').toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Report failed', { description: (e as Error).message });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Portfolio"
        sub={
          <>
            <span>{acc ? `${acc.name}, valued at simulated prices` : 'Paper portfolios'}</span>
            <SourceBadge source="PAPER_TRADING" />
          </>
        }
        actions={
          <>
            <AccountSwitcher />
            <Button size="sm" onClick={download} loading={downloading} disabled={!acc}>
              <Download className="h-3.5 w-3.5" /> CSV report
            </Button>
          </>
        }
      />
      {!acc ? (
        <div className="panel">
          <EmptyState title="No paper account" action={<NewAccountButton />} />
        </div>
      ) : q.isError ? (
        <div className="panel">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : !d ? (
        <div className="panel">
          <SkeletonRows rows={10} />
        </div>
      ) : (
        <Stagger className="grid grid-cols-12 gap-4">
          <Panel className="col-span-12 lg:col-span-8" bodyClassName="p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="label">Equity</div>
                <AnimatedNumber value={d.account.equity} format={(v) => inr(v)} className="block text-[32px] font-medium leading-tight tracking-tight" />
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
                  <span>
                    Invested <span className="num text-ink">{inr(d.account.holdings_value - d.account.unrealized_pnl, 0)}</span>
                  </span>
                  <span>
                    Today <span className={cn('num', toneClass(d.account.day_pnl))}>{signedInr(d.account.day_pnl, 0)}</span>
                  </span>
                  <span>
                    Since start <span className={cn('num', toneClass(d.account.total_return_pct))}>{pct(d.account.total_return_pct)}</span> on {inr(d.account.initial_capital, 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              {eq[0]?.points.length > 1 ? <LineChart series={eq} height={240} format={(v) => `₹${(v / 100000).toFixed(2)}L`} /> : <EmptyState title="Equity history starts after the first trading day" />}
            </div>
          </Panel>
          <Panel className="col-span-12 lg:col-span-4" title="Risk exposure" bodyClassName="px-4 py-2">
            <Row k="Largest position" v={pct(d.risk.largest_position_pct, 1, false)} cls={d.risk.largest_position_pct > 25 ? 'text-warn' : ''} />
            <Row k="Top sector weight" v={pct(d.risk.top_sector_pct, 1, false)} cls={d.risk.top_sector_pct > 40 ? 'text-warn' : ''} />
            <Row k="Cash" v={pct(d.risk.cash_pct, 1, false)} />
            <Row k="Volatility (ann.)" v={pct(d.risk.portfolio_volatility_pct, 1, false)} />
            <Row k="Beta vs NIFTY 50" v={d.risk.portfolio_beta?.toFixed(2) ?? '—'} />
            <Row k="1-day VaR, 95%" v={d.risk.var_95_1d === null ? '—' : inr(d.risk.var_95_1d, 0)} />
            <div className="mt-3 border-t border-rule pt-3">
              <div className="label mb-2">Trading statistics</div>
              <Row k="Closed trades" v={d.stats.total_trades} />
              <Row k="Won / lost" v={`${d.stats.winning_trades} / ${d.stats.losing_trades}`} />
              <Row k="Win rate" v={d.stats.win_rate === null ? '—' : pct(d.stats.win_rate, 1, false)} />
              <Row k="Best / worst" v={`${signedInr(d.stats.best_trade, 0)} / ${signedInr(d.stats.worst_trade, 0)}`} />
              <Row k="Avg holding" v={d.stats.avg_holding_days === null ? '—' : `${d.stats.avg_holding_days.toFixed(1)} days`} />
            </div>
          </Panel>
          <Panel className="col-span-12 md:col-span-6 lg:col-span-4" title="By holding" bodyClassName="p-4">
            {d.allocation_by_symbol.length ? <Donut parts={d.allocation_by_symbol} center={<span className="text-[11px] text-muted">{d.allocation_by_symbol.length} lines</span>} /> : <EmptyState title="All cash" />}
          </Panel>
          <Panel className="col-span-12 md:col-span-6 lg:col-span-4" title="By sector" bodyClassName="p-4">
            {d.allocation_by_sector.length ? <Donut parts={d.allocation_by_sector} center={<span className="text-[11px] text-muted">{d.allocation_by_sector.length} sectors</span>} /> : <EmptyState title="All cash" />}
          </Panel>
          <Panel className="col-span-12 lg:col-span-4" title="Holdings" action={<Link href="/paper-trading" className="text-xs text-muted hover:text-ink">Trade</Link>}>
            {d.positions.length === 0 ? (
              <EmptyState title="No holdings" />
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="r">Value</th>
                    <th className="r">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {d.positions.map((p) => (
                    <tr key={p.symbol}>
                      <td>
                        <Link href={`/stocks/${p.symbol}`} className="font-medium hover:text-accent">
                          {p.symbol}
                        </Link>
                        <div className="num text-[11px] text-faint">
                          {p.quantity} × {price(p.avg_price)}
                        </div>
                      </td>
                      <td className="r num">{inr(p.market_value, 0)}</td>
                      <td className={cn('r num', toneClass(p.unrealized_pnl))}>
                        {signedInr(p.unrealized_pnl, 0)}
                        <div className="text-[11px]">{pct(p.unrealized_pnl_pct)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </Stagger>
      )}
    </Page>
  );
}
