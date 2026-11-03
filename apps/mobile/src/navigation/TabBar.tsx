import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {BarChart3, BriefcaseBusiness, LayoutDashboard, Star, UserRound} from 'lucide-react-native';
import {Txt} from '../components/Txt';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {usePalette} from '../theme';

const ICONS: Record<string, typeof LayoutDashboard> = {
  Home: LayoutDashboard,
  Markets: BarChart3,
  Watchlist: Star,
  Portfolio: BriefcaseBusiness,
  Profile: UserRound,
};

const INDICATOR_W = 28;

/** Bottom tabs with the product's selection mark: a thin saffron line that slides to the active tab. */
export function TabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const tabW = state.routes.length ? width / state.routes.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = state.index * tabW + (tabW - INDICATOR_W) / 2;
    x.value = reduce ? target : withSpring(target, {stiffness: 520, damping: 40});
  }, [state.index, tabW, x, reduce]);

  const indicator = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));

  return (
    <View
      testID="tab-bar"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.bar, {backgroundColor: p.surface, borderTopColor: p.line, paddingBottom: Math.max(insets.bottom, 8)}]}>
      {tabW > 0 ? <Animated.View style={[styles.indicator, {backgroundColor: p.accent}, indicator]} /> : null}
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const {options} = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const Icon = ICONS[route.name] ?? LayoutDashboard;
        const color = focused ? p.ink : p.muted;
        const onPress = () => {
          const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        return (
          <Pressable
            key={route.key}
            testID={`tab-${route.name}`}
            accessibilityRole="tab"
            accessibilityState={{selected: focused}}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={() => navigation.emit({type: 'tabLongPress', target: route.key})}
            style={styles.tab}>
            <Icon size={20} color={color} strokeWidth={focused ? 2 : 1.7} />
            <Txt variant="micro" color={color} weight={focused ? '500' : '400'}>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', borderTopWidth: 1, paddingTop: 8},
  tab: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 2},
  indicator: {position: 'absolute', top: -1, left: 0, width: INDICATOR_W, height: 1},
});
