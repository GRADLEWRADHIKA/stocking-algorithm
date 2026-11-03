import React from 'react';
import {Pressable, type PressableProps, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (web buttons: active:scale-[0.97]). */
  activeScale?: number;
}

/** Pressable with the web's press-scale feedback (150 ms). Disabled under reduce-motion. */
export function PressableScale({style, activeScale = 0.97, onPressIn, onPressOut, disabled, ...rest}: PressableScaleProps) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={e => {
        if (!reduce) {
          scale.value = withTiming(activeScale, {duration: 120});
        }
        onPressIn?.(e);
      }}
      onPressOut={e => {
        scale.value = withTiming(1, {duration: 150});
        onPressOut?.(e);
      }}
      style={[style, animated, disabled ? {opacity: 0.5} : null]}
    />
  );
}
