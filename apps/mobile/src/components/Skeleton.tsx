import React, {useEffect, useState} from 'react';
import {StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming} from 'react-native-reanimated';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {radius, usePalette} from '../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}

/** Web `.skeleton`: raised block with a line-coloured gradient sweeping across every 1.6 s. */
export function Skeleton({width = '100%', height = 16, rounded = radius.sm, style}: SkeletonProps) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce || !w) {
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, {duration: 1600, easing: Easing.linear}), -1, false);
  }, [t, reduce, w]);
  const sweep = useAnimatedStyle(() => ({transform: [{translateX: -w + t.value * 2 * w}]}));
  return (
    <View
      testID="skeleton"
      aria-hidden
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[{width, height, borderRadius: rounded, backgroundColor: p.raised}, styles.clip, style]}>
      {w > 0 && !reduce ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="sk" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={p.line} stopOpacity={0} />
                <Stop offset="0.5" stopColor={p.line} stopOpacity={0.7} />
                <Stop offset="1" stopColor={p.line} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={height} fill="url(#sk)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Web SkeletonRows: rows of [w-20][flex-1][w-16]. */
export function SkeletonRows({rows = 5, style}: {rows?: number; style?: StyleProp<ViewStyle>}) {
  return (
    <View style={[styles.rows, style]} accessibilityLabel="Loading" accessibilityState={{busy: true}}>
      {Array.from({length: rows}).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={80} />
          <View style={styles.flex}>
            <Skeleton />
          </View>
          <Skeleton width={64} />
        </View>
      ))}
    </View>
  );
}

export const SkeletonList = SkeletonRows;

export function SkeletonCard({height = 120, style}: {height?: number; style?: StyleProp<ViewStyle>}) {
  return <Skeleton height={height} rounded={radius.card} style={style} />;
}

const styles = StyleSheet.create({
  clip: {overflow: 'hidden'},
  rows: {gap: 12, padding: 16},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  flex: {flex: 1},
});
