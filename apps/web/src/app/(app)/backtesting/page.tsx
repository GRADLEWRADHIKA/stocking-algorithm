'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { GitCompareArrows, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useBacktest, useBacktests, useBuiltinStrategies, useCompareBacktests, useRunBacktest, useSavedStrategies, useStock } from '@/hooks/queries';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { SourceBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { AnimatedNumber } from '@/components/ui/numbers';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { SymbolSearch } from '@/components/layout/SymbolSearch';
import { LineChart, Legend } from '@/components/charts/LineChart';
import { backtestSchema } from '@/lib/schemas';
import { dateTime, inr, pct, price, relative, signedInr, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BacktestMetrics, BacktestRequest, BacktestResult, StrategyRef, Timeframe } from '@shared/types/api';

type F = z.input<typeof backtestSchema>;

function MetricStrip({ m }: { m: BacktestMetrics }) {
  const cells: [string, React.ReactNode, string?][] = [
    ['Net profit', <AnimatedNumber key="np" value={m.net_profit} format={(v) => signedInr(v, 0)} />, toneClass(m.net_profit)],
    ['Total return', <AnimatedNumber key="tr" value={m.total_return_pct} format={(v) => pct(v)} />, toneClass(m.total_return_pct)],
    ['Annualised', pct(m.annualized_return_pct), toneClass(m.annualized_return_pct)],
    ['Buy and hold', pct(m.buy_and_hold_return_pct), 'text-muted'],
    ['Max drawdown', pct(-Math.abs(m.max_drawdown_pct)), 'text-down'],
    ['Sharpe', m.sharpe_ratio?.toFixed(2) ?? '—'],
    ['Profit factor', m.profit_factor?.toFixed(2) ?? '—'],
    ['Win rate', m.win_rate === null ? '—' : pct(m.win_rate, 1, false)],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
      {cells.map(([k, v, c], i) => (
        <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="border-b border-r border-rule px-4 py-3">
          <div className="label">{k}</div>
          <div className={cn('num mt-1 whitespace-nowrap text-[17px]', c)}>{v}</div>
        </motion.div>
      ))}
    </div>
  );
}

function MetricsTable({ rows }: { rows: { label: string; m: BacktestMetrics | null }[] }) {
  const fields: [string, (m: BacktestMetrics) => string][] = [
    ['Final capital', (m) => inr(m.final_capital, 0)],
    ['Net profit', (m) => signedInr(m.net_profit, 0)],
    ['Total return', (m) => pct(m.total_return_pct)],
    ['Annualised return', (m) => pct(m.annualized_return_pct)],
    ['Trades', (m) => String(m.num_trades)],
    ['Winning / losing', (m) => `${m.winning_trades} / ${m.losing_trades}`],
    ['Win rate', (m) => (m.win_rate === null ? '—' : pct(m.win_rate, 1, false))],
    ['Average win', (m) => signedInr(m.avg_win, 0)],
    ['Average loss', (m) => signedInr(m.avg_loss, 0)],
    ['Average trade', (m) => pct(m.avg_trade_return_pct)],
    ['Max drawdown', (m) => pct(-Math.abs(m.max_drawdown_pct))],
    ['Sharpe ratio', (m) => m.sharpe_ratio?.toFixed(2) ?? '—'],
    ['Sortino ratio', (m) => m.sortino_ratio?.toFixed(2) ?? '—'],
    ['Profit factor', (m) => m.profit_factor?.toFixed(2) ?? '—'],
    ['Time in market', (m) => pct(m.exposure_pct, 1, false)],
    ['Costs paid', (m) => inr(m.total_costs, 0)],
  ];
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Metric</th>
          {rows.map((r) => (
            <th key={r.label} className="r">
              {r.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fields.map(([k, f]) => (
          <tr key={k}>
            <td className="text-muted">{k}</td>
            {rows.map((r) => (
              <td key={r.label} className="r num">
                {r.m ? f(r.m) : '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Results({ r }: { r: BacktestResult }) {
  const [tab, setTab] = useState<'equity' | 'drawdown' | 'trades' | 'split' | 'assumptions'>('equity');
  const intraday = !['1d', '1w', '1M'].includes(r.config.timeframe);
  const eq = useMemo(
    () => [
      { name: 'Strategy equity', color: 'rgb(var(--accent))', points: r.equity_curve.map((p) => ({ time: p.time, value: p.equity })) },
      { name: 'Buy and hold', color: 'rgb(var(--muted))', dashed: true, points: r.equity_curve.map((p) => ({ time: p.time, value: p.benchmark })) },
    ],
    [r],
  );
  const dd = useMemo(() => [{ name: 'Drawdown', color: 'rgb(var(--down))', fill: true, points: r.drawdown_curve.map((p) => ({ time: p.time, value: -Math.abs(p.drawdown_pct) })) }], [r]);

  return (
    <Stagger className="space-y-4">
      <Panel
        title={
          <div className="min-w-0">
            <h2 className="panel-title truncate">
              {r.strategy_name} on {r.symbol} · {r.config.timeframe}
            </h2>
          </div>
        }
        action={
          <>
            <span className="num hidden text-xs text-muted sm:inline">
              {dateTime(r.period.start, false)} → {dateTime(r.period.end, false)} · {r.bars} bars
            </span>
            <SourceBadge source={r.data_source} />
          </>
        }
      >
        <MetricStrip m={r.metrics} />
        <div className="px-4 pt-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'equity', label: 'Equity curve' },
              { value: 'drawdown', label: 'Drawdown' },
              { value: 'trades', label: `Trades · ${r.trades.length}` },
              { value: 'split', label: 'In / out of sample', disabled: !r.out_of_sample },
              { value: 'assumptions', label: 'Assumptions' },
            ]}
          />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-4">
            {tab === 'equity' && (
              <>
                <div className="mb-2 flex justify-end">
                  <Legend items={eq} />
                </div>
                <LineChart series={eq} height={300} format={(v) => `₹${(v / 1000).toFixed(0)}K`} dateOnly={!intraday} />
              </>
            )}
            {tab === 'drawdown' && <LineChart series={dd} height={240} format={(v) => `${v.toFixed(1)}%`} zeroLine dateOnly={!intraday} />}
            {tab === 'trades' &&
              (r.trades.length === 0 ? (
                <EmptyState title="The strategy never entered a trade in this period" body="Entry conditions were not met on any bar. Try a longer period or looser rules." />
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="tbl">
                    <thead className="sticky top-0 bg-surface">
                      <tr>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th className="r">Qty</th>
                        <th className="r">Entry ₹</th>
                        <th className="r">Exit ₹</th>
                        <th className="r">P&L</th>
                        <th className="r">Return</th>
                        <th className="r">Costs</th>
                        <th className="r">Bars</th>
                        <th>Exit reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.trades.map((t, i) => (
                        <tr key={i}>
                          <td className="num text-xs text-muted">{dateTime(t.entry_time, intraday)}</td>
                          <td className="num text-xs text-muted">{dateTime(t.exit_time, intraday)}</td>
                          <td className="r num">{t.quantity}</td>
                          <td className="r num">{price(t.entry_price)}</td>
                          <td className="r num">{price(t.exit_price)}</td>
                          <td className={cn('r num', toneClass(t.pnl))}>{signedInr(t.pnl, 0)}</td>
                          <td className={cn('r num', toneClass(t.pnl_pct))}>{pct(t.pnl_pct)}</td>
                          <td className="r num text-muted">{price(t.costs)}</td>
                          <td className="r num">{t.bars_held}</td>
                          <td className="text-xs text-muted">{t.exit_reason.replace(/_/g, ' ').toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {tab === 'split' && (
              <>
                <p className="mb-3 text-xs text-muted">
                  The last {r.config.out_of_sample_pct}% of bars were held out. Indicators warmed up on earlier data only. A large gap between the columns suggests the rules fit
                  the past more than they generalise.
                </p>
                <MetricsTable
                  rows={[
                    { label: 'Whole period', m: r.metrics },
                    { label: 'In sample', m: r.in_sample },
                    { label: 'Out of sample', m: r.out_of_sample },
                  ]}
                />
              </>
            )}
            {tab === 'assumptions' && (
              <ul className="space-y-2 text-[13px]">
                {r.assumptions.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 flex-none rounded-full bg-faint" />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
        <p className="border-t border-rule px-4 py-2 text-[11px] text-faint">
          Simulated results on {r.data_source === 'SIMULATED' ? 'generated' : 'historical'} data after modelled costs and slippage. Past performance does not indicate future results.
        </p>
      </Panel>
    </Stagger>
  );
}

function Backtester() {
  const params = useSearchParams();
  const builtin = useBuiltinStrategies();
  const saved = useSavedStrategies();
  const history = useBacktests();
  const run = useRunBacktest();
  const compare = useCompareBacktests();
  const [selected, setSelected] = useState<number | null>(null);
  const shown = useBacktest(selected);
  const [strategy, setStrategy] = useState<string>(
    params.get('strategy_id') ? `saved:${params.get('strategy_id')}` : `builtin:${params.get('builtin') ?? 'ma_crossover'}`,
  );
  const [symbol, setSymbol] = useState(params.get('symbol') ?? 'RELIANCE');
  const stock = useStock(symbol);

  const today = new Date();
  const threeYears = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
  const form = useForm<F, unknown, z.output<typeof backtestSchema>>({
    resolver: zodResolver(backtestSchema),
    defaultValues: {
      symbol,
      timeframe: '1d',
      start: threeYears,
      end: today.toISOString().slice(0, 10),
      initial_capital: 1000000,
      position_size_pct: 100,
      brokerage_pct: 0.03,
      brokerage_flat: 20,
      transaction_cost_pct: 0.1,
      slippage_bps: 5,
      stop_loss_pct: '',
      take_profit_pct: '',
      out_of_sample_pct: 30,
    },
  });
  useEffect(() => form.setValue('symbol', symbol), [symbol, form]);

  const ref = (s: string): StrategyRef => (s.startsWith('saved:') ? { type: 'saved', strategy_id: Number(s.slice(6)) } : { type: 'builtin', key: s.slice(8) });
  const toReq = (v: z.output<typeof backtestSchema>): BacktestRequest => ({
    symbol: v.symbol,
    strategy: ref(strategy),
    timeframe: v.timeframe as Timeframe,
    start: v.start || null,
    end: v.end || null,
    initial_capital: v.initial_capital,
    position_size_pct: v.position_size_pct,
    brokerage_pct: v.brokerage_pct,
    brokerage_flat: v.brokerage_flat,
    transaction_cost_pct: v.transaction_cost_pct,
    slippage_bps: v.slippage_bps,
    stop_loss_pct: v.stop_loss_pct ?? null,
    take_profit_pct: v.take_profit_pct ?? null,
    out_of_sample_pct: v.out_of_sample_pct,
  });

  const onRun = form.handleSubmit((v) =>
    run.mutate(toReq(v), {
      onSuccess: (r) => {
        setSelected(r.id);
        compare.reset();
      },
      onError: (e) => toast.error('Backtest failed', { description: e.message }),
    }),
  );
  const onCompare = form.handleSubmit((v) => {
    const base = toReq(v);
    compare.mutate(
      { base, strategies: (builtin.data ?? []).map((b) => ({ type: 'builtin', key: b.key }) as StrategyRef) },
      { onError: (e) => toast.error('Comparison failed', { description: e.message }) },
    );
  });

  const result = run.data && run.data.id === selected ? run.data : shown.data;
  const e = form.formState.errors;
  const tfs = stock.data?.available_timeframes ?? ['1d'];

  return (
    <Page>
      <PageHeader title="Backtesting" sub="Event-driven simulation: signals on bar close fill at the next bar’s open, with brokerage, charges and slippage." />
      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Stagger className="space-y-4">
          <Panel title="Configuration" bodyClassName="p-4">
            <form onSubmit={onRun} className="space-y-3" noValidate>
              <Field label="Stock">
                <SymbolSearch onPick={setSymbol} placeholder={symbol} />
              </Field>
              <Field label="Strategy">
                <Select value={strategy} onChange={(ev) => setStrategy(ev.target.value)}>
                  <optgroup label="Built-in">
                    {(builtin.data ?? []).map((b) => (
                      <option key={b.key} value={`builtin:${b.key}`}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                  {(saved.data ?? []).length > 0 && (
                    <optgroup label="My strategies">
                      {saved.data!.map((s) => (
                        <option key={s.id} value={`saved:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Timeframe">
                  <Select {...form.register('timeframe')}>
                    {tfs.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="From" className="col-span-1" error={e.start?.message}>
                  <Input type="date" className="px-2 text-xs" {...form.register('start')} />
                </Field>
                <Field label="To" error={e.end?.message}>
                  <Input type="date" className="px-2 text-xs" {...form.register('end')} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Initial capital ₹" error={e.initial_capital?.message}>
                  <Input type="number" className="num" {...form.register('initial_capital')} />
                </Field>
                <Field label="Position size %" error={e.position_size_pct?.message}>
                  <Input type="number" step="1" className="num" {...form.register('position_size_pct')} />
                </Field>
                <Field label="Brokerage %" error={e.brokerage_pct?.message}>
                  <Input type="number" step="0.01" className="num" {...form.register('brokerage_pct')} />
                </Field>
                <Field label="Brokerage cap ₹" error={e.brokerage_flat?.message}>
                  <Input type="number" step="1" className="num" {...form.register('brokerage_flat')} />
                </Field>
                <Field label="Charges % (STT etc.)" error={e.transaction_cost_pct?.message}>
                  <Input type="number" step="0.01" className="num" {...form.register('transaction_cost_pct')} />
                </Field>
                <Field label="Slippage bps" error={e.slippage_bps?.message}>
                  <Input type="number" step="1" className="num" {...form.register('slippage_bps')} />
                </Field>
                <Field label="Stop-loss %" hint="Optional" error={e.stop_loss_pct?.message}>
                  <Input type="number" step="0.5" className="num" {...form.register('stop_loss_pct')} />
                </Field>
                <Field label="Take-profit %" hint="Optional" error={e.take_profit_pct?.message}>
                  <Input type="number" step="0.5" className="num" {...form.register('take_profit_pct')} />
                </Field>
              </div>
              <Field label="Out-of-sample hold-out %" hint="Last part of the period reported separately" error={e.out_of_sample_pct?.message}>
                <Input type="number" step="5" className="num" {...form.register('out_of_sample_pct')} />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="submit" variant="primary" className="flex-1" loading={run.isPending}>
                  <Play className="h-3.5 w-3.5" /> Run backtest
                </Button>
                <Button type="button" onClick={onCompare} loading={compare.isPending} title="Run every built-in strategy with these settings">
                  <GitCompareArrows className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          </Panel>
          <Panel title="Recent runs">
            {history.isLoading ? (
              <SkeletonRows rows={4} />
            ) : (history.data ?? []).length === 0 ? (
              <EmptyState title="No runs yet" />
            ) : (
              <ul className="max-h-[320px] overflow-y-auto">
                {history.data!.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => setSelected(h.id)}
                      className={cn('flex w-full items-center gap-3 border-t border-rule px-4 py-2.5 text-left first:border-t-0 hover:bg-raised/60', selected === h.id && 'bg-raised')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">
                          {h.symbol} · {h.strategy_name}
                        </span>
                        <span className="block text-[11px] text-faint">
                          {h.timeframe} · {h.num_trades} trades · {relative(h.created_at)}
                        </span>
                      </span>
                      <span className={cn('num text-xs', toneClass(h.total_return_pct))}>{pct(h.total_return_pct)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Stagger>

        <div className="min-w-0 space-y-4">
          {compare.data && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Strategy comparison on {symbol}</h2>
                <button className="text-xs text-muted hover:text-ink" onClick={() => compare.reset()}>
                  Close
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th className="r">Return</th>
                      <th className="r">Max DD</th>
                      <th className="r">Sharpe</th>
                      <th className="r">Profit factor</th>
                      <th className="r">Trades</th>
                      <th className="r">Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...compare.data]
                      .sort((a, b) => b.metrics.total_return_pct - a.metrics.total_return_pct)
                      .map((c, i) => (
                        <motion.tr key={c.strategy_name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                          <td>{c.strategy_name}</td>
                          <td className={cn('r num', toneClass(c.metrics.total_return_pct))}>{pct(c.metrics.total_return_pct)}</td>
                          <td className="r num text-down">{pct(-Math.abs(c.metrics.max_drawdown_pct))}</td>
                          <td className="r num">{c.metrics.sharpe_ratio?.toFixed(2) ?? '—'}</td>
                          <td className="r num">{c.metrics.profit_factor?.toFixed(2) ?? '—'}</td>
                          <td className="r num">{c.metrics.num_trades}</td>
                          <td className="r num">{c.metrics.win_rate === null ? '—' : pct(c.metrics.win_rate, 1, false)}</td>
                        </motion.tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
          {run.isPending || (selected && shown.isLoading) ? (
            <div className="panel">
              <SkeletonRows rows={10} />
            </div>
          ) : shown.isError && !run.data ? (
            <div className="panel">
              <ErrorState error={shown.error} />
            </div>
          ) : result ? (
            <Results key={result.id} r={result} />
          ) : (
            <div className="panel">
              <EmptyState
                icon={Play}
                title="Configure a backtest and run it"
                body="Results show net of costs, with an equity curve against buy-and-hold, drawdowns, every trade and an out-of-sample split."
              />
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

export default function BacktestingPage() {
  return (
    <Suspense>
      <Backtester />
    </Suspense>
  );
}
