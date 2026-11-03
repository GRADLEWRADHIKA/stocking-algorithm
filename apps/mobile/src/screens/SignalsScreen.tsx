import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Radar} from 'lucide-react-native';
import {useBuiltinStrategies, useScanSignals, useSignals} from '../api/hooks';
import {Button, EmptyState, ErrorState, Panel, Screen, SelectField, SignalRow, SkeletonRows, SourceBadge, Tabs, Txt} from '../components';
import type {RootScreenProps} from '../navigation/types';
import {usePalette} from '../theme';

type ActionVal = 'all' | 'BUY' | 'SELL';

/** Web /signals: stored output of the built-in strategies, filters, scan, tap a row for the full reasoning. */
export function SignalsScreen({navigation, route}: RootScreenProps<'Signals'>) {
  const p = usePalette();
  const symbol = route.params?.symbol;
  const [action, setAction] = useState<ActionVal>('all');
  const [strategy, setStrategy] = useState('');
  const builtin = useBuiltinStrategies();
  const scan = useScanSignals();
  const q = useSignals({symbol, action: action === 'all' ? undefined : action, strategy_key: strategy || undefined, limit: 100});
  const rows = q.data ?? [];

  return (
    <Screen
      back
      title={symbol ? `Trading signals · ${symbol}` : 'Trading signals'}
      testID="signals-screen"
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      headerExtra={
        <View style={styles.gap}>
          <Txt variant="small" tone="muted">
            Stored output of the built-in strategies. Each row links to the full reasoning: conditions, levels, sizing and the score method.
          </Txt>
          <View style={styles.row}>
            <Button
              size="sm"
              variant="primary"
              title="Scan universe now"
              testID="scan-universe"
              loading={scan.isPending}
              icon={<Radar size={14} color={p.ground} />}
              onPress={() => scan.mutate({strategy_key: strategy || undefined})}
            />
            <SourceBadge source={rows[0]?.data_source ?? 'SIMULATED'} />
          </View>
        </View>
      }>
      <Tabs<ActionVal>
        ruled={false}
        value={action}
        onChange={setAction}
        testID="signal-action"
        items={[
          {value: 'all', label: 'Buy and sell'},
          {value: 'BUY', label: 'Buy only'},
          {value: 'SELL', label: 'Sell only'},
        ]}
      />
      <SelectField
        size="sm"
        accessibilityLabel="Strategy"
        title="Strategy"
        testID="signal-strategy"
        value={strategy}
        onChange={setStrategy}
        options={[{value: '', label: 'All strategies'}, ...(builtin.data ?? []).map(b => ({value: b.key, label: b.name}))]}
      />
      <Txt variant="caption" tone="muted">
        Strength is a deterministic score of how clearly conditions are met, not a probability of profit.
      </Txt>
      <Panel>
        {q.isLoading ? (
          <SkeletonRows rows={10} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No stored signals match" body="Run a scan to evaluate every strategy on every instrument." />
        ) : (
          <View style={styles.clip}>
            {rows.map((s, i) => (
              <SignalRow key={`${s.id ?? i}-${s.symbol}-${s.strategy_key}`} s={s} onPress={() => navigation.navigate('SignalDetail', {signal: s})} />
            ))}
          </View>
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: {gap: 10},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap'},
  clip: {marginTop: -1},
});
