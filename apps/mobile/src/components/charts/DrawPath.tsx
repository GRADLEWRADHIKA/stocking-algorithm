import React, {useEffect} from 'react';
import Animated, {Easing, useAnimatedProps, useSharedValue, withTiming} from 'react-native-reanimated';
import {Path, type PathProps} from 'react-native-svg';
import {useReduceMotion} from '../../hooks/useReduceMotion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Total length of an "M x,y L x,y …" polyline path (enough for the draw-in dash trick). */
export function pathLength(d: string): number {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) {
    return 0;
  }
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) {
    len += Math.hypot(Number(nums[i]) - Number(nums[i - 2]), Number(nums[i + 1]) - Number(nums[i - 1]));
  }
  return len;
}

export interface DrawPathProps extends PathProps {
  d: string;
  /** Duration of the draw-in (web: 1.1 s ease-out-expo). */
  duration?: number;
  delay?: number;
}

/** A stroked path that draws itself in once (web motion `pathLength 0 → 1`). Static under reduce-motion. */
export function DrawPath({d, duration = 1100, delay = 0, ...rest}: DrawPathProps) {
  const reduce = useReduceMotion();
  const len = pathLength(d) + 2;
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    const t = setTimeout(() => {
      progress.value = withTiming(1, {duration, easing: Easing.bezier(0.16, 1, 0.3, 1)});
    }, delay);
    return () => clearTimeout(t);
  }, [d, reduce, duration, delay, progress]);
  const animatedProps = useAnimatedProps(() => ({strokeDashoffset: len * (1 - progress.value)}));
  return <AnimatedPath d={d} strokeDasharray={[len, len]} animatedProps={animatedProps} {...rest} />;
}
