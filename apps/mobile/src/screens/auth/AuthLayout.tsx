import React from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {Easing, FadeInDown} from 'react-native-reanimated';
import {Screen, Txt, Wordmark} from '../../components';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {usePalette} from '../../theme';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Web (auth)/layout.tsx at phone width: wordmark above the form, the honesty note beneath it. */
export function AuthLayout({
  title,
  subtitle,
  back,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const enter = (d: number) => (reduce ? undefined : FadeInDown.delay(d).duration(400).easing(EASE));
  return (
    <Screen back={back} keyboard testID={testID} contentStyle={styles.content}>
      <Animated.View entering={enter(0)} style={styles.brand}>
        <Wordmark size={26} />
      </Animated.View>
      <Animated.View entering={enter(60)} style={styles.head}>
        <Txt style={styles.title} weight="600" accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="small" tone="muted">
            {subtitle}
          </Txt>
        ) : null}
      </Animated.View>
      <Animated.View entering={enter(120)} style={styles.form}>
        {children}
      </Animated.View>
      <View style={[styles.footer, {borderTopColor: p.rule}]}>
        <Txt variant="caption" tone="faint" style={styles.footText}>
          Runs entirely on your machine. Prices are simulated or from imported historical datasets and are never real-time NSE/BSE quotes. Paper
          trading only — no real money moves. Nothing here is investment advice.
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingTop: 16, gap: 24},
  brand: {flexDirection: 'row'},
  head: {gap: 4},
  title: {fontSize: 24, lineHeight: 30, letterSpacing: -0.4},
  form: {gap: 14},
  footer: {borderTopWidth: 1, paddingTop: 16},
  footText: {lineHeight: 17},
});
