import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {spacing, usePalette} from '../theme';
import {Txt} from './Txt';

export interface KV {
  label: string;
  value: string;
  color?: string;
}

/** Two-column metrics grid (fundamentals, backtest metrics, stats). */
export function KeyValueGrid({items, columns = 2, style}: {items: KV[]; columns?: number; style?: StyleProp<ViewStyle>}) {
  const p = usePalette();
  return (
    <View style={[styles.grid, style]}>
      {items.map(it => (
        <View
          key={it.label}
          style={[styles.cell, {width: `${100 / columns}%`, borderBottomColor: p.border}]}>
          <Txt variant="caption" tone="muted" numberOfLines={1}>
            {it.label}
          </Txt>
          <Txt variant="h3" num color={it.color} numberOfLines={1}>
            {it.value}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export function StatTile({label, value, color, style}: KV & {style?: StyleProp<ViewStyle>}) {
  const p = usePalette();
  return (
    <View style={[styles.tile, {backgroundColor: p.surfaceAlt, borderColor: p.border}, style]}>
      <Txt variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Txt>
      <Txt variant="h3" num color={color} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

export function Divider({style}: {style?: StyleProp<ViewStyle>}) {
  const p = usePalette();
  return <View style={[{height: StyleSheet.hairlineWidth * 2, backgroundColor: p.border}, style]} />;
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {paddingVertical: spacing.sm, paddingRight: spacing.sm, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth},
  tile: {flex: 1, padding: spacing.md, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth * 2, gap: 4},
});
