import React, {useEffect, useRef, useState} from 'react';
import type {StyleProp, TextStyle} from 'react-native';
import {Easing, runOnJS, useAnimatedReaction, useSharedValue, withTiming} from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {type as typeScale} from '../theme';
import {price} from '../utils/fmt';
import {Txt} from './Txt';

export interface AnimatedNumberProps {
  value: number | null | undefined;
  format?: (v: number) => string;
  duration?: number;
  variant?: keyof typeof typeScale;
  weight?: TextStyle['fontWeight'];
  color?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Web AnimatedNumber: counts from the previous value to the new one (first paint starts at 96%),
 * 900 ms ease-out-expo, formatting applied every frame. Reduce-motion shows the final value.
 */
export function AnimatedNumber({
  value,
  format = v => price(v),
  duration = 900,
  variant = 'display',
  weight,
  color,
  style,
  testID,
}: AnimatedNumberProps) {
  const reduce = useReduceMotion();
  const sv = useSharedValue(value ?? 0);
  const first = useRef(true);
  const [display, setDisplay] = useState<number | null>(value ?? null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplay(null);
      return;
    }
    if (reduce) {
      sv.value = value;
      setDisplay(value);
      return;
    }
    if (first.current) {
      sv.value = value * 0.96;
      first.current = false;
    }
    sv.value = withTiming(value, {duration, easing: Easing.bezier(0.16, 1, 0.3, 1)});
  }, [value, duration, reduce, sv]);

  useAnimatedReaction(
    () => sv.value,
    (cur, prev) => {
      if (cur !== prev) {
        runOnJS(setDisplay)(cur);
      }
    },
  );

  return (
    <Txt testID={testID} variant={variant} num weight={weight} color={color} style={style}>
      {display === null || value === null || value === undefined ? '—' : format(display)}
    </Txt>
  );
}
