import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {Easing, FadeIn, FadeInDown, FadeInLeft, useAnimatedStyle, useSharedValue, withDelay, withTiming} from 'react-native-reanimated';
import type {IndexQuote, Quote, SectorPerformance} from '../../api/types';
import {useLive} from '../../hooks/useLiveQuotes';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {alpha, changeColor, usePalette} from '../../theme';
import {compact, pct, price, signed} from '../../utils/fmt';
import {FlashPrice} from '../PriceText';
import {Sparkline} from '../charts/Sparkline';
import {Txt} from '../Txt';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** A bar whose width grows from 0 to `width` px (web motion `animate={{width}}`). */
export function GrowBar({
  width,
  color,
  delay = 0,
  duration = 800,
  style,
}: {
  width: number;
  color: string;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const w = useSharedValue(reduce ? width : 0);
  useEffect(() => {
    w.value = reduce ? width : withDelay(delay, withTiming(width, {duration, easing: EASE}));
  }, [width, reduce, delay, duration, w]);
  const a = useAnimatedStyle(() => ({width: w.value}));
  return <Animated.View style={[{backgroundColor: color}, style, a]} />;
}

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)];
}

/** Web IndexStrip: indices in one ruled strip (2 columns on a phone); values follow the live index stream. */
export function IndexStrip({indices}: {indices: IndexQuote[]}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const live = useLive(s => s.indices);
  return (
    <View style={styles.strip} testID="index-strip">
      {indices.map((q, i) => {
        const l = live[q.symbol];
        const value = l?.value ?? q.value;
        const ch = l?.change ?? q.change;
        const cp = l?.change_pct ?? q.change_pct;
        const odd = i % 2 === 1;
        return (
          <Animated.View
            key={q.symbol}
            entering={reduce ? undefined : FadeInDown.delay(50 + i * 60).duration(450).easing(EASE)}
            style={[
              styles.indexCell,
              {borderTopColor: p.rule, borderLeftColor: p.rule},
              i >= 2 && styles.ruleTop,
              odd && styles.ruleLeft,
            ]}>
            <View style={styles.flex}>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                {q.name}
              </Txt>
              <FlashPrice value={value} dir={l?.dir} variant="h3" weight="500" style={styles.indexVal} />
              <Txt variant="micro" num color={changeColor(p, cp)} numberOfLines={1}>
                {signed(ch)} ({pct(cp)})
              </Txt>
            </View>
            <Sparkline data={q.sparkline} width={52} height={28} />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function BreadthBar({advancers, decliners, unchanged}: {advancers: number; decliners: number; unchanged: number}) {
  const p = usePalette();
  const [w, onLayout] = useWidth();
  const total = advancers + decliners + unchanged || 1;
  const segs = [
    {n: advancers, c: p.up, label: 'Advancing'},
    {n: unchanged, c: p.faint, label: 'Unchanged'},
    {n: decliners, c: p.down, label: 'Declining'},
  ];
  const shown = segs.filter(s => s.n > 0);
  const gaps = Math.max(0, shown.length - 1) * 2;
  return (
    <View testID="breadth-bar">
      <View onLayout={onLayout} style={styles.breadth}>
        {w > 0
          ? shown.map((s, i) => (
              <GrowBar key={s.label} width={((w - gaps) * s.n) / total} color={s.c} delay={100 + i * 80} duration={900} style={styles.fullH} />
            ))
          : null}
      </View>
      <View style={styles.breadthLegend}>
        {segs.map(s => (
          <Txt key={s.label} variant="caption" tone="muted">
            {s.label}{' '}
            <Txt variant="caption" num>
              {s.n}
            </Txt>
          </Txt>
        ))}
      </View>
    </View>
  );
}

/** Diverging bars around a zero axis, sorted strongest to weakest. */
export function SectorBars({sectors, onSector}: {sectors: SectorPerformance[]; onSector?: (sector: string) => void}) {
  const p = usePalette();
  const [w, onLayout] = useWidth();
  const sorted = [...sectors].sort((a, b) => b.change_pct - a.change_pct);
  const max = Math.max(0.5, ...sorted.map(s => Math.abs(s.change_pct)));
  return (
    <View testID="sector-bars">
      {sorted.map((s, i) => {
        const up = s.change_pct >= 0;
        const bw = (Math.abs(s.change_pct) / max) * (w / 2);
        return (
          <Pressable
            key={s.sector}
            onPress={onSector ? () => onSector(s.sector) : undefined}
            accessibilityRole="link"
            accessibilityLabel={`${s.sector} ${pct(s.change_pct)}`}
            style={styles.sectorRow}>
            <Txt variant="caption" tone="muted" numberOfLines={1} style={styles.sectorName}>
              {s.sector}
            </Txt>
            <View style={styles.sectorTrack} onLayout={i === 0 ? onLayout : undefined}>
              <View style={[styles.axis, {backgroundColor: p.line}]} />
              {w > 0 ? (
                <GrowBar
                  width={bw}
                  color={alpha(up ? p.up : p.down, 0.8)}
                  delay={100 + i * 30}
                  style={[styles.sectorBar, up ? {left: w / 2} : {right: w / 2}]}
                />
              ) : null}
            </View>
            <Txt variant="caption" num align="right" color={changeColor(p, s.change_pct)} style={styles.sectorPct}>
              {pct(s.change_pct)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Web QuoteTable: compact quote list merging the live tick over the REST snapshot. */
export function QuoteList({
  rows,
  metric = 'change',
  limit = 5,
  onPress,
}: {
  rows: Quote[];
  metric?: 'change' | 'volume' | 'value';
  limit?: number;
  onPress: (symbol: string) => void;
}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const ticks = useLive(s => s.ticks);
  return (
    <View>
      <View style={styles.qHead}>
        <Txt variant="caption" tone="muted" style={styles.flex}>
          Symbol
        </Txt>
        <Txt variant="caption" tone="muted" style={styles.qPrice} align="right">
          Price
        </Txt>
        <Txt variant="caption" tone="muted" style={styles.qMetric} align="right">
          {metric === 'change' ? 'Change' : metric === 'volume' ? 'Volume' : 'Traded value'}
        </Txt>
      </View>
      {rows.slice(0, limit).map((q, i) => {
        const live = ticks[q.symbol];
        const px = live?.price ?? q.price;
        const c = live?.change_pct ?? q.change_pct;
        const v = live?.volume ?? q.volume;
        return (
          <Animated.View key={q.symbol} entering={reduce ? undefined : FadeInLeft.delay(150 + i * 40).duration(300)}>
            <Pressable
              testID={`quote-${q.symbol}`}
              onPress={() => onPress(q.symbol)}
              accessibilityRole="button"
              accessibilityLabel={`${q.symbol} ${price(px)}`}
              style={({pressed}) => [styles.qRow, {borderTopColor: p.rule}, pressed && {backgroundColor: alpha(p.raised, 0.7)}]}>
              <Txt variant="small" weight="500" style={styles.flex} numberOfLines={1}>
                {q.symbol}
              </Txt>
              <View style={styles.qPrice}>
                <FlashPrice value={px} dir={live?.dir} variant="small" containerStyle={styles.selfEnd} />
              </View>
              <Txt
                variant="small"
                num
                align="right"
                color={metric === 'change' ? changeColor(p, c) : p.ink}
                style={styles.qMetric}>
                {metric === 'change' ? pct(c) : metric === 'volume' ? compact(v) : `₹${compact(v * px)}`}
              </Txt>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Heat colour: one hue per sign, intensity by magnitude (capped at ±3%). */
export function heatColor(c: number, up: string, down: string): string {
  const a = Math.min(1, Math.abs(c) / 3);
  return alpha(c >= 0 ? up : down, 0.12 + a * 0.6);
}

export interface HeatStock {
  symbol: string;
  name: string;
  sector: string;
  change_pct: number;
  price: number;
  market_cap: number | null;
}

/** Sector-grouped heat map; tiles follow the live tick, sized by market cap or equal. */
export function Heatmap({stocks, sizeBy, onPress}: {stocks: HeatStock[]; sizeBy: 'mcap' | 'equal'; onPress: (symbol: string) => void}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const ticks = useLive(s => s.ticks);
  const bySector = React.useMemo(() => {
    const m = new Map<string, HeatStock[]>();
    stocks.forEach(s => m.set(s.sector, [...(m.get(s.sector) ?? []), s]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [stocks]);
  return (
    <View style={styles.heat} testID="heatmap">
      {bySector.map(([sector, list], gi) => {
        const total = list.reduce((s, x) => s + (x.market_cap ?? 1), 0);
        return (
          <View key={sector}>
            <Txt variant="caption" tone="muted" style={styles.heatSector}>
              {sector}
            </Txt>
            <View style={styles.tiles}>
              {[...list]
                .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
                .map((s, i) => {
                  const l = ticks[s.symbol];
                  const c = l?.change_pct ?? s.change_pct;
                  const grow = sizeBy === 'mcap' ? Math.max(0.6, ((s.market_cap ?? 1) / total) * list.length) : 1;
                  return (
                    <Animated.View
                      key={s.symbol}
                      entering={reduce ? undefined : FadeIn.delay(Math.min(gi * 50 + i * 20, 900)).duration(350)}
                      style={{flexGrow: grow, flexBasis: 70 * grow, minWidth: 70}}>
                      <Pressable
                        testID={`heat-${s.symbol}`}
                        onPress={() => onPress(s.symbol)}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.name} ${price(l?.price ?? s.price)} ${pct(c)}`}
                        style={({pressed}) => [
                          styles.tile,
                          {backgroundColor: heatColor(c, p.up, p.down)},
                          pressed && styles.tilePressed,
                        ]}>
                        <Txt variant="caption" weight="600" numberOfLines={1}>
                          {s.symbol}
                        </Txt>
                        <Txt variant="micro" num color={alpha(p.ink, 0.8)}>
                          {pct(c)}
                        </Txt>
                      </Pressable>
                    </Animated.View>
                  );
                })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  selfEnd: {alignSelf: 'flex-end'},
  strip: {flexDirection: 'row', flexWrap: 'wrap'},
  indexCell: {width: '50%', flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 12, paddingVertical: 12},
  ruleTop: {borderTopWidth: 1},
  ruleLeft: {borderLeftWidth: 1},
  indexVal: {marginTop: 2},
  breadth: {flexDirection: 'row', height: 8, gap: 2, borderRadius: 999, overflow: 'hidden'},
  fullH: {height: 8},
  breadthLegend: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  sectorRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4},
  sectorName: {width: 110},
  sectorTrack: {flex: 1, height: 12, justifyContent: 'center'},
  axis: {position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1},
  sectorBar: {position: 'absolute', top: 2, height: 8, borderRadius: 2},
  sectorPct: {width: 60},
  qHead: {flexDirection: 'row', paddingHorizontal: 16, height: 34, alignItems: 'center'},
  qRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 44, borderTopWidth: 1},
  qPrice: {width: 100, alignItems: 'flex-end'},
  qMetric: {width: 86},
  heat: {padding: 16, gap: 14},
  heatSector: {marginBottom: 6},
  tiles: {flexDirection: 'row', flexWrap: 'wrap', gap: 4},
  tile: {height: 60, borderRadius: 4, paddingHorizontal: 8, justifyContent: 'center'},
  tilePressed: {transform: [{scale: 0.98}]},
});
