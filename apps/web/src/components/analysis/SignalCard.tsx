'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Minus, X } from 'lucide-react';
import { ActionBadge, SourceBadge } from '@/components/ui/badge';
import { StrengthMeter } from '@/components/market/MarketBlocks';
import { dateTime, inr, pct, price } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Signal } from '@shared/types/api';

/** Stop · entry · target drawn to scale so the risk/reward is seen, not only read. */
export function PriceLadder({ entry, stop, target }: { entry: number; stop: number | null; target: number | null }) {
  if (!stop || !target) return null;
  const lo = Math.min(stop, target, entry);
  const hi = Math.max(stop, target, entry);
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const riskLeft = Math.min(pos(stop), pos(entry));
  const riskW = Math.abs(pos(entry) - pos(stop));
  const rewLeft = Math.min(pos(entry), pos(target));
  const rewW = Math.abs(pos(target) - pos(entry));
  return (
    <div className="pt-1">
      <div className="relative h-2 rounded-full bg-raised">
        <motion.div className="absolute inset-y-0 rounded-l-full bg-down/70" style={{ left: `${riskLeft}%` }} initial={{ width: 0 }} animate={{ width: `${riskW}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
        <motion.div className="absolute inset-y-0 rounded-r-full bg-up/70" style={{ left: `${rewLeft}%` }} initial={{ width: 0 }} animate={{ width: `${rewW}%` }} transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `calc(${pos(entry)}% - 1px)` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-xs">
        <div>
          <div className="text-muted">Stop-loss</div>
          <div className="num text-down">{price(stop)}</div>
        </div>
        <div className="text-center">
          <div className="text-muted">Analysed price</div>
          <div className="num">{price(entry)}</div>
        </div>
        <div className="text-right">
          <div className="text-muted">Take-profit</div>
          <div className="num text-up">{price(target)}</div>
        </div>
      </div>
    </div>
  );
}

export function ConditionList({ conditions }: { conditions: Signal['conditions'] }) {
  return (
    <ul className="space-y-1.5">
      {conditions.map((c, i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 + i * 0.05 }}
          className="flex items-start gap-2 text-[13px]"
        >
          <span className={cn('mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full', c.satisfied ? 'bg-up/15 text-up' : 'bg-raised text-faint')}>
            {c.satisfied ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className={cn('min-w-0 flex-1', !c.satisfied && 'text-muted')}>{c.description}</span>
          {c.value && <span className="num flex-none text-xs text-muted">{c.value}</span>}
        </motion.li>
      ))}
    </ul>
  );
}

export function SignalCard({ s, showSymbol = false }: { s: Signal; showSymbol?: boolean }) {
  const met = s.conditions.filter((c) => c.satisfied).length;
  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
        <ActionBadge action={s.action} />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">
            {showSymbol && (
              <Link href={`/stocks/${s.symbol}`} className="mr-2 hover:text-accent">
                {s.symbol}
              </Link>
            )}
            {s.strategy}
          </h3>
          <p className="num text-[11px] text-muted">
            {s.exchange} · {s.timeframe} bar of {dateTime(s.timestamp, s.timeframe !== '1d')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <SourceBadge source={s.data_source} />
          <StrengthMeter score={s.strength.score} label={s.strength.label} />
        </div>
      </header>

      <div className="grid gap-5 p-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Conditions checked</span>
              <span className="num">
                {met} of {s.conditions.length} met
              </span>
            </div>
            <ConditionList conditions={s.conditions} />
          </div>
          <p className="text-[13px] leading-relaxed text-ink/90">{s.explanation}</p>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <div className="mb-1 text-muted">Entry rules</div>
              <ul className="space-y-1">
                {s.entry_conditions.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <Minus className="mt-0.5 h-3 w-3 flex-none text-faint" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-muted">Exit rules</div>
              <ul className="space-y-1">
                {s.exit_conditions.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <Minus className="mt-0.5 h-3 w-3 flex-none text-faint" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <PriceLadder entry={s.price} stop={s.stop_loss} target={s.take_profit} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-3 text-xs">
            <dt className="text-muted">Risk : reward</dt>
            <dd className="num text-right">{s.risk_reward ? `1 : ${s.risk_reward.toFixed(2)}` : '—'}</dd>
            {s.position_size && (
              <>
                <dt className="text-muted">Suggested size</dt>
                <dd className="num text-right">{s.position_size.quantity} shares</dd>
                <dt className="text-muted">Capital required</dt>
                <dd className="num text-right">{inr(s.position_size.capital_required, 0)}</dd>
                <dt className="text-muted">Capital at risk</dt>
                <dd className="num text-right">
                  {inr(s.position_size.capital_at_risk, 0)} ({pct(s.position_size.risk_per_trade_pct, 1, false)} of {inr(s.position_size.assumed_capital, 0)})
                </dd>
              </>
            )}
            {s.historical_performance && (
              <>
                <dt className="text-muted">Past trades, same rules</dt>
                <dd className="num text-right">
                  {s.historical_performance.trades} · win {s.historical_performance.win_rate === null ? '—' : pct(s.historical_performance.win_rate, 0, false)}
                </dd>
              </>
            )}
          </dl>
          <div className="border-t border-rule pt-3">
            <div className="mb-2 text-xs text-muted">Strength score {s.strength.score.toFixed(0)}/100 · {s.strength.label.toLowerCase()}</div>
            <ul className="space-y-1.5">
              {s.strength.components.map((c) => (
                <li key={c.name} className="grid grid-cols-[1fr_80px_36px] items-center gap-2 text-xs">
                  <span className="truncate text-muted">{c.name}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-raised">
                    <motion.span className="block h-full bg-faint" initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, c.value)) * 100}%` }} transition={{ duration: 0.7 }} />
                  </span>
                  <span className="num text-right text-faint">×{c.weight.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-faint">{s.strength.method}</p>
          </div>
        </div>
      </div>
      <footer className="border-t border-rule px-4 py-2 text-[11px] leading-snug text-faint">
        {s.historical_performance?.note ? `${s.historical_performance.note} ` : ''}
        {s.disclaimer}
      </footer>
    </motion.article>
  );
}
