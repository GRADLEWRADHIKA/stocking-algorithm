import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeIn, FadeInDown, FadeOutUp} from 'react-native-reanimated';
import {ChevronLeft, ChevronRight} from 'lucide-react-native';
import type {Signal} from '../../api/types';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {usePalette} from '../../theme';
import {Txt} from '../Txt';
import {ChartFragment, IndicesFragment, ReadoutFragment, SignalFragment} from './Fragments';

export const HERO_CAPTIONS = [
  'Every signal lists the rules it checked, which ones held, and how its strength was scored.',
  'Candles, eleven indicators and a Supertrend trailing stop on every timeframe from 1 minute to 1 month.',
  'Five indices and 51 NSE stocks streamed from a local, seeded market simulator, labelled as such.',
  'Nine strategies read the same chart at once, each with a strength score that is never passed off as a probability.',
];
export const HERO_INTERVAL_MS = 4500;

/**
 * Web Hero, phone layout: "Signals that" / a live product fragment / "show their working." (right-aligned),
 * the fragment advancing every 4.5 s with its caption and a 4-step saffron indicator. Under reduce-motion
 * there is no auto-advance: arrows (or a tap on the fragment) step through instead.
 */
export function Hero({signal}: {signal: Signal | undefined}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [step, setStep] = useState(0);
  const symbol = signal?.symbol ?? 'INFY';
  const n = HERO_CAPTIONS.length;

  useEffect(() => {
    if (reduce) {
      return;
    }
    const t = setInterval(() => setStep(s => (s + 1) % n), HERO_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reduce, n]);

  const frames = [
    <SignalFragment key="signal" s={signal} />,
    <ChartFragment key="chart" symbol={symbol} />,
    <IndicesFragment key="indices" />,
    <ReadoutFragment key="readout" symbol={symbol} />,
  ];
  const go = (d: number) => setStep(s => (s + d + n) % n);

  return (
    <View testID="welcome-hero" style={styles.wrap}>
      <Txt style={styles.headline} weight="500" accessibilityRole="header" accessibilityLabel="Signals that show their working.">
        Signals that
      </Txt>
      <Pressable
        onPress={() => go(1)}
        accessibilityRole="button"
        accessibilityLabel={`Product preview ${step + 1} of ${n}. ${HERO_CAPTIONS[step]}`}
        accessibilityHint="Shows the next preview"
        style={styles.stage}>
        <Animated.View
          key={step}
          testID={`hero-frame-${step}`}
          entering={reduce ? undefined : FadeInDown.duration(350).withInitialValues({transform: [{translateY: 16}], opacity: 0})}
          exiting={reduce ? undefined : FadeOutUp.duration(200)}>
          {frames[step]}
        </Animated.View>
      </Pressable>
      <Txt style={styles.headline} weight="500" align="right" importantForAccessibility="no" accessibilityElementsHidden>
        show their working.
      </Txt>
      <Animated.View key={`c${step}`} entering={reduce ? undefined : FadeIn.duration(300)} style={styles.captionWrap}>
        <Txt variant="body" style={styles.caption} testID="hero-caption">
          {HERO_CAPTIONS[step]}
        </Txt>
      </Animated.View>
      <View style={styles.steps}>
        {reduce ? (
          <Pressable testID="hero-prev" onPress={() => go(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous preview">
            <ChevronLeft size={18} color={p.muted} />
          </Pressable>
        ) : null}
        {HERO_CAPTIONS.map((c, i) => (
          <Pressable
            key={c}
            testID={`hero-step-${i}`}
            onPress={() => setStep(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{selected: i === step}}
            accessibilityLabel={`Preview ${i + 1}`}>
            <View style={[styles.step, {backgroundColor: i === step ? p.accent : p.line}]} />
          </Pressable>
        ))}
        {reduce ? (
          <Pressable testID="hero-next" onPress={() => go(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next preview">
            <ChevronRight size={18} color={p.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {paddingHorizontal: 16, paddingTop: 24, paddingBottom: 48},
  headline: {fontSize: 34, lineHeight: 36, letterSpacing: -1},
  stage: {marginVertical: 20, minHeight: 250, justifyContent: 'center'},
  captionWrap: {marginTop: 24, minHeight: 66},
  caption: {fontSize: 16, lineHeight: 23},
  steps: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16},
  step: {width: 24, height: 2, borderRadius: 1},
});
