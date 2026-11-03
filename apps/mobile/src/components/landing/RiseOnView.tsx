import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {type LayoutChangeEvent, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming} from 'react-native-reanimated';
import {useReduceMotion} from '../../hooks/useReduceMotion';

/** Bottom edge of the visible area, in scroll-content coordinates (provided by the Welcome ScrollView). */
export const ViewportContext = createContext<number>(Number.POSITIVE_INFINITY);

/**
 * Web `whileInView` rise (opacity 0, y 20 → visible, 550 ms ease-out-expo), triggered once when the block
 * scrolls into view. Must be a direct child of the scroll content so its layout y is in content space.
 */
export function RiseOnView({children, delay = 0, style, testID}: {children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; testID?: string}) {
  const reduce = useReduceMotion();
  const bottom = useContext(ViewportContext);
  const [y, setY] = useState<number | null>(null);
  const shown = useRef(false);
  const t = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (shown.current) {
      return;
    }
    if (reduce) {
      shown.current = true;
      t.value = 1;
      return;
    }
    if (y !== null && y < bottom - 60) {
      shown.current = true;
      t.value = withDelay(delay, withTiming(1, {duration: 550, easing: Easing.bezier(0.16, 1, 0.3, 1)}));
    }
  }, [y, bottom, reduce, delay, t]);

  const a = useAnimatedStyle(() => ({opacity: t.value, transform: [{translateY: (1 - t.value) * 20}]}));
  return (
    <Animated.View testID={testID} onLayout={(e: LayoutChangeEvent) => setY(e.nativeEvent.layout.y)} style={[style, a]}>
      {children}
    </Animated.View>
  );
}
