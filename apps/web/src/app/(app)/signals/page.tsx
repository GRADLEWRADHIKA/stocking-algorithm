'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Radar } from 'lucide-react';
import { useBuiltinStrategies, useScanSignals, useSignals } from '@/hooks/queries';
import { Page, PageHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { SignalsTable } from '@/components/market/MarketBlocks';
import { SignalCard } from '@/components/analysis/SignalCard';
import type { Signal } from '@shared/types/api';

export default function SignalsPage() {
  const [action, setAction] = useState<'' | 'BUY' | 'SELL'>('');
  const [strategy, setStrategy] = useState('');
  const builtin = useBuiltinStrategies();
  const scan = useScanSignals();
  const q = useSignals({ action: action || undefined, strategy_key: strategy || undefined, limit: 100 });
  const [open, setOpen] = useState<Signal | null>(null);

  return (
    <Page>
      <PageHeader
        title="Trading signals"
        sub="Stored output of the built-in strategies. Each row links to the full reasoning: conditions, levels, sizing and the score method."
        actions={
          <Button size="sm" variant="primary" loading={scan.isPending} onClick={() => scan.mutate({ strategy_key: strategy || undefined })}>
            <Radar className="h-3.5 w-3.5" /> Scan universe now
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Tabs
          ruled={false}
          value={action}
          onChange={setAction}
          items={[
            { value: '', label: 'Buy and sell' },
            { value: 'BUY', label: 'Buy only' },
            { value: 'SELL', label: 'Sell only' },
          ]}
        />
        <Select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="h-8 w-auto text-xs" aria-label="Strategy">
          <option value="">All strategies</option>
          {(builtin.data ?? []).map((b) => (
            <option key={b.key} value={b.key}>
              {b.name}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-muted">Strength is a deterministic score of how clearly conditions are met, not a probability of profit.</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_minmax(0,560px)]">
        <div className="panel min-w-0">
          {q.isLoading ? (
            <SkeletonRows rows={10} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (q.data ?? []).length === 0 ? (
            <EmptyState title="No stored signals match" body="Run a scan to evaluate every strategy on every instrument." />
          ) : (
            <div onClick={(e) => {
              const row = (e.target as HTMLElement).closest('tr');
              if (!row || !row.parentElement || row.parentElement.tagName !== 'TBODY') return;
              const i = Array.from(row.parentElement.children).indexOf(row);
              setOpen(q.data![i] ?? null);
            }}>
              <SignalsTable signals={q.data!} />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {open ? (
              <motion.div key={`${open.id}-${open.symbol}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="xl:sticky xl:top-24">
                <SignalCard s={open} showSymbol />
              </motion.div>
            ) : (
              <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel">
                <EmptyState title="Select a signal" body="Its full reasoning opens here." />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Page>
  );
}
