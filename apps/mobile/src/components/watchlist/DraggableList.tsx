import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {indexForOffset} from '../../utils/reorder';
import {usePalette} from '../../theme';

export const ROW_H = 60;

function moveWorklet(list: string[], from: number, to: number): string[] {
  'worklet';
  const out = list.slice();
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

interface RowProps {
  id: string;
  order: SharedValue<string[]>;
  active: SharedValue<string>;
  reduce: boolean;
  onDrop: (id: string, next: string[]) => void;
  onTap?: (id: string) => void;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}

function DragRow({id, order, active, reduce, onDrop, onTap, children, trailing}: RowProps) {
  const p = usePalette();
  const startIdx = useSharedValue(0);
  const top = useSharedValue(Math.max(0, order.value.indexOf(id)) * ROW_H);
  const dragging = useSharedValue(false);
  const lift = useSharedValue(0);

  // follow the order when another row moves past this one
  useAnimatedReaction(
    () => order.value.indexOf(id),
    (idx, prev) => {
      if (idx !== prev && !dragging.value && idx >= 0) {
        top.value = reduce ? idx * ROW_H : withSpring(idx * ROW_H, {stiffness: 420, damping: 38});
      }
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      startIdx.value = order.value.indexOf(id);
      dragging.value = true;
      active.value = id;
      lift.value = withTiming(1, {duration: 120});
    })
    .onUpdate(e => {
      top.value = startIdx.value * ROW_H + e.translationY;
      const cur = order.value.indexOf(id);
      const to = indexForOffset(startIdx.value, e.translationY, ROW_H, order.value.length);
      if (to !== cur && cur >= 0) {
        order.value = moveWorklet(order.value, cur, to);
      }
    })
    .onFinalize(() => {
      if (!dragging.value) {
        return;
      }
      dragging.value = false;
      lift.value = withTiming(0, {duration: 150});
      const idx = order.value.indexOf(id);
      top.value = reduce ? idx * ROW_H : withSpring(idx * ROW_H, {stiffness: 420, damping: 38});
      active.value = '';
      runOnJS(onDrop)(id, order.value.slice());
    });

  const tap = Gesture.Tap()
    .maxDuration(240)
    .onEnd((_e, ok) => {
      if (ok && onTap) {
        runOnJS(onTap)(id);
      }
    });

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: active.value === id ? 10 : 1,
    elevation: lift.value * 8,
    shadowOpacity: lift.value * 0.35,
    transform: [{scale: 1 + lift.value * 0.01}],
  }));

  return (
    <Animated.View
      testID={`wl-row-${id}`}
      accessibilityHint="Long-press and drag to reorder"
      style={[styles.row, {backgroundColor: p.surface, borderTopColor: p.rule}, style]}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View style={styles.content}>{children}</View>
      </GestureDetector>
      {trailing}
    </Animated.View>
  );
}

export interface DraggableListProps {
  /** Symbols in display order (from the server, sorted by position). */
  ids: string[];
  renderRow: (id: string) => React.ReactNode;
  renderTrailing?: (id: string) => React.ReactNode;
  /** Called on drop with the full new order (only commit when it changed). */
  onDrop: (next: string[], movedId: string) => void;
  onTap?: (id: string) => void;
}

/** Long-press-drag list: rows animate to their new slots while dragging (web framer-motion Reorder). */
export function DraggableList({ids, renderRow, renderTrailing, onDrop, onTap}: DraggableListProps) {
  const reduce = useReduceMotion();
  const order = useSharedValue<string[]>(ids);
  const active = useSharedValue('');
  const key = ids.join(',');

  useEffect(() => {
    order.value = key ? key.split(',') : [];
  }, [key, order]);

  const handleDrop = (id: string, next: string[]) => onDrop(next, id);

  return (
    <View testID="draggable-list" style={{height: ids.length * ROW_H}}>
      {ids.map(id => (
        <DragRow
          key={id}
          id={id}
          order={order}
          active={active}
          reduce={reduce}
          onDrop={handleDrop}
          onTap={onTap}
          trailing={renderTrailing?.(id)}>
          {renderRow(id)}
        </DragRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 8},
  },
  content: {flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12},
});
