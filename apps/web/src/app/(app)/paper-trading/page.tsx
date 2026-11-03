'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useCancelOrder, useOrders, usePositions, useTransactions } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Badge, SourceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { AnimatedNumber, FlashPrice } from '@/components/ui/numbers';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { OrderTicket } from '@/components/trading/OrderTicket';
import { AccountSwitcher, NewAccountButton, useActiveAccount } from '@/components/trading/AccountSwitcher';
import { dateTime, inr, pct, price, signedInr, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@shared/types/api';

const STATUS_TONE: Record<OrderStatus, 'neutral' | 'up' | 'down' | 'warn' | 'info'> = {
  PENDING: 'warn',
  OPEN: 'info',
  FILLED: 'up',
  CANCELLED: 'neutral',
  REJECTED: 'down',
};

export default function PaperTradingPage() {
  const acc = useActiveAccount();
  const id = acc?.id ?? null;
  const [tab, setTab] = useState<'positions' | 'open' | 'executed' | 'all' | 'ledger'>('positions');
  const positions = usePositions(id);
  const orders = useOrders(id);
  const tx = useTransactions(id);
  const cancel = useCancelOrder(id);
  const ticks = useLive((s) => s.ticks);

  const openOrders = (orders.data ?? []).filter((o) => o.status === 'OPEN' || o.status === 'PENDING');
  const executed = (orders.data ?? []).filter((o) => o.status === 'FILLED');
  const list = tab === 'open' ? openOrders : tab === 'executed' ? executed : orders.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Paper trading"
        sub={
          <>
            <span>Simulated orders against the local market feed. Virtual money only.</span>
            <SourceBadge source="PAPER_TRADING" />
          </>
        }
        actions={
          <>
            <AccountSwitcher />
            <NewAccountButton />
          </>
        }
      />
      {!acc ? (
        <div className="panel">
          <EmptyState title="No paper account" body="Create one with virtual capital to start trading." action={<NewAccountButton />} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Stagger className="min-w-0 space-y-4">
            <Panel>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                {(
                  [
                    ['Equity', <AnimatedNumber key="e" value={acc.equity} format={(v) => inr(v, 0)} className="text-[22px]" />, ''],
                    ['Available cash', inr(acc.cash_balance, 0), ''],
                    ['Blocked for orders', inr(acc.blocked_margin, 0), 'text-muted'],
                    ['Realised P&L', signedInr(acc.realized_pnl, 0), toneClass(acc.realized_pnl)],
                    ['Unrealised P&L', signedInr(acc.unrealized_pnl, 0), toneClass(acc.unrealized_pnl)],
                    ['Return since start', pct(acc.total_return_pct), toneClass(acc.total_return_pct)],
                  ] as const
                ).map(([k, v, c]) => (
                  <div key={k} className="border-b border-r border-rule px-4 py-3">
                    <div className="label">{k}</div>
                    <div className={cn('num mt-1 whitespace-nowrap text-[17px]', c)}>{v}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title={
                <Tabs
                  ruled={false}
                  size="sm"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: 'positions', label: `Positions · ${positions.data?.length ?? 0}` },
                    { value: 'open', label: `Open orders · ${openOrders.length}` },
                    { value: 'executed', label: 'Executed' },
                    { value: 'all', label: 'Order history' },
                    { value: 'ledger', label: 'Ledger' },
                  ]}
                />
              }
            >
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-x-auto">
                  {tab === 'positions' &&
                    (positions.isLoading ? (
                      <SkeletonRows />
                    ) : positions.isError ? (
                      <ErrorState error={positions.error} />
                    ) : (positions.data ?? []).length === 0 ? (
                      <EmptyState title="No open positions" body="Buy something with the ticket on the right." />
                    ) : (
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th className="r">Qty</th>
                            <th className="r">Avg price</th>
                            <th className="r">LTP</th>
                            <th className="r">Invested</th>
                            <th className="r">Market value</th>
                            <th className="r">Unrealised</th>
                            <th className="r">Day</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.data!.map((p) => {
                            const l = ticks[p.symbol];
                            const ltp = l?.price ?? p.ltp;
                            const mv = ltp * p.quantity;
                            const u = mv - p.invested;
                            return (
                              <tr key={p.symbol} className="row-link">
                                <td>
                                  <Link href={`/stocks/${p.symbol}`} className="font-medium hover:text-accent">
                                    {p.symbol}
                                  </Link>
                                  <div className="text-[11px] text-faint">{p.sector}</div>
                                </td>
                                <td className="r num">{p.quantity}</td>
                                <td className="r num">{price(p.avg_price)}</td>
                                <td className="r">
                                  <FlashPrice value={ltp} dir={l?.dir} />
                                </td>
                                <td className="r num">{inr(p.invested, 0)}</td>
                                <td className="r num">{inr(mv, 0)}</td>
                                <td className={cn('r num', toneClass(u))}>
                                  {signedInr(u, 0)}
                                  <div className="text-[11px]">{pct(p.invested ? (u / p.invested) * 100 : null)}</div>
                                </td>
                                <td className={cn('r num', toneClass(l?.change_pct ?? p.day_change_pct))}>{pct(l?.change_pct ?? p.day_change_pct)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ))}

                  {(tab === 'open' || tab === 'executed' || tab === 'all') &&
                    (orders.isLoading ? (
                      <SkeletonRows />
                    ) : list.length === 0 ? (
                      <EmptyState title={tab === 'open' ? 'No working orders' : 'No orders yet'} />
                    ) : (
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Placed</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th>Type</th>
                            <th className="r">Qty</th>
                            <th className="r">Limit / trigger</th>
                            <th className="r">Fill price</th>
                            <th>Status</th>
                            <th className="r" />
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence initial={false}>
                            {list.map((o) => (
                              <motion.tr key={o.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <td className="num text-xs text-muted">{dateTime(o.created_at)}</td>
                                <td className="font-medium">{o.symbol}</td>
                                <td className={o.side === 'BUY' ? 'text-up' : 'text-down'}>{o.side}</td>
                                <td className="text-xs text-muted">
                                  {o.order_type.replace('_', ' ').toLowerCase()}
                                  {o.parent_order_id ? ` · child of #${o.parent_order_id}` : ''}
                                </td>
                                <td className="r num">
                                  {o.filled_quantity}/{o.quantity}
                                </td>
                                <td className="r num">{price(o.limit_price ?? o.trigger_price)}</td>
                                <td className="r num">{price(o.avg_fill_price)}</td>
                                <td>
                                  <Badge tone={STATUS_TONE[o.status]}>{o.status.toLowerCase()}</Badge>
                                  {o.rejection_reason && <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-down" title={o.rejection_reason}>{o.rejection_reason}</div>}
                                </td>
                                <td className="r">
                                  {(o.status === 'OPEN' || o.status === 'PENDING') && (
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      loading={cancel.isPending && cancel.variables === o.id}
                                      onClick={() => cancel.mutate(o.id, { onSuccess: () => toast.success(`Order #${o.id} cancelled`), onError: (e) => toast.error(e.message) })}
                                    >
                                      Cancel
                                    </Button>
                                  )}
                                </td>
                              </motion.tr>
                            ))}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    ))}

                  {tab === 'ledger' &&
                    (tx.isLoading ? (
                      <SkeletonRows />
                    ) : (tx.data ?? []).length === 0 ? (
                      <EmptyState title="No transactions" />
                    ) : (
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Symbol</th>
                            <th className="r">Qty</th>
                            <th className="r">Price</th>
                            <th className="r">Amount</th>
                            <th className="r">Balance after</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tx.data!.map((t) => (
                            <tr key={t.id}>
                              <td className="num text-xs text-muted">{dateTime(t.created_at)}</td>
                              <td className="text-xs">{t.type.toLowerCase()}</td>
                              <td>{t.symbol ?? '—'}</td>
                              <td className="r num">{t.quantity ?? '—'}</td>
                              <td className="r num">{price(t.price)}</td>
                              <td className={cn('r num', toneClass(t.amount))}>{signedInr(t.amount)}</td>
                              <td className="r num">{inr(t.balance_after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ))}
                </motion.div>
              </AnimatePresence>
            </Panel>
          </Stagger>

          <div className="panel h-fit p-4 xl:sticky xl:top-24">
            <h2 className="mb-3 text-[13px] font-semibold">Order ticket</h2>
            <OrderTicket />
          </div>
        </div>
      )}
    </Page>
  );
}
