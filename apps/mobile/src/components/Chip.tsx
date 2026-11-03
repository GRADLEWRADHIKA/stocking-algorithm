import React from 'react';
import {ScrollView, StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {radius, spacing, usePalette} from '../theme';
import {PressableScale} from './PressableScale';
import {Txt} from './Txt';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  color?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Chip({label, selected, onPress, icon, color, testID, style}: ChipProps) {
  const p = usePalette();
  const fg = selected ? color ?? p.accent : p.textMuted;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{selected: !!selected}}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? p.accentMuted : p.surface,
          borderColor: selected ? color ?? p.accent : p.border,
        },
        style,
      ]}>
      {icon}
      <Txt variant="small" weight="600" color={fg}>
        {label}
      </Txt>
    </PressableScale>
  );
}

/** Horizontal, scrollable row of chips. */
export function ChipRow({children, style}: {children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  row: {gap: spacing.sm, paddingHorizontal: spacing.lg},
});
