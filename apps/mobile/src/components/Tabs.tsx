import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {usePalette} from '../theme';
import {Txt} from './Txt';

export interface TabItem<V extends string> {
  value: V;
  label: string;
  disabled?: boolean;
}

export interface TabsProps<V extends string> {
  items: ReadonlyArray<TabItem<V>>;
  value: V;
  onChange: (v: V) => void;
  size?: 'sm' | 'md';
  /** Hairline rule under the whole row (web `ruled`). */
  ruled?: boolean;
  /** Horizontal scroll for long lists (default true). */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  gap?: number;
}

/**
 * The product's one selection mark: a 1px saffron line exactly as wide as the label, sliding
 * between options (Reanimated spring 520/40, like the web's framer-motion layoutId).
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  size = 'md',
  ruled = true,
  scroll = true,
  style,
  contentStyle,
  testID,
  gap,
}: TabsProps<V>) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [layouts, setLayouts] = useState<Record<string, {x: number; w: number}>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const first = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const active = layouts[value];

  useEffect(() => {
    if (!active) {
      return;
    }
    if (first.current || reduce) {
      x.value = active.x;
      w.value = active.w;
      first.current = false;
    } else {
      const cfg = {stiffness: 520, damping: 40, mass: 1};
      x.value = withSpring(active.x, cfg);
      w.value = withSpring(active.w, cfg);
    }
    scrollRef.current?.scrollTo?.({x: Math.max(0, active.x - 40), animated: !reduce});
  }, [active, reduce, x, w]);

  const line = useAnimatedStyle(() => ({transform: [{translateX: x.value}], width: w.value}));
  const g = gap ?? (size === 'sm' ? 14 : 20);

  const row = (
    <View style={[styles.row, {gap: g}, contentStyle]}>
      {items.map(it => {
        const selected = it.value === value;
        return (
          <Pressable
            key={it.value}
            testID={testID ? `${testID}-${it.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            accessibilityLabel={it.label}
            disabled={it.disabled}
            hitSlop={{top: 8, bottom: 8, left: g / 2, right: g / 2}}
            onLayout={(e: LayoutChangeEvent) => {
              const {x: lx, width} = e.nativeEvent.layout;
              setLayouts(prev =>
                prev[it.value]?.x === lx && prev[it.value]?.w === width ? prev : {...prev, [it.value]: {x: lx, w: width}},
              );
            }}
            onPress={() => onChange(it.value)}
            style={[styles.tab, size === 'sm' ? styles.tabSm : styles.tabMd, it.disabled && styles.disabled]}>
            <Txt variant={size === 'sm' ? 'caption' : 'small'} weight={selected ? '500' : '400'} tone={selected ? 'ink' : 'muted'}>
              {it.label}
            </Txt>
          </Pressable>
        );
      })}
      {active ? <Animated.View pointerEvents="none" style={[styles.line, {backgroundColor: p.accent}, line]} /> : null}
    </View>
  );

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[ruled ? {borderBottomWidth: 1, borderBottomColor: p.rule} : null, style]}>
      {scroll ? (
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {row}
        </ScrollView>
      ) : (
        row
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end'},
  tab: {paddingBottom: 8},
  tabMd: {paddingTop: 8},
  tabSm: {paddingTop: 4},
  disabled: {opacity: 0.35},
  line: {position: 'absolute', left: 0, bottom: 0, height: 1},
});
