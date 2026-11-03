import React from 'react';
import {ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {alpha, radius, usePalette} from '../theme';
import {PressableScale} from './PressableScale';
import {Txt} from './Txt';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'buy' | 'sell';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  /** Web parity: primary = ink fill, secondary = raised + line, ghost = muted text, buy/sell = emerald/red. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  full?: boolean;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'secondary',
  size = 'md',
  loading,
  disabled,
  icon,
  style,
  testID,
  full,
  accessibilityLabel,
}: ButtonProps) {
  const p = usePalette();
  const map: Record<ButtonVariant, {bg: string; fg: string; border: string}> = {
    primary: {bg: p.ink, fg: p.ground, border: p.ink},
    secondary: {bg: p.raised, fg: p.ink, border: p.line},
    ghost: {bg: 'transparent', fg: p.muted, border: 'transparent'},
    danger: {bg: 'transparent', fg: p.down, border: alpha(p.down, 0.4)},
    buy: {bg: p.up, fg: p.onFill, border: p.up},
    sell: {bg: p.down, fg: p.onFill, border: p.down},
  };
  const c = map[variant];
  // web sm h-7 / md h-9 / lg h-10, bumped for touch targets
  const height = size === 'sm' ? 32 : size === 'lg' ? 46 : 40;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{disabled: !!(disabled || loading), busy: !!loading}}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        {backgroundColor: c.bg, borderColor: c.border, height, paddingHorizontal: size === 'sm' ? 10 : size === 'lg' ? 20 : 14},
        full && styles.full,
        style,
      ]}>
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={c.fg} size="small" /> : icon}
        <Txt variant={size === 'sm' ? 'caption' : size === 'lg' ? 'body' : 'small'} weight="500" color={c.fg} numberOfLines={1}>
          {title}
        </Txt>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.ctl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {alignSelf: 'stretch'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 6},
});
