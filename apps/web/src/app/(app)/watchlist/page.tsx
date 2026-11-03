'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Reorder, AnimatePresence, motion } from 'framer-motion';
import { BellPlus, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAlertMutations, useAlerts, useWatchlistMutations, useWatchlists } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge, SourceBadge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { FlashPrice } from '@/components/ui/numbers';
import { EmptyState, SkeletonRows } from '@/components/ui/states';
import { SymbolSearch } from '@/components/layout/SymbolSearch';
import { compact, pct, relative, signed, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AlertType, WatchlistItem } from '@shared/types/api';

const ALERT_TYPES: { v: AlertType; l: string; needs: 'threshold' | 'period' | 'ma' }[] = [
  { v: 'PRICE_ABOVE', l: 'Price rises above', needs: 'threshold' },
  { v: 'PRICE_BELOW', l: 'Price falls below', needs: 'threshold' },
  { v: 'PCT_CHANGE_ABOVE', l: 'Day change above %', needs: 'threshold' },
  { v: 'PCT_CHANGE_BELOW', l: 'Day change below %', needs: 'threshold' },
  { v: 'RSI_ABOVE', l: 'RSI rises above', needs: 'period' },
  { v: 'RSI_BELOW', l: 'RSI falls below', needs: 'period' },
  { v: 'MA_CROSS_UP', l: 'Fast MA crosses above slow', needs: 'ma' },
  { v: 'MA_CROSS_DOWN', l: 'Fast MA crosses below slow', needs: 'ma' },
];

function Row({ it, onRemove }: { it: WatchlistItem; onRemove: () => void }) {
  const l = useLive((s) => s.ticks[it.symbol]);
  const c = l?.change_pct ?? it.change_pct;
  return (
    <Reorder.Item
      value={it.symbol}
      id={it.symbol}
      className="group grid cursor-grab grid-cols-[20px_1fr_auto] items-center gap-3 border-t border-rule bg-surface px-3 py-2.5 first:border-t-0 active:cursor-grabbing sm:grid-cols-[20px_1fr_110px_120px_90px_32px]"
      whileDrag={{ scale: 1.01, boxShadow: '0 12px 28px rgba(0,0,0,.35)', zIndex: 10 }}
    >
      <GripVertical className="h-4 w-4 text-faint" />
      <Link href={`/stocks/${it.symbol}`} className="min-w-0" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-medium hover:text-accent">{it.symbol}</div>
        <div className="truncate text-xs text-muted">{it.name}</div>
      </Link>
      <div className="text-right">
        <FlashPrice value={l?.price ?? it.price} dir={l?.dir} />
      </div>
      <div className={cn('num hidden text-right text-xs sm:block', toneClass(c))}>
        {signed(l?.change ?? it.change)} ({pct(c)})
      </div>
      <div className="num hidden text-right text-xs text-muted sm:block">{compact(l?.volume ?? it.volume)}</div>
      <button onClick={onRemove} className="hidden rounded p-1 text-faint opacity-0 transition hover:bg-down/10 hover:text-down group-hover:opacity-100 sm:block" aria-label={`Remove ${it.symbol}`}>
        <X className="h-3.5 w-3.5" />
      </button>
    </Reorder.Item>
  );
}

function AlertForm({ defaultSymbol }: { defaultSymbol?: string }) {
  const { create } = useAlertMutations();
  const [symbol, setSymbol] = useState(defaultSymbol ?? '');
  const [type, setType] = useState<AlertType>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');
  const [period, setPeriod] = useState('14');
  const [fast, setFast] = useState('20');
  const [slow, setSlow] = useState('50');
  const needs = ALERT_TYPES.find((a) => a.v === type)!.needs;
  useEffect(() => {
    if (defaultSymbol && !symbol) setSymbol(defaultSymbol);
  }, [defaultSymbol, symbol]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol) return toast.error('Choose a stock');
    if (needs !== 'ma' && (threshold === '' || Number.isNaN(Number(threshold)))) return toast.error('Enter a threshold');
    if (needs === 'ma' && Number(fast) >= Number(slow)) return toast.error('Fast period must be shorter than slow');
    create.mutate(
      {
        symbol,
        alert_type: type,
        threshold: needs === 'ma' ? null : Number(threshold),
        params: needs === 'period' ? { period: Number(period) } : needs === 'ma' ? { fast: Number(fast), slow: Number(slow) } : {},
      },
      { onSuccess: (a) => toast.success('Alert armed', { description: a.description }), onError: (er) => toast.error(er.message) },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-4">
      <Field label="Stock">
        {symbol ? (
          <div className="flex items-center justify-between rounded-ctl border border-line px-3 py-1.5 text-[13px]">
            <span className="font-medium">{symbol}</span>
            <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setSymbol('')}>
              Change
            </button>
          </div>
        ) : (
          <SymbolSearch onPick={setSymbol} placeholder="Pick a stock" />
        )}
      </Field>
      <Field label="Condition">
        <Select value={type} onChange={(e) => setType(e.target.value as AlertType)}>
          {ALERT_TYPES.map((a) => (
            <option key={a.v} value={a.v}>
              {a.l}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {needs !== 'ma' && (
          <Field label={type.startsWith('RSI') ? 'RSI level' : type.startsWith('PCT') ? 'Percent' : 'Price ₹'}>
            <Input type="number" step="any" className="num" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
        )}
        {needs === 'period' && (
          <Field label="RSI period">
            <Input type="number" min={2} max={100} className="num" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
        )}
        {needs === 'ma' && (
          <>
            <Field label="Fast EMA">
              <Input type="number" min={2} className="num" value={fast} onChange={(e) => setFast(e.target.value)} />
            </Field>
            <Field label="Slow EMA">
              <Input type="number" min={3} className="num" value={slow} onChange={(e) => setSlow(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Button type="submit" variant="primary" className="w-full" loading={create.isPending}>
        <BellPlus className="h-3.5 w-3.5" /> Arm alert
      </Button>
      <p className="text-[11px] text-faint">Checked by a local background job against the simulated feed. Fires once, then disarms.</p>
    </form>
  );
}

export default function WatchlistPage() {
  const { data, isLoading } = useWatchlists();
  const m = useWatchlistMutations();
  const alerts = useAlerts();
  const am = useAlertMutations();
  const [activeId, setActiveId] = useState<number | null>(null);
  const wl = data?.find((w) => w.id === activeId) ?? data?.[0];
  const [order, setOrder] = useState<string[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (wl) setOrder([...wl.items].sort((a, b) => a.position - b.position).map((i) => i.symbol));
  }, [wl]);

  const items = order.map((s) => wl?.items.find((i) => i.symbol === s)).filter(Boolean) as WatchlistItem[];
  const commitOrder = () => {
    if (!wl) return;
    const before = [...wl.items].sort((a, b) => a.position - b.position).map((i) => i.symbol).join();
    if (before !== order.join()) m.reorder.mutate({ id: wl.id, symbols: order });
  };

  return (
    <Page>
      <PageHeader
        title="Watchlists"
        sub={
          <>
            <span>Drag rows to reorder. Prices stream from the simulator.</span>
            <SourceBadge source="SIMULATED" />
          </>
        }
        actions={
          <Button size="sm" onClick={() => m.create.mutate(`Watchlist ${(data?.length ?? 0) + 1}`, { onSuccess: (w) => setActiveId(w.id) })} loading={m.create.isPending}>
            <Plus className="h-3.5 w-3.5" /> New list
          </Button>
        }
      />
      <Stagger className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel
          title={
            data && data.length > 0 ? (
              <Tabs ruled={false} size="sm" value={String(wl?.id ?? '')} onChange={(v) => setActiveId(Number(v))} items={data.map((w) => ({ value: String(w.id), label: `${w.name} · ${w.items.length}` }))} />
            ) : (
              'Watchlist'
            )
          }
          action={
            wl && (
              <>
                <button className="rounded p-1.5 text-muted hover:bg-raised hover:text-ink" aria-label="Rename list" onClick={() => { setNewName(wl.name); setRenaming(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded p-1.5 text-muted hover:bg-down/10 hover:text-down"
                  aria-label="Delete list"
                  onClick={() => confirm(`Delete “${wl.name}”?`) && m.remove.mutate(wl.id, { onSuccess: () => setActiveId(null) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )
          }
        >
          <AnimatePresence>
            {renaming && wl && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex gap-2 overflow-hidden border-b border-rule px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.rename.mutate({ id: wl.id, name: newName.trim() || wl.name }, { onSuccess: () => setRenaming(false) });
                }}
              >
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8" autoFocus aria-label="New list name" />
                <Button size="sm" type="submit" variant="primary">
                  Save
                </Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
          {isLoading ? (
            <SkeletonRows rows={6} />
          ) : !wl ? (
            <EmptyState title="No watchlists" action={<Button size="sm" onClick={() => m.create.mutate('My watchlist')}>Create one</Button>} />
          ) : (
            <>
              <div className="border-b border-rule px-4 py-3">
                <div className="max-w-sm">
                  <SymbolSearch
                    placeholder="Add a symbol to this list"
                    onPick={(s) =>
                      m.addItem.mutate({ id: wl.id, symbol: s }, { onSuccess: () => toast.success(`${s} added to ${wl.name}`), onError: (e) => toast.error(e.message) })
                    }
                  />
                </div>
              </div>
              {items.length === 0 ? (
                <EmptyState title="This list is empty" body="Search above to add stocks." />
              ) : (
                <Reorder.Group axis="y" values={order} onReorder={setOrder} onPointerUp={commitOrder} className="relative">
                  {items.map((it) => (
                    <Row key={it.symbol} it={it} onRemove={() => m.removeItem.mutate({ id: wl.id, symbol: it.symbol })} />
                  ))}
                </Reorder.Group>
              )}
            </>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel id="alerts" title="New alert">
            <AlertForm defaultSymbol={items[0]?.symbol} />
          </Panel>
          <Panel title={`Alerts · ${(alerts.data ?? []).filter((a) => a.is_active).length} armed`}>
            {alerts.isLoading ? (
              <SkeletonRows rows={3} />
            ) : (alerts.data ?? []).length === 0 ? (
              <EmptyState title="No alerts" />
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {alerts.data!.map((a) => (
                    <motion.li key={a.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3 border-t border-rule px-4 py-2.5 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px]">{a.description}</div>
                        <div className="mt-0.5 text-[11px] text-faint">{a.triggered_at ? `Triggered ${relative(a.triggered_at)}` : `Created ${relative(a.created_at)}`}</div>
                      </div>
                      <button onClick={() => am.toggle.mutate({ id: a.id, is_active: !a.is_active })} aria-label={a.is_active ? 'Disarm alert' : 'Re-arm alert'}>
                        <Badge tone={a.is_active ? 'up' : 'neutral'}>{a.is_active ? 'armed' : a.triggered_at ? 'fired' : 'off'}</Badge>
                      </button>
                      <button className="rounded p-1 text-faint hover:text-down" onClick={() => am.remove.mutate(a.id)} aria-label="Delete alert">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>
        </div>
      </Stagger>
    </Page>
  );
}
