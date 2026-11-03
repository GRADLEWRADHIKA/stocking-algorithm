import React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {riseAt} from './Panel';

/** Staggered rise: each item fades/slides in 60 ms after the previous one (web `Stagger` + `rise`). */
export function Stagger({index, children, style}: {index: number; children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={riseAt(index, reduce)} style={style}>
      {children}
    </Animated.View>
  );
}
