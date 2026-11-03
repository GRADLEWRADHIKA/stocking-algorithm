import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeInLeft} from 'react-native-reanimated';
import {GitCompareArrows, Play} from 'lucide-react-native';
import {useBacktest, useBacktests, useBuiltinStrategies, useCompareBacktests, useRunBacktest, useSavedStrategies, useStockDetail} from '../api/hooks';
import type {StrategyRef, Timeframe} from '../api/types';
import {Button} from '../components/Button';
import {HeadLink, Panel} from '../components/Panel';
import {Screen} from '../components/Screen';
import {SelectField, type SelectOption} from '../components/SelectField';
import {SkeletonRows} from '../components/Skeleton';
import {EmptyState, ErrorState} from '../components/States';
import {TextField} from '../components/TextField';
import {toast} from '../components/Toast';
import {Txt} from '../components/Txt';
import {BacktestResults} from '../components/backtest/BacktestResults';
import {SymbolPicker} from '../components/strategy/SymbolPicker';
import {useReduceMotion} from '../hooks/useReduceMotion';
import type {RootScreenProps} from '../navigation/types';
import {changeColor, usePalette} from '../theme';
import {defaultBacktestForm, toBacktestRequest, validateBacktestForm, type BacktestForm} from '../utils/backtestForm';
import {pct, relative} from '../utils/fmt';

export function BacktestingScreen({navigation, route}: RootScreenProps<'Backtesting'>) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const builtin = useBuiltinStrategies();
  const saved = useSavedStrategies();
  const history = useBacktests();
  const run = useRunBacktest();
  const compare = useCompareBacktests();
  const [selected, setSelected] = useState<number | null>(null);
  const shown = useBacktest(selected);

  const [strategy, setStrategy] = useState<string>(
    route.params?.savedId ? `saved:${route.params.savedId}` : `builtin:${route.params?.strategyKey ?? 'ma_crossover'}`,
  );
  const [form, setForm] = useState<BacktestForm>(() => defaultBacktestForm(route.params?.symbol ?? 'RELIANCE'));
  const [submitted, setSubmitted] = useState(false);
  const stock = useStockDetail(form.symbol);
  const tfs: Timeframe[] = stock.data?.available_timeframes ?? ['1d'];

  // Route params can change while the screen is mounted (e.g. a new Backtest link).
  useEffect(() => {
    if (route.params?.savedId) {
      setStrategy(`saved:${route.params.savedId}`);
    } else if (route.params?.strategyKey) {
      setStrategy(`builtin:${route.params.strategyKey}`);
    }
    if (route.params?.symbol) {
      setForm(f => ({...f, symbol: route.params!.symbol!}));
    }
  }, [route.params]);

  // Timeframe limited to what the stock has.
  useEffect(() => {
    if (stock.data && !tfs.includes(form.timeframe)) {
      setForm(f => ({...f, timeframe: tfs.includes('1d') ? '1d' : tfs[0]}));
    }
  }, [stock.data, tfs, form.timeframe]);

  const errors = useMemo(() => validateBacktestForm(form), [form]);
  const shownErr = submitted ? errors : {};
  const valid = Object.keys(errors).length === 0;
  const set = (k: keyof BacktestForm) => (v: string) => setForm(f => ({...f, [k]: v}));

  const strategyOptions: SelectOption<string>[] = [
    ...(builtin.data ?? []).map(b => ({value: `builtin:${b.key}`, label: b.name, group: 'Built-in'})),
    ...(saved.data ?? []).map(s => ({value: `saved:${s.id}`, label: s.name, group: 'My strategies'})),
  ];

  const onRun = () => {
    setSubmitted(true);
    if (!valid) {
      return;
    }
    run.mutate(toBacktestRequest(form, strategy), {
      onSuccess: r => {
        setSelected(r.id);
        compare.reset();
      },
      onError: e => toast.error('Backtest failed', {description: (e as Error).message}),
    });
  };
  const onCompare = () => {
    setSubmitted(true);
    if (!valid) {
      return;
    }
    compare.mutate(
      {base: toBacktestRequest(form, strategy), strategies: (builtin.data ?? []).map(b => ({type: 'builtin', key: b.key}) as StrategyRef)},
      {onError: e => toast.error('Comparison failed', {description: (e as Error).message})},
    );
  };

  const result = run.data && run.data.id === selected ? run.data : shown.data;

  const num = (k: keyof BacktestForm, label: string, hint?: string) => (
    <View style={styles.half}>
      <TextField label={label} hint={hint} num size="sm" keyboardType="decimal-pad" value={form[k]} onChangeText={set(k)} error={shownErr[k]} />
    </View>
  );

  return (
    <Screen back title="Backtesting" subtitle="Simulated, net of modelled costs" keyboard testID="backtesting-screen">
      <Txt variant="caption" tone="muted">
        Event-driven simulation: signals on bar close fill at the next bar’s open, with brokerage, charges and slippage.
      </Txt>

      <Panel index={0} title="Configuration" bodyStyle={styles.body}>
        <SymbolPicker label="Stock" value={form.symbol} onPick={set('symbol')} testID="backtest-symbol" />
        <SelectField label="Strategy" value={strategy} options={strategyOptions} onChange={setStrategy} testID="backtest-strategy" />
        <View style={styles.row}>
          <View style={styles.third}>
            <SelectField label="Timeframe" num size="sm" value={form.timeframe} options={tfs.map(t => ({value: t, label: t}))} onChange={t => setForm(f => ({...f, timeframe: t}))} />
          </View>
          <View style={styles.third}>
            <TextField label="From" num size="sm" placeholder="YYYY-MM-DD" value={form.start} onChangeText={set('start')} error={shownErr.start} autoCapitalize="none" />
          </View>
          <View style={styles.third}>
            <TextField label="To" num size="sm" placeholder="YYYY-MM-DD" value={form.end} onChangeText={set('end')} error={shownErr.end} autoCapitalize="none" />
          </View>
        </View>
        <View style={styles.grid}>
          {num('initial_capital', 'Initial capital ₹')}
          {num('position_size_pct', 'Position size %')}
          {num('brokerage_pct', 'Brokerage %')}
          {num('brokerage_flat', 'Brokerage cap ₹')}
          {num('transaction_cost_pct', 'Charges % (STT etc.)')}
          {num('slippage_bps', 'Slippage bps')}
          {num('stop_loss_pct', 'Stop-loss %', 'Optional')}
          {num('take_profit_pct', 'Take-profit %', 'Optional')}
        </View>
        <TextField
          label="Out-of-sample hold-out %"
          hint="Last part of the period reported separately"
          num
          size="sm"
          keyboardType="decimal-pad"
          value={form.out_of_sample_pct}
          onChangeText={set('out_of_sample_pct')}
          error={shownErr.out_of_sample_pct}
        />
        <View style={styles.row}>
          <Button
            title="Run backtest"
            variant="primary"
            icon={<Play size={14} color={p.ground} />}
            loading={run.isPending}
            onPress={onRun}
            style={styles.flex}
            testID="backtest-run"
          />
          <Button
            title="Compare all"
            accessibilityLabel="Run every built-in strategy with these settings"
            icon={<GitCompareArrows size={14} color={p.ink} />}
            loading={compare.isPending}
            onPress={onCompare}
            testID="backtest-compare"
          />
        </View>
      </Panel>

      {compare.data ? (
        <Panel title={`Strategy comparison on ${form.symbol}`} action={<HeadLink label="Close" onPress={() => compare.reset()} />}>
          <View style={[styles.cmpRow, styles.cmpHead]}>
            <Txt variant="micro" tone="muted" style={styles.cmpName}>
              Strategy
            </Txt>
            {['Return', 'Max DD', 'Sharpe', 'PF', 'Trades', 'Win'].map(h => (
              <Txt key={h} variant="micro" tone="muted" align="right" style={styles.cmpCell}>
                {h}
              </Txt>
            ))}
          </View>
          {[...compare.data]
            .sort((a, b) => b.metrics.total_return_pct - a.metrics.total_return_pct)
            .map((c, i) => (
              <Animated.View
                key={c.strategy_name}
                entering={reduce ? undefined : FadeInLeft.delay(i * 50).duration(250)}
                style={[styles.cmpRow, {borderTopColor: p.rule, borderTopWidth: 1}]}>
                <Txt variant="caption" style={styles.cmpName} numberOfLines={2}>
                  {c.strategy_name}
                </Txt>
                <Txt variant="caption" num align="right" color={changeColor(p, c.metrics.total_return_pct)} style={styles.cmpCell}>
                  {pct(c.metrics.total_return_pct, 1)}
                </Txt>
                <Txt variant="caption" num align="right" tone="down" style={styles.cmpCell}>
                  {pct(-Math.abs(c.metrics.max_drawdown_pct), 1)}
                </Txt>
                <Txt variant="caption" num align="right" style={styles.cmpCell}>
                  {c.metrics.sharpe_ratio?.toFixed(2) ?? '—'}
                </Txt>
                <Txt variant="caption" num align="right" style={styles.cmpCell}>
                  {c.metrics.profit_factor?.toFixed(2) ?? '—'}
                </Txt>
                <Txt variant="caption" num align="right" style={styles.cmpCell}>
                  {c.metrics.num_trades}
                </Txt>
                <Txt variant="caption" num align="right" style={styles.cmpCell}>
                  {c.metrics.win_rate === null ? '—' : pct(c.metrics.win_rate, 0, false)}
                </Txt>
              </Animated.View>
            ))}
        </Panel>
      ) : null}

      {run.isPending || (selected && shown.isLoading) ? (
        <Panel>
          <SkeletonRows rows={10} />
        </Panel>
      ) : shown.isError && !run.data ? (
        <Panel>
          <ErrorState error={shown.error} onRetry={() => shown.refetch()} />
        </Panel>
      ) : result ? (
        <BacktestResults key={result.id} r={result} />
      ) : (
        <Panel index={1}>
          <EmptyState
            icon={<Play size={20} color={p.faint} />}
            title="Configure a backtest and run it"
            body="Results show net of costs, with an equity curve against buy-and-hold, drawdowns, every trade and an out-of-sample split."
          />
        </Panel>
      )}

      <Panel index={2} title="Recent runs">
        {history.isLoading ? (
          <SkeletonRows rows={4} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} compact />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState title="No runs yet" />
        ) : (
          (history.data ?? []).map((h, i) => (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              testID={`backtest-run-${h.id}`}
              onPress={() => navigation.navigate('BacktestResult', {id: h.id})}
              style={({pressed}) => [
                styles.histRow,
                i > 0 && {borderTopColor: p.rule, borderTopWidth: 1},
                (pressed || selected === h.id) && {backgroundColor: p.raised},
              ]}>
              <View style={styles.flex}>
                <Txt variant="small" numberOfLines={1}>
                  {h.symbol} · {h.strategy_name}
                </Txt>
                <Txt variant="micro" tone="faint">
                  {h.timeframe} · {h.num_trades} trades · {relative(h.created_at)}
                </Txt>
              </View>
              <Txt variant="caption" num color={changeColor(p, h.total_return_pct)}>
                {pct(h.total_return_pct)}
              </Txt>
            </Pressable>
          ))
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  body: {padding: 16, gap: 12},
  row: {flexDirection: 'row', gap: 8},
  third: {flex: 1},
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12},
  half: {width: '48.5%'},
  cmpRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 4},
  cmpHead: {paddingTop: 10},
  cmpName: {flex: 2.2},
  cmpCell: {flex: 1},
  histRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10},
});
