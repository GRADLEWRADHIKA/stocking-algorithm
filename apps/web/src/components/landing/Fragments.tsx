'use client';
import { motion } from 'framer-motion';
import { ActionBadge, SourceBadge } from '@/components/ui/badge';
import { ConditionList, PriceLadder } from '@/components/analysis/SignalCard';
import { StrengthMeter } from '@/components/market/MarketBlocks';
import { Sparkline } from '@/components/charts/Sparkline';
import { pct, price, signed, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MiniChart } from './MiniChart';
import { useChartData, useIndices, useLandingAnalysis } from './data';
import type { Signal } from '@shared/types/api';

/* Cropped, working pieces of the product. Each root carries data-ui: inside, the product's own conventions apply. */

export function SignalFragment({ s, className }: { s: Signal | undefined; className?: string }) {
  if (!s) return <div data-ui className={cn('skeleton h-full w-full', className)} />;
  // an actionable signal is judged on its own side's rules; HOLD shows the entry rules it is waiting on
  const side = s.action === 'SELL' ? '[SELL]' : '[BUY]';
  const own = s.conditions.filter((c) => c.description.startsWith(side));
  const conds = own.length ? own : s.conditions;
  const met = conds.filter((c) => c.satisfied).length;
  return (
    <div data-ui className={cn('h-full overflow-hidden rounded-card border border-line bg-surface', className)}>
      <div className="flex items-center gap-2.5 border-b border-rule px-4 py-2.5">
        <ActionBadge action={s.action} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">
            {s.symbol} · {s.strategy}
          </div>
          <div className="text-[11px] text-muted">
            {met} of {conds.length} {s.action === "SELL" ? "exit" : "entry"} conditions met
          </div>
        </div>
        <StrengthMeter score={s.strength.score} />
      </div>
      <div className="px-4 py-3">
        <ConditionList conditions={conds.slice(0, 4)} />
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted">{s.explanation}</p>
      </div>
    </div>
  );
}

export function ChartFragment({ symbol }: { symbol: string }) {
  const { data } = useChartData(symbol);
  return (
    <div data-ui className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2 text-xs">
        <span className="font-semibold text-ink">{symbol} · 1d</span>
        <span className="flex items-center gap-3 text-muted">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-2 bg-up" />
            <span className="h-0.5 w-2 bg-down" /> Supertrend(10, 3)
          </span>
          {data && <SourceBadge source={data.source} />}
        </span>
      </div>
      <div className="min-h-0 flex-1 px-2 py-1">{data ? <MiniChart candles={data.candles} st={data.st} /> : <div className="skeleton h-full" />}</div>
    </div>
  );
}

export function IndicesFragment({ limit = 3 }: { limit?: number }) {
  const { data } = useIndices();
  return (
    <div data-ui className="h-full overflow-hidden rounded-card border border-line bg-surface">
      {(data ?? []).slice(0, limit).map((q, i) => (
        <motion.div
          key={q.symbol}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="flex items-center gap-3 border-t border-rule px-4 py-2.5 first:border-t-0"
        >
          <span className="w-24 truncate text-[13px] font-medium">{q.name.replace(/\s*\(.*\)$/, '')}</span>
          <Sparkline data={q.sparkline} width={90} height={26} />
          <span className="num ml-auto text-[13px]">{price(q.value)}</span>
          <span className={cn('num w-16 text-right text-xs', toneClass(q.change_pct))}>{pct(q.change_pct)}</span>
        </motion.div>
      ))}
      {!data && <div className="skeleton m-4 h-24" />}
    </div>
  );
}

export function LadderFragment({ s }: { s: Signal | undefined }) {
  if (!s) return <div data-ui className="skeleton h-full w-full" />;
  return (
    <div data-ui className="flex h-full flex-col justify-center gap-3 rounded-card border border-line bg-surface px-5 py-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">
          {s.symbol} · levels from ATR
        </span>
        <span className="text-muted">
          Risk : reward <span className="num text-ink">{s.risk_reward ? `1 : ${s.risk_reward.toFixed(2)}` : '—'}</span>
        </span>
      </div>
      {s.stop_loss && s.take_profit ? (
        <PriceLadder entry={s.price} stop={s.stop_loss} target={s.take_profit} />
      ) : (
        <p className="text-xs text-muted">No levels set: this strategy is holding at {price(s.price)}.</p>
      )}
      {s.position_size && (
        <p className="text-xs text-muted">
          Suggested size <span className="num text-ink">{s.position_size.quantity} shares</span>, risking{' '}
          <span className="num text-ink">{pct(s.position_size.risk_per_trade_pct, 1, false)}</span> of capital.
        </p>
      )}
    </div>
  );
}

export function QuoteLine({ label, value, change }: { label: string; value: number; change: number }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-muted">{label}</span>
      <span className="num text-ink">{price(value)}</span>
      <span className={cn('num', toneClass(change))}>{signed(change)}</span>
    </span>
  );
}

export function ReadoutFragment({ symbol }: { symbol: string }) {
  const { data } = useLandingAnalysis(symbol);
  return (
    <div data-ui className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2 text-xs">
        <span className="font-semibold text-ink">{symbol} · strategy read-out</span>
        {data && <SourceBadge source={data.data_source} />}
      </div>
      <div className="grid flex-1 grid-cols-1 content-start">
        {(data?.signals ?? []).slice(0, 9).map((x, i) => (
          <motion.div
            key={x.strategy_key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 border-t border-rule px-4 py-[5px] text-xs first:border-t-0"
          >
            <span className={cn('w-9 font-semibold', x.action === 'BUY' ? 'text-up' : x.action === 'SELL' ? 'text-down' : 'text-muted')}>{x.action}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{x.strategy}</span>
            <StrengthMeter score={x.strength.score} />
          </motion.div>
        ))}
        {!data && <div className="skeleton m-4 h-40" />}
      </div>
    </div>
  );
}
