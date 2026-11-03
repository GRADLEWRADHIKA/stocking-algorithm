import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronLeft} from 'lucide-react-native';
import {spacing, usePalette} from '../theme';
import {Txt} from './Txt';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Show a back chevron (stack screens). */
  back?: boolean;
  right?: React.ReactNode;
  /** Rendered below the title row (badges, switchers). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  /** Wrap in a ScrollView (default). Pass false when the screen renders its own FlatList. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  testID?: string;
  footer?: React.ReactNode;
}

export function Screen({
  title,
  subtitle,
  back,
  right,
  headerExtra,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  keyboard,
  testID,
  footer,
}: ScreenProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();

  const header =
    title || back || right ? (
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {back ? (
            <Pressable
              testID="header-back"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={() => nav.goBack()}
              style={[styles.back, {backgroundColor: p.surface, borderColor: p.line}]}>
              <ChevronLeft size={18} color={p.ink} />
            </Pressable>
          ) : null}
          <View style={styles.titleWrap}>
            {title ? (
              <Txt variant={back ? 'h2' : 'h1'} numberOfLines={1} accessibilityRole="header">
                {title}
              </Txt>
            ) : null}
            {subtitle ? (
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {subtitle}
              </Txt>
            ) : null}
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
        {headerExtra}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 96}, contentStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={p.muted} colors={[p.accent]} progressBackgroundColor={p.surface} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  const inner = (
    <>
      {header}
      {body}
      {footer}
    </>
  );

  return (
    <View testID={testID} style={[styles.flex, {backgroundColor: p.ground, paddingTop: insets.top}]}>
      <StatusBar barStyle={p.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={p.ground} />
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </View>
  );
}

export function Section({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {title || right ? (
        <View style={styles.sectionHead}>
          {title ? (
            <Txt variant="title" accessibilityRole="header">
              {title}
            </Txt>
          ) : (
            <View />
          )}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40},
  back: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  titleWrap: {flex: 1},
  right: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  content: {paddingHorizontal: spacing.lg, gap: spacing.md},
  section: {gap: spacing.sm},
  sectionHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
});
