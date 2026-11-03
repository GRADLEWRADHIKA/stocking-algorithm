import React, {useEffect, useRef} from 'react';
import {StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming} from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {alpha, changeColor, radius, type as typeScale, usePalette} from '../theme';
import {inr, pct, price, signed, signedInr} from '../utils/fmt';
import {Txt} from './Txt';

export function formatPriceValue(
  value: number | null | undefined,
  format: 'inr' | 'number' | 'pct' = 'inr',
  decimals = 2,
  sign = false,
): string {
  if (format === 'pct') {
    return pct(value, decimals);
  }
  if (format === 'number') {
    return sign ? signed(value, decimals) : price(value, decimals);
  }
  return sign ? signedInr(value, decimals) : inr(value, decimals);
}

/** Green/red wash that fades over 900 ms whenever `value` moves (web `animate-flash-up/down`). */
function useFlash(value: number | null | undefined, enabled: boolean, dir?: 'up' | 'down' | 'flat') {
  const reduce = useReduceMotion();
  const prev = useRef(value);
  const pulse = useSharedValue(0);
  const side = useSharedValue(1);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (!enabled || reduce || before === undefined || before === null || value === undefined || value === null || before === value) {
      return;
    }
    side.value = dir && dir !== 'flat' ? (dir === 'up' ? 1 : -1) : value > before ? 1 : -1;
    pulse.value = withSequence(withTiming(1, {duration: 1}), withTiming(0, {duration: 900, easing: Easing.out(Easing.quad)}));
  }, [value, enabled, reduce, dir, pulse, side]);
  return {pulse, side};
}

export interface PriceTextProps {
  value: number | null | undefined;
  /** When provided the text is coloured by its sign (up / down / muted). */
  change?: number | null;
  /** 'inr' => ₹12,34,567.50, 'number' => 12,34,567.50, 'pct' => +1.23% */
  format?: 'inr' | 'number' | 'pct';
  decimals?: number;
  sign?: boolean;
  variant?: keyof typeof typeScale;
  weight?: TextStyle['fontWeight'];
  /** Wash green/red when `value` changes (live ticks). */
  flash?: boolean;
  dir?: 'up' | 'down' | 'flat';
  color?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PriceText({
  value,
  change,
  format = 'inr',
  decimals = 2,
  sign = false,
  variant = 'body',
  weight = '400',
  flash = false,
  dir,
  color,
  style,
  containerStyle,
  testID,
}: PriceTextProps) {
  const p = usePalette();
  const {pulse, side} = useFlash(value, flash, dir);
  const upBg = alpha(p.up, 0.28);
  const downBg = alpha(p.down, 0.28);
  const overlay = useAnimatedStyle(() => ({
    opacity: pulse.value,
    backgroundColor: side.value >= 0 ? upBg : downBg,
  }));
  const c = color ?? (change === undefined ? p.ink : changeColor(p, change));
  return (
    <View style={[styles.wrap, containerStyle]}>
      {flash ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, overlay]} /> : null}
      <Txt testID={testID} variant={variant} num weight={weight} color={c} style={style}>
        {formatPriceValue(value, format, decimals, sign)}
      </Txt>
    </View>
  );
}

/** Web FlashPrice: a plain price (no ₹) that briefly washes green or red when it ticks. */
export function FlashPrice(props: Omit<PriceTextProps, 'format' | 'flash'>) {
  return <PriceText {...props} format="number" flash />;
}

/** Web Change: "+12.40 (+1.23%)" or "+1.23%" coloured by sign. */
export function ChangeText({
  change,
  changePct,
  variant = 'caption',
  testID,
  style,
}: {
  change?: number | null;
  changePct: number | null | undefined;
  variant?: keyof typeof typeScale;
  testID?: string;
  style?: StyleProp<TextStyle>;
}) {
  const p = usePalette();
  const text = change === undefined || change === null ? pct(changePct) : `${signed(change)} (${pct(changePct)})`;
  return (
    <Txt testID={testID} variant={variant} num color={changeColor(p, changePct ?? change)} style={style}>
      {text}
    </Txt>
  );
}

const styles = StyleSheet.create({
  wrap: {alignSelf: 'flex-start', paddingHorizontal: 4, marginHorizontal: -4},
  flash: {borderRadius: radius.sm},
});
