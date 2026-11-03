import React from 'react';
import {StyleSheet, View} from 'react-native';
import {spacing, usePalette} from '../theme';
import {PressableScale} from './PressableScale';
import {ChangeText, PriceText} from './PriceText';
import {Sparkline} from './charts/Sparkline';
import {Txt} from './Txt';

export interface QuoteRowProps {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  change?: number;
  sparkline?: number[];
  meta?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: React.ReactNode;
  flash?: boolean;
  testID?: string;
}

/** Standard instrument row: symbol/name · sparkline · live price + change. */
export function QuoteRow({
  symbol,
  name,
  price,
  changePct,
  change,
  sparkline,
  meta,
  onPress,
  onLongPress,
  right,
  flash = true,
  testID,
}: QuoteRowProps) {
  const p = usePalette();
  return (
    <PressableScale
      testID={testID ?? `quote-${symbol}`}
      accessibilityRole="button"
      accessibilityLabel={`${symbol} ${name ?? ''}`}
      onPress={onPress}
      onLongPress={onLongPress}
      activeScale={0.985}
      style={[styles.row, {borderBottomColor: p.border}]}>
      <View style={styles.left}>
        <Txt variant="h3" numberOfLines={1}>
          {symbol}
        </Txt>
        <Txt variant="small" tone="muted" numberOfLines={1}>
          {meta ?? name ?? ''}
        </Txt>
      </View>
      {sparkline && sparkline.length > 1 ? (
        <View style={styles.spark}>
          <Sparkline data={sparkline} width={64} height={26} />
        </View>
      ) : null}
      <View style={styles.right}>
        <PriceText value={price} flash={flash} variant="h3" />
        <ChangeText change={change ?? null} changePct={changePct} variant="small" />
      </View>
      {right}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  left: {flex: 1, gap: 2},
  spark: {width: 64},
  right: {alignItems: 'flex-end', gap: 2, minWidth: 104},
});
