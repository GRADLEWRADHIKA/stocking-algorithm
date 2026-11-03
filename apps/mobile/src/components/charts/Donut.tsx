import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {Easing, useAnimatedProps, useSharedValue, withDelay, withTiming} from 'react-native-reanimated';
import Svg, {Circle, G} from 'react-native-svg';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {usePalette, type Palette} from '../../theme';
import {Txt} from '../Txt';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutPart {
  label: string;
  value: number;
}

export interface DonutProps {
  parts: DonutPart[];
  size?: number;
  stroke?: number;
  /** Centre text (web: "4 lines" / "3 sectors"). */
  center?: string;
  testID?: string;
}

/** Same palette order as web Donut: ink, accent, info, up, muted, faint. */
export function donutColors(p: Palette): string[] {
  return [p.ink, p.accent, p.info, p.up, p.muted, p.faint];
}

/** Top five parts, the remainder grouped as "Other" (web Donut). */
export function donutData(parts: DonutPart[]): DonutPart[] {
  const sorted = [...parts].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, x) => s + x.value, 0);
  return rest > 0 ? [...top, {label: 'Other', value: rest}] : top;
}

function Arc({cx, r, stroke, color, len, C, offset, index}: {cx: number; r: number; stroke: number; color: string; len: number; C: number; offset: number; index: number}) {
  const reduce = useReduceMotion();
  const drawn = useSharedValue(reduce ? len : 0);
  useEffect(() => {
    drawn.value = reduce ? len : withDelay(index * 80, withTiming(len, {duration: 900, easing: Easing.bezier(0.16, 1, 0.3, 1)}));
  }, [len, reduce, index, drawn]);
  const animatedProps = useAnimatedProps(() => ({strokeDasharray: [Math.max(0, drawn.value), C]}));
  return (
    <AnimatedCircle
      cx={cx}
      cy={cx}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeDashoffset={-offset}
      animatedProps={animatedProps}
    />
  );
}

/** Thin ring for 3–6 parts of a whole with a legend; arcs draw in one after another. */
export function Donut({parts, size = 132, stroke = 10, center, testID}: DonutProps) {
  const p = usePalette();
  const colors = donutColors(p);
  const data = donutData(parts);
  const total = data.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const gap = data.length > 1 ? 2 : 0;
  let acc = 0;
  return (
    <View testID={testID} style={styles.row}>
      <View style={{width: size, height: size}}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.raised} strokeWidth={stroke} />
            {data.map((x, i) => {
              const len = (x.value / total) * C;
              const el = (
                <Arc key={x.label} cx={size / 2} r={r} stroke={stroke} color={colors[i % colors.length]} len={Math.max(0, len - gap)} C={C} offset={acc} index={i} />
              );
              acc += len;
              return el;
            })}
          </G>
        </Svg>
        {center ? (
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <Txt variant="micro" tone="muted" align="center">
              {center}
            </Txt>
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        {data.map((x, i) => (
          <View key={x.label} style={styles.item}>
            <View style={[styles.dot, {backgroundColor: colors[i % colors.length]}]} />
            <Txt variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
              {x.label}
            </Txt>
            <Txt variant="caption" num>
              {((x.value / total) * 100).toFixed(1)}%
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 20},
  center: {alignItems: 'center', justifyContent: 'center'},
  legend: {flex: 1, minWidth: 0, gap: 6},
  item: {flexDirection: 'row', alignItems: 'center', gap: 8},
  dot: {width: 8, height: 8, borderRadius: 4},
  flex: {flex: 1},
});
