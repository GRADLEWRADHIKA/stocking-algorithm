import React, {useEffect, useState} from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {usePalette} from '../../theme';

const THUMB = 18;

/**
 * Minimal range slider (web <input type=range> with accent-color saffron) built on gesture-handler + Reanimated.
 * Reports raw values; the caller snaps them to the parameter step. Accessible as an adjustable control.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  testID,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  testID?: string;
}) {
  const p = usePalette();
  const [w, setW] = useState(0);
  const frac = (v: number) => (max === min ? 0 : (v - min) / (max - min));
  const x = useSharedValue(0);
  const width = useSharedValue(0);

  useEffect(() => {
    x.value = frac(value) * w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, w, min, max]);

  const emit = (fx: number) => onChange(min + fx * (max - min));
  const move = (px: number) => {
    'worklet';
    const clamped = Math.max(0, Math.min(width.value, px));
    x.value = clamped;
    if (width.value > 0) {
      runOnJS(emit)(clamped / width.value);
    }
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onBegin(e => move(e.x))
    .onUpdate(e => move(e.x));
  const tap = Gesture.Tap().onEnd(e => move(e.x));

  const fill = useAnimatedStyle(() => ({width: x.value}));
  const thumb = useAnimatedStyle(() => ({transform: [{translateX: x.value - THUMB / 2}]}));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{min, max, now: value}}
        accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
        onAccessibilityAction={e => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))}
        onLayout={(e: LayoutChangeEvent) => {
          setW(e.nativeEvent.layout.width);
          width.value = e.nativeEvent.layout.width;
        }}
        style={styles.hit}>
        <View style={[styles.track, {backgroundColor: p.line}]}>
          <Animated.View style={[styles.fill, {backgroundColor: p.accent}, fill]} />
        </View>
        <Animated.View style={[styles.thumb, {backgroundColor: p.accent, borderColor: p.surface}, thumb]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: {height: 32, justifyContent: 'center', flex: 1},
  track: {height: 4, borderRadius: 2, overflow: 'hidden'},
  fill: {height: 4},
  thumb: {position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 2},
});
