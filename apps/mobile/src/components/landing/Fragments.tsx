import React from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {FadeInLeft} from 'react-native-reanimated';
import type {Signal} from '../../api/types';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {changeColor, radius, usePalette} from '../../theme';
import {pct, price} from '../../utils/fmt';
import {sideConditions} from '../../utils/landing';
import {ActionBadge, SourceBadge} from '../Badge';
import {Sparkline} from '../charts/Sparkline';
import {ConditionList, PriceLadder, StrengthMeter} from '../SignalCard';
import {Skeleton} from '../Skeleton';
import {Txt} from '../Txt';
import {MiniChart} from './MiniChart';
import {useChartData, useLandingAnalysis, useLandingIndices} from './data';

/* Cropped, working pieces of the product (web landing/Fragments.tsx). */

function Frame({children, testID}: {children: React.ReactNode; testID?: string}) {
  const p = usePalette();
  return (
    <View testID={testID} style={[styles.frame, {backgroundColor: p.surface, borderColor: p.line}]}>
      {children}
    </View>
  );
}

function Head({children}: {children: React.ReactNode}) {
  const p = usePalette();
  return <View style={[styles.head, {borderBottomColor: p.rule}]}>{children}</View>;
}

export function SignalFragment({s}: {s: Signal | undefined}) {
  if (!s) {
    return <Skeleton height={220} rounded={radius.card} />;
  }
  const {conditions, label} = sideConditions(s);
  const met = conditions.filter(c => c.satisfied).length;
  return (
    <Frame testID="fragment-signal">
      <Head>
        <ActionBadge action={s.action} />
        <View style={styles.flex}>
          <Txt variant="title" numberOfLines={1}>
            {s.symbol} · {s.strategy}
          </Txt>
          <Txt variant="micro" tone="muted" testID="fragment-met">
            {`${met} of ${conditions.length} ${label} conditions met`}
          </Txt>
        </View>
        <StrengthMeter score={s.strength.score} />
      </Head>
      <View style={styles.body}>
        <ConditionList conditions={conditions.slice(0, 4)} />
        <Txt variant="caption" tone="muted" numberOfLines={3} style={styles.mt}>
          {s.explanation}
        </Txt>
      </View>
    </Frame>
  );
}

export function ChartFragment({symbol}: {symbol: string}) {
  const p = usePalette();
  const {data} = useChartData(symbol);
  return (
    <Frame testID="fragment-chart">
      <Head>
        <Txt variant="caption" weight="600" style={styles.flex}>
          {symbol} · 1d
        </Txt>
        <View style={styles.legend}>
          <View style={[styles.legendBar, {backgroundColor: p.up}]} />
          <View style={[styles.legendBar, {backgroundColor: p.down}]} />
          <Txt variant="micro" tone="muted">
            Supertrend(10, 3)
          </Txt>
        </View>
        {data ? <SourceBadge source={data.source} /> : null}
      </Head>
      <View style={styles.chart}>{data ? <MiniChart candles={data.candles} st={data.st} height={190} /> : <Skeleton height={190} />}</View>
    </Frame>
  );
}

export function IndicesFragment({limit = 3}: {limit?: number}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const {data} = useLandingIndices();
  return (
    <Frame testID="fragment-indices">
      {(data ?? []).slice(0, limit).map((q, i) => (
        <Animated.View
          key={q.symbol}
          entering={reduce ? undefined : FadeInLeft.delay(i * 60).duration(300)}
          style={[styles.idxRow, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
          <Txt variant="small" weight="500" numberOfLines={1} style={styles.idxName}>
            {q.name.replace(/\s*\(.*\)$/, '')}
          </Txt>
          <Sparkline data={q.sparkline} width={70} height={24} />
          <Txt variant="small" num align="right" style={styles.flex}>
            {price(q.value)}
          </Txt>
          <Txt variant="caption" num align="right" color={changeColor(p, q.change_pct)} style={styles.idxPct}>
            {pct(q.change_pct)}
          </Txt>
        </Animated.View>
      ))}
      {!data ? <Skeleton height={96} style={styles.m16} /> : null}
    </Frame>
  );
}

export function ReadoutFragment({symbol}: {symbol: string}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const {data} = useLandingAnalysis(symbol);
  return (
    <Frame testID="fragment-readout">
      <Head>
        <Txt variant="caption" weight="600" style={styles.flex}>
          {symbol} · strategy read-out
        </Txt>
        {data ? <SourceBadge source={data.data_source} /> : null}
      </Head>
      {(data?.signals ?? []).slice(0, 9).map((x, i) => (
        <Animated.View
          key={x.strategy_key}
          entering={reduce ? undefined : FadeInLeft.delay(i * 40).duration(260)}
          style={[styles.readRow, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
          <Txt variant="caption" weight="600" tone={x.action === 'BUY' ? 'up' : x.action === 'SELL' ? 'down' : 'muted'} style={styles.readAction}>
            {x.action}
          </Txt>
          <Txt variant="caption" numberOfLines={1} style={styles.flex}>
            {x.strategy}
          </Txt>
          <StrengthMeter score={x.strength.score} />
        </Animated.View>
      ))}
      {!data ? <Skeleton height={160} style={styles.m16} /> : null}
    </Frame>
  );
}

export function LadderFragment({s}: {s: Signal | undefined}) {
  if (!s) {
    return <Skeleton height={120} rounded={radius.card} />;
  }
  return (
    <Frame>
      <View style={styles.body}>
        <View style={styles.between}>
          <Txt variant="caption" weight="600">
            {s.symbol} · levels from ATR
          </Txt>
          <Txt variant="caption" tone="muted">
            Risk : reward{' '}
            <Txt variant="caption" num>
              {s.risk_reward ? `1 : ${s.risk_reward.toFixed(2)}` : '—'}
            </Txt>
          </Txt>
        </View>
        {s.stop_loss && s.take_profit ? (
          <PriceLadder entry={s.price} stop={s.stop_loss} target={s.take_profit} />
        ) : (
          <Txt variant="caption" tone="muted">
            No levels set: this strategy is holding at {price(s.price)}.
          </Txt>
        )}
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  frame: {borderWidth: 1, borderRadius: radius.card, overflow: 'hidden'},
  head: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1},
  body: {padding: 14, gap: 12},
  mt: {marginTop: 10},
  m16: {margin: 16, width: undefined},
  legend: {flexDirection: 'row', alignItems: 'center', gap: 2},
  legendBar: {width: 8, height: 2},
  chart: {paddingHorizontal: 6, paddingVertical: 4},
  idxRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10},
  idxName: {width: 92},
  idxPct: {width: 62},
  readRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 5},
  readAction: {width: 34},
  between: {flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'},
});
