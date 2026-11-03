'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Copy, FlaskConical, Pencil, Play, Plus, Save, ScanSearch, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useBuiltinStrategies,
  useDeleteStrategy,
  useDuplicateStrategy,
  useEvaluateStrategy,
  useIndicatorCatalog,
  useSavedStrategies,
  useSaveStrategy,
  useScreen,
  useValidateStrategy,
} from '@/hooks/queries';
import { Page, PageHeader, Panel, Stagger } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/states';
import { SymbolSearch } from '@/components/layout/SymbolSearch';
import { SignalCard } from '@/components/analysis/SignalCard';
import { RuleGroupEditor } from '@/components/strategy/RuleEditor';
import { DEFAULT_DEFINITION, conditionText, localErrors } from '@/components/strategy/rules';
import { pct, price, relative, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { StrategyDefinition, Timeframe } from '@shared/types/api';

function Builder() {
  const params = useSearchParams();
  const router = useRouter();
  const catalog = useIndicatorCatalog();
  const builtin = useBuiltinStrategies();
  const saved = useSavedStrategies();
  const save = useSaveStrategy();
  const del = useDeleteStrategy();
  const dup = useDuplicateStrategy();
  const validate = useValidateStrategy();
  const evaluate = useEvaluateStrategy();
  const screen = useScreen();

  const [list, setList] = useState<'mine' | 'builtin'>(params.get('mode') === 'screen' ? 'mine' : 'mine');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('EMA trend with RSI and volume');
  const [description, setDescription] = useState('Long when the short EMA leads, momentum is positive and volume confirms.');
  const [def, setDef] = useState<StrategyDefinition>(DEFAULT_DEFINITION);
  const [testSymbol, setTestSymbol] = useState('RELIANCE');
  const [serverCheck, setServerCheck] = useState<{ valid: boolean; errors: string[] } | null>(null);

  const local = useMemo(() => (catalog.data ? localErrors(def, catalog.data) : []), [def, catalog.data]);
  useEffect(() => setServerCheck(null), [def]);

  const load = (id: number) => {
    const s = saved.data?.find((x) => x.id === id);
    if (!s) return;
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    setDef(s.definition);
    evaluate.reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const reset = () => {
    setEditingId(null);
    setName('Untitled strategy');
    setDescription('');
    setDef(DEFAULT_DEFINITION);
    evaluate.reset();
  };
  const onSave = () => {
    if (local.length) return toast.error('Fix the highlighted problems first');
    save.mutate(
      { id: editingId ?? undefined, name: name.trim() || 'Untitled strategy', description, definition: def },
      {
        onSuccess: (s) => {
          setEditingId(s.id);
          toast.success(editingId ? 'Strategy updated' : 'Strategy saved');
        },
        onError: (e) => toast.error('Not saved', { description: e.message }),
      },
    );
  };

  const cat = catalog.data ?? [];
  const ready = catalog.data && !local.length;

  return (
    <Page>
      <PageHeader
        title="Strategy builder"
        sub="Compose entry and exit rules from indicators. Rules are validated and evaluated by a safe rule engine on the server, never as code."
        actions={
          <Button size="sm" onClick={reset}>
            <Plus className="h-3.5 w-3.5" /> New strategy
          </Button>
        }
      />
      <Stagger className="grid gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title={editingId ? `Editing · ${name}` : 'New strategy'}
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!ready}
                loading={validate.isPending}
                onClick={() => validate.mutate(def, { onSuccess: setServerCheck, onError: (e) => toast.error(e.message) })}
              >
                Validate
              </Button>
              <Button size="sm" variant="primary" onClick={onSave} loading={save.isPending} disabled={!ready}>
                <Save className="h-3.5 w-3.5" /> {editingId ? 'Update' : 'Save'}
              </Button>
            </div>
          }
          bodyClassName="p-4 space-y-6"
        >
          {!catalog.data ? (
            <SkeletonRows rows={8} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_120px]">
                <Field label="Name" htmlFor="sname">
                  <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </Field>
                <Field label="Description" htmlFor="sdesc">
                  <Input id="sdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} />
                </Field>
                <Field label="Timeframe" htmlFor="stf">
                  <Select id="stf" value={def.timeframe} onChange={(e) => setDef({ ...def, timeframe: e.target.value as Timeframe })}>
                    {(['5m', '15m', '1h', '1d', '1w'] as Timeframe[]).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <RuleGroupEditor title="Entry: generate BUY when" tone="up" group={def.entry} catalog={cat} onChange={(entry) => setDef({ ...def, entry })} />
              <RuleGroupEditor title="Exit: close the position when" tone="down" group={def.exit} catalog={cat} onChange={(exit) => setDef({ ...def, exit })} />
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">Risk</h3>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ['stop_loss_pct', 'Stop-loss %', 'Exit if price falls this far below entry'],
                      ['take_profit_pct', 'Target %', 'Exit if price rises this far above entry'],
                      ['position_size_pct', 'Position size % of equity', 'Capital committed per trade'],
                    ] as const
                  ).map(([k, l, h]) => (
                    <Field key={k} label={l} hint={h}>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        className="num"
                        value={def.risk[k] ?? ''}
                        onChange={(e) => setDef({ ...def, risk: { ...def.risk, [k]: e.target.value === '' ? (k === 'position_size_pct' ? 0 : null) : Number(e.target.value) } })}
                      />
                    </Field>
                  ))}
                </div>
              </div>

              <div className="rounded-card border border-line bg-ground p-4">
                <div className="mb-2 text-xs text-muted">Reads as</div>
                <p className="text-[13px] leading-relaxed">
                  <span className="font-semibold text-up">BUY</span> when {def.entry.conditions.map((c) => conditionText(c, cat)).join(` ${def.entry.logic} `) || '…'}.
                </p>
                <p className="mt-1 text-[13px] leading-relaxed">
                  <span className="font-semibold text-down">EXIT</span> when{' '}
                  {[
                    ...def.exit.conditions.map((c) => conditionText(c, cat)),
                    ...(def.risk.stop_loss_pct ? [`price falls ${def.risk.stop_loss_pct}% below entry`] : []),
                    ...(def.risk.take_profit_pct ? [`price rises ${def.risk.take_profit_pct}% above entry`] : []),
                  ].join(' OR ') || '…'}
                  .
                </p>
                <AnimatePresence>
                  {(local.length > 0 || serverCheck) && (
                    <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-1 overflow-hidden text-xs">
                      {local.map((e) => (
                        <li key={e} className="flex gap-1.5 text-down">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {e}
                        </li>
                      ))}
                      {!local.length && serverCheck?.valid && (
                        <li className="flex gap-1.5 text-up">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" /> The rule engine accepted this definition.
                        </li>
                      )}
                      {!local.length &&
                        serverCheck?.errors.map((e) => (
                          <li key={e} className="flex gap-1.5 text-down">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {e}
                          </li>
                        ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4">
                <div className="w-full max-w-[260px]">
                  <div className="label mb-1.5">Test on</div>
                  <SymbolSearch onPick={setTestSymbol} placeholder={testSymbol} />
                </div>
                <Button
                  disabled={!ready}
                  loading={evaluate.isPending}
                  onClick={() => evaluate.mutate({ definition: def, symbol: testSymbol, timeframe: def.timeframe }, { onError: (e) => toast.error(e.message) })}
                >
                  <Play className="h-3.5 w-3.5" /> Evaluate {testSymbol} now
                </Button>
                <Button
                  disabled={!ready}
                  variant="ghost"
                  loading={screen.isPending}
                  onClick={() => screen.mutate({ logic: def.entry.logic, conditions: def.entry.conditions, timeframe: def.timeframe }, { onError: (e) => toast.error(e.message) })}
                >
                  <ScanSearch className="h-3.5 w-3.5" /> Run entry rules as a screen
                </Button>
                <Button
                  variant="ghost"
                  disabled={!editingId}
                  title={editingId ? '' : 'Save the strategy first'}
                  onClick={() => router.push(`/backtesting?strategy_id=${editingId}&symbol=${testSymbol}`)}
                >
                  <FlaskConical className="h-3.5 w-3.5" /> Backtest
                </Button>
              </div>
            </>
          )}
        </Panel>

        <Panel
          className="xl:col-span-4"
          title={
            <Tabs
              ruled={false}
              size="sm"
              value={list}
              onChange={setList}
              items={[
                { value: 'mine', label: `My strategies${saved.data ? ` · ${saved.data.length}` : ''}` },
                { value: 'builtin', label: 'Built-in' },
              ]}
            />
          }
        >
          {list === 'mine' ? (
            saved.isLoading ? (
              <SkeletonRows />
            ) : (saved.data ?? []).length === 0 ? (
              <EmptyState title="No saved strategies" body="Build one on the left and save it to reuse in backtests." />
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {saved.data!.map((s) => (
                    <motion.li
                      key={s.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn('group border-t border-rule px-4 py-3 first:border-t-0', editingId === s.id && 'bg-raised/60')}
                    >
                      <div className="flex items-start gap-2">
                        <button className="min-w-0 flex-1 text-left" onClick={() => load(s.id)}>
                          <div className="truncate text-[13px] font-medium">{s.name}</div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted">{s.definition.entry.conditions.map((c) => conditionText(c, cat)).join(` ${s.definition.entry.logic} `)}</div>
                          <div className="mt-1 text-[11px] text-faint">
                            {s.definition.timeframe} · updated {relative(s.updated_at)}
                          </div>
                        </button>
                        <div className="flex flex-none gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <button className="rounded p-1.5 text-muted hover:bg-raised hover:text-ink" aria-label={`Edit ${s.name}`} onClick={() => load(s.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button className="rounded p-1.5 text-muted hover:bg-raised hover:text-ink" aria-label={`Duplicate ${s.name}`} onClick={() => dup.mutate(s.id, { onSuccess: () => toast.success('Duplicated') })}>
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1.5 text-muted hover:bg-down/10 hover:text-down"
                            aria-label={`Delete ${s.name}`}
                            onClick={() => {
                              if (confirm(`Delete “${s.name}”? Backtests that used it keep their results.`))
                                del.mutate(s.id, {
                                  onSuccess: () => {
                                    if (editingId === s.id) reset();
                                    toast.success('Strategy deleted');
                                  },
                                });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )
          ) : (
            <ul>
              {(builtin.data ?? []).map((b) => (
                <li key={b.key} className="border-t border-rule px-4 py-3 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{b.name}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{b.description}</p>
                      <p className="num mt-1 text-[11px] text-faint">{b.params.map((p) => `${p.label} ${p.default}`).join(' · ')}</p>
                    </div>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/backtesting?builtin=${b.key}`}>Backtest</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <AnimatePresence>
          {evaluate.data && (
            <motion.div key="eval" className="xl:col-span-12" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SignalCard s={evaluate.data} showSymbol />
            </motion.div>
          )}
          {screen.data && (
            <motion.div key="screen" className="xl:col-span-12" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Screen results · {screen.data.total} matched on the latest {def.timeframe} bar</h2>
                  <button className="text-xs text-muted hover:text-ink" onClick={() => screen.reset()}>
                    Close
                  </button>
                </div>
                {screen.data.items.length === 0 ? (
                  <EmptyState title="No stock meets every entry rule right now" />
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Sector</th>
                        <th className="r">Price</th>
                        <th className="r">Change</th>
                        <th>Rules met</th>
                      </tr>
                    </thead>
                    <tbody>
                      {screen.data.items.map((s) => (
                        <tr key={s.symbol} className="row-link cursor-pointer" onClick={() => router.push(`/stocks/${s.symbol}`)}>
                          <td className="font-medium">{s.symbol}</td>
                          <td className="text-muted">{s.sector}</td>
                          <td className="r num">{price(s.price)}</td>
                          <td className={cn('r num', toneClass(s.change_pct))}>{pct(s.change_pct)}</td>
                          <td className="max-w-[420px] truncate text-xs text-muted">{s.matched.join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Stagger>
    </Page>
  );
}

export default function StrategiesPage() {
  return (
    <Suspense>
      <Builder />
    </Suspense>
  );
}
