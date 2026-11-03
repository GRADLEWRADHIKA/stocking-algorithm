import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {FadeIn, SlideInDown} from 'react-native-reanimated';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {radius, usePalette} from '../theme';
import {Txt} from './Txt';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  testID?: string;
  /** Wrap children in a ScrollView (long pickers / forms). */
  scroll?: boolean;
}

/** Bottom sheet (the phone version of the web Dialog / Popover). */
export function Sheet({visible, onClose, title, description, children, testID, scroll}: SheetProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <View style={styles.root} testID={testID}>
          <Animated.View entering={reduce ? undefined : FadeIn.duration(180)} style={[StyleSheet.absoluteFill, {backgroundColor: p.overlay}]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View
            entering={reduce ? undefined : SlideInDown.duration(320)}
            style={[styles.sheet, {backgroundColor: p.surface, borderColor: p.line, paddingBottom: insets.bottom + 16}]}>
            <View style={[styles.grabber, {backgroundColor: p.line}]} />
            {title ? (
              <View style={styles.head}>
                <Txt variant="h3" accessibilityRole="header">
                  {title}
                </Txt>
                {description ? (
                  <Txt variant="caption" tone="muted">
                    {description}
                  </Txt>
                ) : null}
              </View>
            ) : null}
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'flex-end'},
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    maxHeight: '90%',
  },
  grabber: {alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 4},
  head: {gap: 2},
  scroll: {gap: 12, paddingBottom: 8},
});
