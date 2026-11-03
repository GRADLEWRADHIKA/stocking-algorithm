import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import type {Timeframe} from '../../api/types';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {alpha, radius, usePalette} from '../../theme';
import {dateTime, pct, price} from '../../utils/fmt';
import {DEMO_SYMBOLS, sliderParams, snapParam} from '../../utils/landing';
import {ActionBadge, SourceBadge} from '../Badge';
import {ConditionList, PriceLadder, StrengthMeter} from '../SignalCard';
import {Segmented} from '../Segmented';
import {SelectField} from '../SelectField';
import {Skeleton} from '../Skeleton';
import {Txt} from '../Txt';
import {useDemoSignal, useLandingBuiltins} from './data';
import {Slider} from './Slider';

export const SERVER_NEEDED = 'The demo needs the local QuantDesk server. Start the backend and this panel comes alive.';

function Row({label, children}: {label: string; children: React.ReactNode}) {
  const p = usePalette();
  return (
    <View style={[styles.row, {borderTopColor: p.rule}]}>
      <Txt variant="small" style={styles.rowLabel}>
        {label}
      </Txt>
      <View style={styles.rowCtl}>{children}</View>
    </View>
  );
}

/** Web LiveDemo: change the stock, the strategy or a parameter and the server re-evaluates the latest bar. */
export function LiveDemo() {
  const p = usePalette();
  const reduce = useReduceMotion();
  const builtins = useLandingBuiltins();
  const [symbol, setSymbol] = useState<string>('INFY');
  const [key, setKey] = useState('supertrend');
  const [tf, setTf] = useState<Timeframe>('1d');
  const strat = builtins.data?.find(b => b.key === key);
  const [params, setParams] = useState<Record<string, number>>({});
  const [debounced, setDebounced] = useState(params);

  useEffect(() => {
    if (strat) {
      setParams(Object.fromEntries(strat.params.map(x => [x.name, x.default])));
    }
  }, [strat]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(params), 220);
    return () => clearTimeout(t);
  }, [params]);

  const valid = useMemo(() => !!strat && strat.params.every(x => debounced[x.name] !== undefined), [strat, debounced]);
  const q = useDemoSignal({symbol, strategy_key: key, timeframe: tf, params: valid ? debounced : {}});
  const s = q.data;
  const sliders = sliderParams(strat);

  return (
    <View testID="live-demo" style={[styles.panel, {backgroundColor: p.surface, borderColor: p.line}]}>
      <View style={styles.result}>
        {s ? (
          <Animated.View key={`${s.symbol}-${s.strategy_key}`} entering={reduce ? undefined : FadeInDown.duration(250)} style={styles.gap}>
            <View style={styles.headRow}>
              <ActionBadge action={s.action} />
              <View style={styles.flex}>
                <Txt variant="h3" numberOfLines={2}>
                  {s.symbol} · {s.strategy}
                </Txt>
                <Txt variant="caption" num tone="muted">
                  {s.timeframe} bar of {dateTime(s.timestamp, s.timeframe !== '1d')} · close {price(s.price)}
                </Txt>
              </View>
              {q.isFetching ? <ActivityIndicator size="small" color={p.faint} accessibilityLabel="Evaluating" /> : null}
            </View>
            <View style={styles.between}>
              <SourceBadge source={s.data_source} />
              <StrengthMeter score={s.strength.score} label={s.strength.label} />
            </View>
            <ConditionList conditions={s.conditions} />
            <Txt variant="small" style={styles.lh}>
              {s.explanation}
            </Txt>
            {s.stop_loss && s.take_profit ? (
              <View style={[styles.ladder, {backgroundColor: alpha(p.raised, 0.5)}]}>
                <PriceLadder entry={s.price} stop={s.stop_loss} target={s.take_profit} />
              </View>
            ) : null}
            {s.historical_performance ? (
              <Txt variant="caption" tone="muted" testID="demo-history">
                Same rules on this stock’s stored history:{' '}
                <Txt variant="caption" num>
                  {s.historical_performance.trades}
                </Txt>{' '}
                trades, win rate{' '}
                <Txt variant="caption" num>
                  {s.historical_performance.win_rate === null ? '—' : pct(s.historical_performance.win_rate, 0, false)}
                </Txt>
                , average{' '}
                <Txt variant="caption" num>
                  {pct(s.historical_performance.avg_return_pct)}
                </Txt>{' '}
                per trade. Descriptive, not a probability.
              </Txt>
            ) : null}
          </Animated.View>
        ) : q.isError ? (
          <Txt variant="small" tone="muted" align="center" style={styles.offline} testID="demo-offline">
            {SERVER_NEEDED}
          </Txt>
        ) : (
          <Skeleton height={300} />
        )}
      </View>

      <View style={[styles.controls, {borderTopColor: p.line, backgroundColor: alpha(p.raised, 0.4)}]}>
        <Row label="Stock">
          <SelectField
            testID="demo-stock"
            size="sm"
            style={styles.select}
            title="Stock"
            value={symbol}
            onChange={setSymbol}
            options={DEMO_SYMBOLS.map(x => ({value: x, label: x}))}
          />
        </Row>
        <Row label="Strategy">
          <SelectField
            testID="demo-strategy"
            size="sm"
            style={styles.select}
            title="Strategy"
            value={key}
            onChange={setKey}
            options={(builtins.data ?? []).map(b => ({value: b.key, label: b.name}))}
            placeholder="Supertrend"
          />
        </Row>
        <Row label="Timeframe">
          <Segmented
            testID="demo-tf"
            value={tf}
            onChange={setTf}
            options={[
              {value: '1d', label: 'Daily'},
              {value: '1w', label: 'Weekly'},
            ]}
          />
        </Row>
        {sliders.map(x => {
          const v = params[x.name] ?? x.default;
          return (
            <Row key={`${key}-${x.name}`} label={x.label}>
              <View style={styles.sliderRow}>
                <Slider
                  testID={`demo-param-${x.name}`}
                  label={x.label}
                  value={v}
                  min={x.min}
                  max={x.max}
                  step={x.type === 'int' ? 1 : (x.max - x.min) / 50}
                  onChange={raw => setParams(o => ({...o, [x.name]: snapParam(x, raw)}))}
                />
                <Txt variant="small" num align="right" style={styles.val}>
                  {x.type === 'int' ? String(v) : Number(v).toFixed(1)}
                </Txt>
              </View>
            </Row>
          );
        })}
        {strat?.description ? (
          <Txt variant="small" tone="muted" style={styles.desc}>
            {strat.description}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  gap: {gap: 16},
  panel: {borderWidth: 1, borderRadius: radius.card, overflow: 'hidden'},
  result: {padding: 16, minHeight: 220, justifyContent: 'center'},
  headRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  lh: {lineHeight: 20},
  ladder: {borderRadius: radius.ctl, padding: 14},
  offline: {maxWidth: 300, alignSelf: 'center'},
  controls: {borderTopWidth: 1, padding: 16},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingVertical: 6, borderTopWidth: 1},
  rowLabel: {width: 96},
  rowCtl: {flex: 1, alignItems: 'flex-end'},
  sliderRow: {flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch'},
  val: {width: 44},
  select: {width: 180},
  desc: {marginTop: 16, lineHeight: 20},
});
