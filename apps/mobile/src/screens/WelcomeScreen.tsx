import React, {useRef, useState} from 'react';
import {Pressable, ScrollView, StatusBar, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {FadeInUp} from 'react-native-reanimated';
import {ArrowRight} from 'lucide-react-native';
import {Button, PressableScale, Txt, Wordmark} from '../components';
import {useDemoSignal, useLatestSignals} from '../components/landing/data';
import {Hero} from '../components/landing/Hero';
import {LiveDemo} from '../components/landing/LiveDemo';
import {RiseOnView, ViewportContext} from '../components/landing/RiseOnView';
import {Cta, Footer, HowItWorks, StackBand} from '../components/landing/Sections';
import {useReduceMotion} from '../hooks/useReduceMotion';
import type {RootScreenProps} from '../navigation/types';
import type {PostLoginTarget} from '../store/postLogin';
import {radius, usePalette} from '../theme';
import {ctaSymbol, heroSignal} from '../utils/landing';

/**
 * Welcome — the phone version of the web landing page (apps/web/src/app/page.tsx), shown before Login
 * when logged out. Same sections, order and copy; the web's "Same desk in your pocket" section is skipped
 * because this is that app. Only public endpoints are used.
 */
export function WelcomeScreen({navigation}: RootScreenProps<'Welcome'>) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const [demoY, setDemoY] = useState(0);
  const [bottom, setBottom] = useState(800);

  // the hero shows the most recent actionable signal from the last scan; Supertrend on INFY if there is none
  const latest = useLatestSignals().data;
  const fallback = useDemoSignal({symbol: 'INFY', strategy_key: 'supertrend', timeframe: '1d', params: {}}).data;
  const signal = heroSignal(latest, fallback);

  const login = (next?: PostLoginTarget) => navigation.navigate('Login', next ? {next} : undefined);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const b = e.nativeEvent.contentOffset.y + e.nativeEvent.layoutMeasurement.height;
    if (b > bottom + 40) {
      setBottom(b);
    }
  };

  return (
    <View testID="welcome-screen" style={[styles.flex, {backgroundColor: p.ground, paddingTop: insets.top}]}>
      <StatusBar barStyle={p.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={p.ground} />
      <Animated.View entering={reduce ? undefined : FadeInUp.duration(400)} style={[styles.nav, {backgroundColor: p.ground}]}>
        <Wordmark size={24} />
        <PressableScale testID="welcome-login" onPress={() => login()} accessibilityRole="button" style={[styles.navBtn, {backgroundColor: p.accent}]}>
          <Txt weight="500" color={p.ground} style={styles.navBtnText}>
            Log in
          </Txt>
        </PressableScale>
      </Animated.View>
      <ViewportContext.Provider value={bottom}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={64}
          onScroll={onScroll}
          onLayout={(e: LayoutChangeEvent) => {
            setBottom(b => Math.max(b, e.nativeEvent.layout.height));
          }}
          contentContainerStyle={{paddingBottom: insets.bottom + 8}}>
          {/* 1. Hero */}
          <Hero signal={signal} />
          <View style={styles.heroActions}>
            <Button testID="welcome-register" title="Create an account" variant="secondary" onPress={() => navigation.navigate('Register')} style={styles.flex} />
            <Button title="Log in" variant="primary" onPress={() => login()} style={styles.flex} />
          </View>

          {/* 2. Try the engine */}
          <View onLayout={(e: LayoutChangeEvent) => setDemoY(e.nativeEvent.layout.y)} style={styles.sectionTop} />
          <RiseOnView style={styles.px}>
            <Txt style={styles.h2} weight="500" accessibilityRole="header">
              Try the engine
            </Txt>
            <Txt tone="muted" style={styles.lead}>
              This panel is the real quant engine running on the local server. Pick a stock and a strategy, move a parameter, and the latest bar is
              evaluated again.
            </Txt>
          </RiseOnView>
          <RiseOnView delay={100} style={[styles.px, styles.mt32]}>
            <LiveDemo />
            <Txt variant="small" tone="muted" style={styles.mt16}>
              Move any slider. Every figure on the panel is computed by the engine; nothing is pre-written.
            </Txt>
            <Pressable onPress={() => login({route: 'StrategyBuilder'})} accessibilityRole="link" style={styles.link} hitSlop={8}>
              <Txt variant="small" tone="muted">
                Build your own rules in the strategy builder
              </Txt>
              <ArrowRight size={14} color={p.muted} />
            </Pressable>
          </RiseOnView>

          {/* 3. From a price to a decision */}
          <RiseOnView style={[styles.px, styles.howTitle]}>
            <Txt style={styles.h2how} weight="500" accessibilityRole="header">
              From a price to a decision
            </Txt>
          </RiseOnView>
          <HowItWorks signal={signal} onPaper={() => login({route: 'PaperTrading'})} />

          {/* 4. Everything runs on your machine */}
          <RiseOnView>
            <StackBand />
          </RiseOnView>

          {/* 5. Closing sentence with a blank */}
          <RiseOnView>
            <Cta
              onSubmit={raw => login({route: 'Backtesting', symbol: ctaSymbol(raw)})}
              onDemo={() => scroll.current?.scrollTo({y: Math.max(0, demoY - 8), animated: !reduce})}
            />
          </RiseOnView>

          {/* 6. Footer tiles */}
          <Footer onOpen={() => login()} onRegister={() => navigation.navigate('Register')} />
        </ScrollView>
      </ViewportContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  nav: {height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16},
  navBtn: {borderRadius: radius.ctl, paddingHorizontal: 16, paddingVertical: 8},
  navBtnText: {fontSize: 15},
  heroActions: {flexDirection: 'row', gap: 8, paddingHorizontal: 16},
  sectionTop: {height: 96},
  px: {paddingHorizontal: 16},
  h2: {fontSize: 30, lineHeight: 36, letterSpacing: -0.75},
  h2how: {fontSize: 28, lineHeight: 34, letterSpacing: -0.56},
  lead: {fontSize: 16, lineHeight: 24, marginTop: 8},
  mt16: {marginTop: 16},
  mt32: {marginTop: 32},
  link: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'flex-start'},
  howTitle: {marginTop: 120, marginBottom: 48},
});
