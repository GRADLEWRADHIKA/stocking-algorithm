import React from 'react';
import {Pressable, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {Easing, FadeInDown} from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {radius, usePalette} from '../theme';
import {Txt} from './Txt';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Entering animation for the staggered panel rise (web: y 14 → 0, 450 ms, 60 ms apart). */
export function riseAt(index: number, reduce: boolean) {
  if (reduce) {
    return undefined;
  }
  return FadeInDown.delay(20 + Math.min(index, 12) * 60)
    .duration(450)
    .easing(EASE)
    .withInitialValues({transform: [{translateY: 14}], opacity: 0});
}

export interface PanelProps {
  title?: string;
  /** Custom title node (e.g. tabs inside the head). */
  titleNode?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  /** Position in the page: panels rise in sequence on first paint. */
  index?: number;
  testID?: string;
  padded?: boolean;
}

/** Web `.panel`: surface, 1px line border, 8px radius; head h-11 with a rule underneath. */
export function Panel({title, titleNode, action, children, style, bodyStyle, index = 0, testID, padded}: PanelProps) {
  const p = usePalette();
  const reduce = useReduceMotion();
  return (
    <Animated.View
      testID={testID}
      entering={riseAt(index, reduce)}
      style={[styles.panel, {backgroundColor: p.surface, borderColor: p.line}, style]}>
      {title || titleNode || action ? (
        <View style={[styles.head, {borderBottomColor: p.rule}]}>
          <View style={styles.headTitle}>
            {titleNode ?? (
              <Txt variant="title" numberOfLines={1} accessibilityRole="header">
                {title}
              </Txt>
            )}
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      <View style={[padded ? styles.padded : null, bodyStyle]}>{children}</View>
    </Animated.View>
  );
}

/** "View all" / "Manage" style link used in panel heads. */
export function HeadLink({label, onPress, testID}: {label: string; onPress: () => void; testID?: string}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" testID={testID}>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </Pressable>
  );
}

export function PageHeader({title, sub, actions}: {title: string; sub?: React.ReactNode; actions?: React.ReactNode}) {
  return (
    <View style={styles.pageHeader}>
      <Txt variant="h1" accessibilityRole="header">
        {title}
      </Txt>
      {sub ? <View style={styles.sub}>{typeof sub === 'string' ? <Txt variant="small" tone="muted">{sub}</Txt> : sub}</View> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/** Web `KV`: label left (muted), figure right (mono), rule between rows. */
export function KV({k, v, color, first, testID}: {k: string; v: React.ReactNode; color?: string; first?: boolean; testID?: string}) {
  const p = usePalette();
  return (
    <View testID={testID} style={[styles.kv, !first && {borderTopWidth: 1, borderTopColor: p.rule}]}>
      <Txt variant="small" tone="muted" style={styles.kvKey}>
        {k}
      </Txt>
      {typeof v === 'string' || typeof v === 'number' ? (
        <Txt variant="small" num color={color} align="right" style={styles.kvVal}>
          {v}
        </Txt>
      ) : (
        v
      )}
    </View>
  );
}

/** Web `Stat`: small label, figure, optional sub line. */
export function Stat({label, children, sub, style}: {label: string; children: React.ReactNode; sub?: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  return (
    <View style={[styles.stat, style]}>
      <Txt variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Txt>
      {typeof children === 'string' ? (
        <Txt variant="h2" num weight="500" numberOfLines={1}>
          {children}
        </Txt>
      ) : (
        children
      )}
      {sub ? (typeof sub === 'string' ? <Txt variant="caption" tone="muted">{sub}</Txt> : sub) : null}
    </View>
  );
}

/** Bullet used in the web's summary lists (h-1 w-1 rounded dot). */
export function Bullet({children, strong}: {children: React.ReactNode; strong?: boolean}) {
  const p = usePalette();
  return (
    <View style={styles.bullet}>
      <View style={[styles.dot, {backgroundColor: strong ? p.ink : p.faint}]} />
      <Txt variant="small" style={styles.bulletText}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {borderWidth: 1, borderRadius: radius.card, overflow: 'hidden'},
  head: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
  },
  headTitle: {flexShrink: 1, flexGrow: 1},
  action: {flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0},
  padded: {padding: 16},
  pageHeader: {gap: 4, paddingBottom: 4},
  sub: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
  actions: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8},
  kv: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 8},
  kvKey: {flexShrink: 1},
  kvVal: {flexShrink: 0, maxWidth: '60%'},
  stat: {gap: 2, minWidth: 0},
  bullet: {flexDirection: 'row', gap: 8},
  dot: {width: 4, height: 4, borderRadius: 2, marginTop: 8},
  bulletText: {flex: 1},
});
