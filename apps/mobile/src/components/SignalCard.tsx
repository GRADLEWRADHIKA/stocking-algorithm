import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {Easing, FadeInLeft, useAnimatedStyle, useSharedValue, withDelay, withTiming} from 'react-native-reanimated';
import {Check, Minus, X} from 'lucide-react-native';
import type {Signal} from '../api/types';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {alpha, radius, usePalette} from '../theme';
import {dateTime, inr, pct, price} from '../utils/fmt';
import {ActionBadge, SourceBadge} from './Badge';
import {riseAt} from './Panel';
import {Txt} from './Txt';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Width that grows from 0 to `to` (fraction 0..1 of the parent) — the web's motion `animate={{width}}`. */
function GrowBar({to, color, delay = 0, style, left = 0, parentW}: {to: number; color: string; delay?: number; style?: object; left?: number; parentW: number}) {
  const reduce = useReduceMotion();
  const w = useSharedValue(reduce ? to * parentW : 0);
  useEffect(() => {
    const target = Math.max(0, to) * parentW;
    w.value = reduce ? target : withDelay(delay, withTiming(target, {duration: 700, easing: EASE}));
  }, [to, parentW, reduce, delay, w]);
  const a = useAnimatedStyle(() => ({width: w.value}));
  return <Animated.View style={[styles.abs, {left: left * parentW, backgroundColor: color}, style, a]} />;
}

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)];
}

/** Web StrengthMeter: 56px track with an ink bar, then the score. Not a probability. */
export function StrengthMeter({score, label}: {score: number; label?: string}) {
  const p = usePalette();
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <View
      style={styles.meter}
      accessibilityLabel={`Strength score ${score.toFixed(0)} of 100${label ? `, ${label.toLowerCase()}` : ''}. Weighted condition margins, not a probability of profit.`}>
      <View style={[styles.track, {backgroundColor: p.raised}]}>
        <GrowBar to={clamped / 100} color={p.ink} parentW={56} style={styles.round} />
      </View>
      <Txt variant="caption" num align="right" style={styles.score}>
        {score.toFixed(0)}
      </Txt>
    </View>
  );
}

/** Stop · entry · target drawn to scale so the risk/reward is seen, not only read. */
export function PriceLadder({entry, stop, target}: {entry: number; stop: number | null; target: number | null}) {
  const p = usePalette();
  const [w, onLayout] = useWidth();
  if (!stop || !target) {
    return null;
  }
  const lo = Math.min(stop, target, entry);
  const hi = Math.max(stop, target, entry);
  const pos = (v: number) => (v - lo) / (hi - lo || 1);
  const riskLeft = Math.min(pos(stop), pos(entry));
  const riskW = Math.abs(pos(entry) - pos(stop));
  const rewLeft = Math.min(pos(entry), pos(target));
  const rewW = Math.abs(pos(target) - pos(entry));
  return (
    <View testID="price-ladder" style={styles.ladder}>
      <View onLayout={onLayout} style={[styles.ladderTrack, {backgroundColor: p.raised}]}>
        {w > 0 ? (
          <>
            <GrowBar to={riskW} left={riskLeft} parentW={w} color={alpha(p.down, 0.7)} style={styles.leftRound} />
            <GrowBar to={rewW} left={rewLeft} parentW={w} delay={100} color={alpha(p.up, 0.7)} style={styles.rightRound} />
            <View style={[styles.entryMark, {left: pos(entry) * w - 1, backgroundColor: p.ink}]} />
          </>
        ) : null}
      </View>
      <View style={styles.ladderLabels}>
        <View style={styles.flex}>
          <Txt variant="caption" tone="muted">
            Stop-loss
          </Txt>
          <Txt variant="caption" num tone="down">
            {price(stop)}
          </Txt>
        </View>
        <View style={[styles.flex, styles.center]}>
          <Txt variant="caption" tone="muted">
            Analysed price
          </Txt>
          <Txt variant="caption" num>
            {price(entry)}
          </Txt>
        </View>
        <View style={[styles.flex, styles.end]}>
          <Txt variant="caption" tone="muted">
            Take-profit
          </Txt>
          <Txt variant="caption" num tone="up">
            {price(target)}
          </Txt>
        </View>
      </View>
    </View>
  );
}

export function ConditionList({conditions}: {conditions: Signal['conditions']}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  return (
    <View style={styles.conds}>
      {conditions.map((c, i) => (
        <Animated.View
          key={i}
          testID={`condition-${i}`}
          entering={reduce ? undefined : FadeInLeft.delay(80 + i * 50).duration(300)}
          accessibilityLabel={`${c.satisfied ? 'Met' : 'Not met'}: ${c.description}${c.value ? `, ${c.value}` : ''}`}
          style={styles.cond}>
          <View style={[styles.check, {backgroundColor: c.satisfied ? alpha(p.up, 0.15) : p.raised}]}>
            {c.satisfied ? <Check size={11} strokeWidth={3} color={p.up} /> : <X size={11} strokeWidth={3} color={p.faint} />}
          </View>
          <Txt variant="small" tone={c.satisfied ? 'ink' : 'muted'} style={styles.flex}>
            {c.description}
          </Txt>
          {c.value ? (
            <Txt variant="caption" num tone="muted" style={styles.condVal}>
              {c.value}
            </Txt>
          ) : null}
        </Animated.View>
      ))}
    </View>
  );
}

function Rules({title, items}: {title: string; items: string[]}) {
  const p = usePalette();
  return (
    <View style={styles.flex}>
      <Txt variant="caption" tone="muted" style={styles.mb4}>
        {title}
      </Txt>
      {items.map(c => (
        <View key={c} style={styles.rule}>
          <Minus size={12} color={p.faint} style={styles.ruleIcon} />
          <Txt variant="caption" style={styles.flex}>
            {c}
          </Txt>
        </View>
      ))}
    </View>
  );
}

function Row({k, v}: {k: string; v: string}) {
  return (
    <View style={styles.dlRow}>
      <Txt variant="caption" tone="muted" style={styles.flex}>
        {k}
      </Txt>
      <Txt variant="caption" num align="right" style={styles.dd}>
        {v}
      </Txt>
    </View>
  );
}

/**
 * Same content as web SignalCard: conditions checklist, explanation, entry/exit rules, price ladder,
 * risk:reward, sizing, past trades, strength components + method, note + disclaimer.
 */
export function SignalCard({s, showSymbol = false, onSymbolPress, index = 0}: {s: Signal; showSymbol?: boolean; onSymbolPress?: (symbol: string) => void; index?: number}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const met = s.conditions.filter(c => c.satisfied).length;
  return (
    <Animated.View
      testID="signal-card"
      entering={riseAt(index, reduce)}
      style={[styles.card, {backgroundColor: p.surface, borderColor: p.line}]}>
      <View style={[styles.header, {borderBottomColor: p.rule}]}>
        <ActionBadge action={s.action} />
        <View style={styles.flex}>
          <Txt variant="title" numberOfLines={2}>
            {showSymbol ? (
              <Txt variant="title" onPress={onSymbolPress ? () => onSymbolPress(s.symbol) : undefined} accessibilityRole="link">
                {s.symbol}
                {'  '}
              </Txt>
            ) : null}
            {s.strategy}
          </Txt>
          <Txt variant="micro" num tone="muted">
            {s.exchange} · {s.timeframe} bar of {dateTime(s.timestamp, s.timeframe !== '1d')}
          </Txt>
        </View>
      </View>
      <View style={[styles.subHeader, {borderBottomColor: p.rule}]}>
        <SourceBadge source={s.data_source} />
        <StrengthMeter score={s.strength.score} label={s.strength.label} />
      </View>

      <View style={styles.body}>
        <View>
          <View style={styles.condHead}>
            <Txt variant="caption" tone="muted">
              Conditions checked
            </Txt>
            <Txt variant="caption" num tone="muted" testID="conditions-met">
              {met} of {s.conditions.length} met
            </Txt>
          </View>
          <ConditionList conditions={s.conditions} />
        </View>
        <Txt variant="small" style={styles.explain}>
          {s.explanation}
        </Txt>
        <View style={styles.rulesRow}>
          <Rules title="Entry rules" items={s.entry_conditions} />
          <Rules title="Exit rules" items={s.exit_conditions} />
        </View>

        <PriceLadder entry={s.price} stop={s.stop_loss} target={s.take_profit} />
        <View style={[styles.dl, {borderTopColor: p.rule}]}>
          <Row k="Risk : reward" v={s.risk_reward ? `1 : ${s.risk_reward.toFixed(2)}` : '—'} />
          {s.position_size ? (
            <>
              <Row k="Suggested size" v={`${s.position_size.quantity} shares`} />
              <Row k="Capital required" v={inr(s.position_size.capital_required, 0)} />
              <Row
                k="Capital at risk"
                v={`${inr(s.position_size.capital_at_risk, 0)} (${pct(s.position_size.risk_per_trade_pct, 1, false)} of ${inr(s.position_size.assumed_capital, 0)})`}
              />
            </>
          ) : null}
          {s.historical_performance ? (
            <Row
              k="Past trades, same rules"
              v={`${s.historical_performance.trades} · win ${s.historical_performance.win_rate === null ? '—' : pct(s.historical_performance.win_rate, 0, false)}`}
            />
          ) : null}
        </View>
        <View style={[styles.dl, {borderTopColor: p.rule}]}>
          <Txt variant="caption" tone="muted" style={styles.mb4}>
            Strength score {s.strength.score.toFixed(0)}/100 · {s.strength.label.toLowerCase()}
          </Txt>
          {s.strength.components.map(c => (
            <View key={c.name} style={styles.comp}>
              <Txt variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
                {c.name}
              </Txt>
              <View style={[styles.compTrack, {backgroundColor: p.raised}]}>
                <GrowBar to={Math.max(0, Math.min(1, c.value))} parentW={80} color={p.faint} />
              </View>
              <Txt variant="caption" num tone="faint" align="right" style={styles.weight}>
                ×{c.weight.toFixed(2)}
              </Txt>
            </View>
          ))}
          <Txt variant="micro" tone="faint" style={styles.method}>
            {s.strength.method}
          </Txt>
        </View>
      </View>
      <View style={[styles.footer, {borderTopColor: p.rule}]}>
        <Txt variant="micro" tone="faint" testID="signal-disclaimer">
          {s.historical_performance?.note ? `${s.historical_performance.note} ` : ''}
          {s.disclaimer}
        </Txt>
      </View>
    </Animated.View>
  );
}

/** One-line signal row (web SignalsTable row adapted to phone width). */
export function SignalRow({s, onPress, showStrategy = true}: {s: Signal; onPress?: () => void; showStrategy?: boolean}) {
  const p = usePalette();
  return (
    <Pressable
      testID={`signal-row-${s.symbol}-${s.strategy_key}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${s.action} ${s.symbol} ${s.strategy}`}
      style={({pressed}) => [styles.sigRow, {borderTopColor: p.rule}, pressed && {backgroundColor: alpha(p.raised, 0.7)}]}>
      <ActionBadge action={s.action} />
      <View style={styles.flex}>
        <Txt variant="small" weight="500" numberOfLines={1}>
          {s.symbol}
        </Txt>
        {showStrategy ? (
          <Txt variant="caption" tone="muted" numberOfLines={1}>
            {s.strategy}
          </Txt>
        ) : null}
      </View>
      <View style={styles.end}>
        <Txt variant="small" num>
          {price(s.price)}
        </Txt>
        <Txt variant="micro" num tone="muted">
          {price(s.stop_loss)} / {price(s.take_profit)}
        </Txt>
      </View>
      <StrengthMeter score={s.strength.score} label={s.strength.label} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  center: {alignItems: 'center'},
  end: {alignItems: 'flex-end'},
  abs: {position: 'absolute', top: 0, bottom: 0},
  round: {borderRadius: 999},
  meter: {flexDirection: 'row', alignItems: 'center', gap: 8},
  track: {width: 56, height: 4, borderRadius: 999, overflow: 'hidden'},
  score: {width: 26},
  ladder: {paddingTop: 4},
  ladderTrack: {height: 8, borderRadius: 999},
  leftRound: {borderTopLeftRadius: 999, borderBottomLeftRadius: 999},
  rightRound: {borderTopRightRadius: 999, borderBottomRightRadius: 999},
  entryMark: {position: 'absolute', top: -4, width: 2, height: 16, borderRadius: 1},
  ladderLabels: {flexDirection: 'row', marginTop: 8},
  conds: {gap: 6},
  cond: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  check: {width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2},
  condVal: {flexShrink: 0, marginTop: 2},
  card: {borderWidth: 1, borderRadius: radius.card, overflow: 'hidden'},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8},
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  body: {padding: 16, gap: 16},
  condHead: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
  explain: {lineHeight: 20},
  rulesRow: {flexDirection: 'row', gap: 12},
  mb4: {marginBottom: 4},
  rule: {flexDirection: 'row', gap: 6, marginBottom: 4},
  ruleIcon: {marginTop: 2},
  dl: {borderTopWidth: 1, paddingTop: 12, gap: 8},
  dlRow: {flexDirection: 'row', gap: 16},
  dd: {flexShrink: 1, maxWidth: '62%'},
  comp: {flexDirection: 'row', alignItems: 'center', gap: 8},
  compTrack: {width: 80, height: 4, borderRadius: 999, overflow: 'hidden'},
  weight: {width: 40},
  method: {marginTop: 4, lineHeight: 15},
  footer: {borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 8},
  sigRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52, borderTopWidth: 1},
});
