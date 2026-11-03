import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {radius, usePalette} from '../theme';
import {PressableScale} from './PressableScale';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  padded?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

/** Web `.panel` without a head: surface, 1px line, 8px radius. Pressable cards get the press-scale. */
export function Card({children, style, onPress, onLongPress, padded = true, testID, accessibilityLabel}: CardProps) {
  const p = usePalette();
  const base: StyleProp<ViewStyle> = [styles.card, {backgroundColor: p.surface, borderColor: p.line}, padded && styles.padded, style];
  if (onPress || onLongPress) {
    return (
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        activeScale={0.98}
        style={base}>
        {children}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={base}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {borderRadius: radius.card, borderWidth: 1},
  padded: {padding: 16},
});
