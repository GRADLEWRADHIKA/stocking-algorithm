import React, {useEffect} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeInUp, FadeOutUp} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {create} from 'zustand';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {radius, usePalette} from '../theme';
import {Txt} from './Txt';

export type ToastKind = 'default' | 'success' | 'error';
export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  kind: ToastKind;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
export const useToasts = create<ToastState>(set => ({
  items: [],
  push: t => set(s => ({items: [...s.items.slice(-2), {...t, id: nextId++}]})),
  dismiss: id => set(s => ({items: s.items.filter(x => x.id !== id)})),
}));

/** Same call shape as the web's sonner: toast(title, {description}), toast.success, toast.error. */
export function toast(title: string, opts: {description?: string} = {}) {
  useToasts.getState().push({title, description: opts.description, kind: 'default'});
}
toast.success = (title: string, opts: {description?: string} = {}) =>
  useToasts.getState().push({title, description: opts.description, kind: 'success'});
toast.error = (title: string, opts: {description?: string} = {}) =>
  useToasts.getState().push({title, description: opts.description, kind: 'error'});

function ToastView({t}: {t: ToastItem}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const dismiss = useToasts(s => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), 4000);
    return () => clearTimeout(timer);
  }, [t.id, dismiss]);
  const bar = t.kind === 'success' ? p.up : t.kind === 'error' ? p.down : p.accent;
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInUp.duration(220)}
      exiting={reduce ? undefined : FadeOutUp.duration(180)}
      style={[styles.toast, {backgroundColor: p.surface, borderColor: p.line}]}>
      <Pressable testID="toast" accessibilityRole="alert" onPress={() => dismiss(t.id)} style={styles.inner}>
        <View style={[styles.bar, {backgroundColor: bar}]} />
        <View style={styles.text}>
          <Txt variant="small" weight="500">
            {t.title}
          </Txt>
          {t.description ? (
            <Txt variant="caption" tone="muted">
              {t.description}
            </Txt>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** In-app toast stack (top of screen). Mounted once in the root navigator. */
export function ToastHost() {
  const items = useToasts(s => s.items);
  const insets = useSafeAreaInsets();
  if (!items.length) {
    return null;
  }
  return (
    <View pointerEvents="box-none" style={[styles.host, {top: insets.top + 8}]}>
      {items.map(t => (
        <ToastView key={t.id} t={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 1000, elevation: 1000},
  toast: {
    borderWidth: 1,
    borderRadius: radius.card,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
  },
  inner: {flexDirection: 'row', gap: 10, padding: 12},
  bar: {width: 2, borderRadius: 1},
  text: {flex: 1, gap: 2},
});
