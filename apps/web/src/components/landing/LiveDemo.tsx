'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ActionBadge, SourceBadge } from '@/components/ui/badge';
import { ConditionList, PriceLadder } from '@/components/analysis/SignalCard';
import { StrengthMeter } from '@/components/market/MarketBlocks';
import { dateTime, pct, price } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEMO_SYMBOLS, useBuiltins, useDemoSignal } from './data';
import type { Timeframe } from '@shared/types/api';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-t border-rule py-1.5 first:border-t-0">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  );
}

/** The live thing: change the stock, the strategy or a parameter and the server re-evaluates the latest bar. */
export function LiveDemo() {
  const builtins = useBuiltins();
  const [symbol, setSymbol] = useState('INFY');
  const [key, setKey] = useState('supertrend');
  const [tf, setTf] = useState<Timeframe>('1d');
  const strat = builtins.data?.find((b) => b.key === key);
  const [params, setParams] = useState<Record<string, number>>({});
  const [debounced, setDebounced] = useState(params);

  useEffect(() => {
    if (strat) setParams(Object.fromEntries(strat.params.map((p) => [p.name, p.default])));
  }, [strat]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(params), 220);
    return () => clearTimeout(t);
  }, [params]);

  const valid = useMemo(() => strat && strat.params.every((p) => debounced[p.name] !== undefined), [strat, debounced]);
  const q = useDemoSignal({ symbol, strategy_key: key, timeframe: tf, params: valid ? debounced : {} });
  const s = q.data;
  const sliders = (strat?.params ?? []).filter((p) => !(p.type === 'int' && p.max === 1)).slice(0, 4);

  return (
    <section id="demo" className="mx-auto max-w-[1180px] px-4 py-[120px] md:px-8 md:py-[200px]" aria-labelledby="demo-title">
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }}>
        <h2 id="demo-title" className="text-[32px] font-medium tracking-[-0.025em]">
          Try the engine
        </h2>
        <p className="mt-2 max-w-xl text-base text-muted">This panel is the real quant engine running on the local server. Pick a stock and a strategy, move a parameter, and the latest bar is evaluated again.</p>
      </motion.div>

      <motion.div
        data-ui
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="mt-8 grid overflow-hidden rounded-card border border-line bg-surface md:min-h-[600px] md:grid-cols-[62fr_38fr]"
      >
        <div className="relative flex min-w-0 flex-col p-5 md:p-6">
          <AnimatePresence mode="wait">
            {s ? (
              <motion.div key={`${s.symbol}-${s.strategy_key}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="flex flex-1 flex-col gap-5">
                <div className="flex flex-wrap items-center gap-3">
                  <ActionBadge action={s.action} />
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">
                      {s.symbol} · {s.strategy}
                    </div>
                    <div className="num text-xs text-muted">
                      {s.timeframe} bar of {dateTime(s.timestamp, s.timeframe !== '1d')} · close {price(s.price)}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <SourceBadge source={s.data_source} />
                    <StrengthMeter score={s.strength.score} />
                  </div>
                </div>
                <ConditionList conditions={s.conditions} />
                <p className="text-sm leading-relaxed text-ink/90">{s.explanation}</p>
                {s.stop_loss && s.take_profit && (
                  <div className="rounded-ctl bg-raised/50 p-4">
                    <PriceLadder entry={s.price} stop={s.stop_loss} target={s.take_profit} />
                  </div>
                )}
                {s.historical_performance && (
                  <p className="text-xs text-muted">
                    Same rules on this stock’s stored history: <span className="num text-ink">{s.historical_performance.trades}</span> trades, win rate{' '}
                    <span className="num text-ink">{s.historical_performance.win_rate === null ? '—' : pct(s.historical_performance.win_rate, 0, false)}</span>, average{' '}
                    <span className="num text-ink">{pct(s.historical_performance.avg_return_pct)}</span> per trade. Descriptive, not a probability.
                  </p>
                )}
              </motion.div>
            ) : q.isError ? (
              <p className="m-auto max-w-sm text-center text-sm text-muted">The demo needs the local QuantDesk server. Start the backend and this panel comes alive.</p>
            ) : (
              <div className="skeleton h-full min-h-[300px]" />
            )}
          </AnimatePresence>
          {q.isFetching && s && <Loader2 className="absolute right-4 top-4 h-4 w-4 animate-spin text-faint" aria-label="Evaluating" />}
          <Link href="/login?next=/strategies" className="group mt-6 inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-ink">
            Build your own rules in the strategy builder <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="border-t border-line bg-raised/40 p-5 md:border-l md:border-t-0 md:p-6">
          <Row label="Stock">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="field h-8 w-36 text-sm" aria-label="Stock">
              {DEMO_SYMBOLS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Row>
          <Row label="Strategy">
            <select value={key} onChange={(e) => setKey(e.target.value)} className="field h-8 w-44 text-sm" aria-label="Strategy">
              {(builtins.data ?? []).map((b) => (
                <option key={b.key} value={b.key}>
                  {b.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Timeframe">
            <div className="flex rounded-ctl bg-ground p-0.5">
              {(['1d', '1w'] as Timeframe[]).map((t) => (
                <button key={t} onClick={() => setTf(t)} className={cn('h-7 rounded-[5px] px-3 text-sm transition-colors', tf === t ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}>
                  {t === '1d' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>
          </Row>
          {sliders.map((p) => (
            <Row key={`${key}-${p.name}`} label={p.label}>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.type === 'int' ? 1 : (p.max - p.min) / 50}
                  value={params[p.name] ?? p.default}
                  onChange={(e) => setParams((o) => ({ ...o, [p.name]: Number(e.target.value) }))}
                  className="w-28 accent-[rgb(var(--accent))]"
                  aria-label={p.label}
                />
                <span className="num w-12 text-right text-sm">{p.type === 'int' ? params[p.name] : Number(params[p.name] ?? p.default).toFixed(1)}</span>
              </div>
            </Row>
          ))}
          <p className="mt-5 text-sm leading-relaxed text-muted">{strat?.description}</p>
        </div>
      </motion.div>
      <p className="mt-4 text-sm text-muted">Move any slider. Every figure on the left is computed by the engine; nothing is pre-written.</p>
    </section>
  );
}
