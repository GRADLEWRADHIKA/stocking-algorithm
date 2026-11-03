'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLive } from '@/stores/live';
import { pct, price, signed, toneClass, dateTime } from '@/lib/format';
import { Sparkline } from '@/components/charts/Sparkline';
import { ActionBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IndexQuote, SectorPerformance, Signal } from '@shared/types/api';

/** Five indices in one ruled strip; values follow the live index stream. */
export function IndexStrip({ indices }: { indices: IndexQuote[] }) {
  const live = useLive((s) => s.indices);
  return (
    <div className="grid grid-cols-2 divide-rule sm:grid-cols-3 xl:grid-cols-5 xl:divide-x">
      {indices.map((q, i) => {
        const l = live[q.symbol];
        const value = l?.value ?? q.value;
        const ch = l?.change ?? q.change;
        const cp = l?.change_pct ?? q.change_pct;
        return (
          <motion.div
            key={q.symbol}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.06, ease: [0.16, 1, 0.3, 1], duration: 0.45 }}
            className="flex items-end justify-between gap-3 border-b border-rule px-4 py-3 xl:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate text-xs text-muted">{q.name}</div>
              <div className="num mt-1 text-[17px] font-medium">{price(value)}</div>
              <div className={cn('num text-xs', toneClass(cp))}>
                {signed(ch)} ({pct(cp)})
              </div>
            </div>
            <Sparkline data={q.sparkline} width={72} height={30} />
          </motion.div>
        );
      })}
    </div>
  );
}

export function BreadthBar({ advancers, decliners, unchanged }: { advancers: number; decliners: number; unchanged: number }) {
  const total = advancers + decliners + unchanged || 1;
  const segs = [
    { n: advancers, c: 'bg-up', label: 'Advancing' },
    { n: unchanged, c: 'bg-faint', label: 'Unchanged' },
    { n: decliners, c: 'bg-down', label: 'Declining' },
  ];
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {segs.map((s, i) =>
          s.n > 0 ? (
            <motion.div
              key={s.label}
              className={s.c}
              initial={{ width: 0 }}
              animate={{ width: `${(s.n / total) * 100}%` }}
              transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        {segs.map((s) => (
          <span key={s.label} className="text-muted">
            {s.label} <span className="num text-ink">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Diverging bars around a zero axis, sorted strongest to weakest. */
export function SectorBars({ sectors }: { sectors: SectorPerformance[] }) {
  const sorted = [...sectors].sort((a, b) => b.change_pct - a.change_pct);
  const max = Math.max(0.5, ...sorted.map((s) => Math.abs(s.change_pct)));
  return (
    <ul className="space-y-1">
      {sorted.map((s, i) => {
        const w = (Math.abs(s.change_pct) / max) * 50;
        const up = s.change_pct >= 0;
        return (
          <li key={s.sector} className="grid grid-cols-[minmax(110px,150px)_1fr_64px] items-center gap-3 py-1 text-xs">
            <Link href={`/explorer?sector=${encodeURIComponent(s.sector)}`} className="truncate text-muted hover:text-ink">
              {s.sector}
            </Link>
            <div className="relative h-3">
              <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
              <motion.div
                className={cn('absolute top-0.5 h-2 rounded-sm', up ? 'bg-up/80' : 'bg-down/80')}
                style={up ? { left: '50%' } : { right: '50%' }}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ duration: 0.8, delay: 0.1 + i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className={cn('num text-right', toneClass(s.change_pct))}>{pct(s.change_pct)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SignalsTable({ signals, compact = false }: { signals: Signal[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Symbol</th>
            <th>Strategy</th>
            {!compact && <th>Bar</th>}
            <th className="r">Price</th>
            <th className="r">Stop / target</th>
            <th className="r">R:R</th>
            <th className="r">Strength</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => (
            <motion.tr key={`${s.id ?? i}-${s.symbol}-${s.strategy_key}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.03 }} className="row-link">
              <td>
                <ActionBadge action={s.action} />
              </td>
              <td>
                <Link href={`/stocks/${s.symbol}?tab=signals`} className="font-medium hover:text-accent">
                  {s.symbol}
                </Link>
              </td>
              <td className="max-w-[180px] truncate text-muted">{s.strategy}</td>
              {!compact && <td className="num text-xs text-muted">{dateTime(s.timestamp, s.timeframe !== '1d')}</td>}
              <td className="r num">{price(s.price)}</td>
              <td className="r num text-xs text-muted">
                {price(s.stop_loss)} / {price(s.take_profit)}
              </td>
              <td className="r num">{s.risk_reward ? s.risk_reward.toFixed(2) : '—'}</td>
              <td className="r">
                <StrengthMeter score={s.strength.score} label={s.strength.label} />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StrengthMeter({ score, label }: { score: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" title={`Strength score ${score.toFixed(0)}/100 — weighted condition margins, not a probability of profit`}>
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-raised">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-ink"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </span>
      <span className="num w-7 text-right text-xs">{score.toFixed(0)}</span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
