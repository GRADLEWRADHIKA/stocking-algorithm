import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {Check, Star} from 'lucide-react-native';
import {useWatchlistMutations, useWatchlists} from '../../api/hooks';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {usePalette} from '../../theme';
import {Button} from '../Button';
import {Sheet} from '../Sheet';
import {toast} from '../Toast';
import {Txt} from '../Txt';

/** Web WatchButton: "Watch"/"Watching" + a menu to add/remove the symbol per watchlist. */
export function WatchButton({symbol}: {symbol: string}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const {data} = useWatchlists();
  const m = useWatchlistMutations();
  const [open, setOpen] = useState(false);
  const lists = data ?? [];
  const inAny = lists.some(w => w.items.some(i => i.symbol === symbol));

  const scale = useSharedValue(1);
  useEffect(() => {
    if (!reduce) {
      scale.value = 0.4;
      scale.value = withSpring(1, {stiffness: 600, damping: 18});
    }
  }, [inAny, reduce, scale]);
  const star = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  return (
    <>
      <Button
        testID="watch-button"
        size="sm"
        variant="secondary"
        title={inAny ? 'Watching' : 'Watch'}
        accessibilityLabel="Add to watchlist"
        icon={
          <Animated.View style={star}>
            <Star size={14} color={inAny ? p.accent : p.ink} fill={inAny ? p.accent : 'transparent'} />
          </Animated.View>
        }
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title={`Watch ${symbol}`} scroll testID="watch-sheet">
        <View>
          {lists.map(w => {
            const has = w.items.some(i => i.symbol === symbol);
            return (
              <Pressable
                key={w.id}
                testID={`watch-list-${w.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{checked: has}}
                onPress={() => {
                  (has ? m.removeItem : m.addItem).mutate(
                    {id: w.id, symbol},
                    {
                      onSuccess: () => toast.success(has ? `Removed from ${w.name}` : `Added to ${w.name}`),
                      onError: e => toast.error((e as Error).message),
                    },
                  );
                }}
                style={({pressed}) => [styles.item, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
                <View style={styles.check}>{has ? <Check size={15} color={p.accent} /> : null}</View>
                <Txt variant="small">{w.name}</Txt>
              </Pressable>
            );
          })}
          {lists.length === 0 ? (
            <Txt variant="caption" tone="muted" style={styles.none}>
              No watchlists yet.
            </Txt>
          ) : null}
          <Pressable
            testID="watch-new-list"
            onPress={() =>
              m.create.mutate('My watchlist', {
                onSuccess: w =>
                  m.addItem.mutate(
                    {id: w.id, symbol},
                    {onSuccess: () => toast.success(`Added to ${w.name}`), onError: e => toast.error((e as Error).message)},
                  ),
                onError: e => toast.error((e as Error).message),
              })
            }
            style={({pressed}) => [styles.item, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
            <View style={styles.check} />
            <Txt variant="small" tone="muted">
              New watchlist with {symbol}
            </Txt>
          </Pressable>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  item: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderTopWidth: 1, paddingHorizontal: 4},
  check: {width: 18},
  none: {paddingVertical: 10},
});
