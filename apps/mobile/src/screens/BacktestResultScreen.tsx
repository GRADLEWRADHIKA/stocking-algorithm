import React from 'react';
import {useBacktest} from '../api/hooks';
import {Button} from '../components/Button';
import {Panel} from '../components/Panel';
import {Screen} from '../components/Screen';
import {SkeletonRows} from '../components/Skeleton';
import {ErrorState} from '../components/States';
import {BacktestResults} from '../components/backtest/BacktestResults';
import type {RootScreenProps} from '../navigation/types';

/** A stored backtest run (recent runs list) — the same Results panel as the web backtesting page. */
export function BacktestResultScreen({navigation, route}: RootScreenProps<'BacktestResult'>) {
  const {id} = route.params;
  const q = useBacktest(id);
  const r = q.data;
  return (
    <Screen
      back
      title={r ? `${r.symbol} backtest` : 'Backtest'}
      subtitle={r ? r.strategy_name : undefined}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      testID="backtest-result-screen">
      {q.isError ? (
        <Panel>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Panel>
      ) : !r ? (
        <Panel>
          <SkeletonRows rows={10} />
        </Panel>
      ) : (
        <>
          <BacktestResults r={r} />
          <Button
            title="Ask the assistant about this run"
            variant="ghost"
            onPress={() => navigation.navigate('Assistant', {symbol: r.symbol, question: `Summarize backtest ${r.id}`})}
          />
          <Button title="Run another backtest" onPress={() => navigation.navigate('Backtesting', {symbol: r.symbol})} />
        </>
      )}
    </Screen>
  );
}
