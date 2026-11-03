import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/**
 * System "reduce motion" setting (AccessibilityInfo). Shared module-level value so every animated
 * component reads the same answer; web equivalent is framer-motion's useReducedMotion.
 */
let current = false;
const listeners = new Set<(v: boolean) => void>();
let bound = false;

function bind() {
  if (bound) {
    return;
  }
  bound = true;
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then(v => {
      if (!!v !== current) {
        current = !!v;
        listeners.forEach(fn => fn(current));
      }
    })
    .catch(() => undefined);
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
    current = !!v;
    listeners.forEach(fn => fn(current));
  });
}

export function reduceMotionEnabled(): boolean {
  return current;
}

export function useReduceMotion(): boolean {
  const [v, setV] = useState(current);
  useEffect(() => {
    bind();
    listeners.add(setV);
    setV(current);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
