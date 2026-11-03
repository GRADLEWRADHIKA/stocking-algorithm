import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, TextInput, View} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowUp, Bot} from 'lucide-react-native';
import {useAssistant} from '../api/hooks';
import type {AssistantResponse} from '../api/types';
import {Badge, Bullet, Logo, Screen, Txt} from '../components';
import {SimpleMarkdown} from '../components/SimpleMarkdown';
import {useReduceMotion} from '../hooks/useReduceMotion';
import type {RootScreenProps} from '../navigation/types';
import {fontFor, radius, usePalette} from '../theme';

interface Turn {
  id: number;
  q: string;
  a?: AssistantResponse;
  error?: string;
}

/** Same starters and thinking stages as the web assistant page. */
export const STARTERS = [
  'Why is RELIANCE showing a bullish trend?',
  'What does RSI indicate for TCS right now?',
  'Explain the MACD crossover on INFY',
  'Compare HDFCBANK and ICICIBANK',
  'Explain the latest BUY signal for SBIN',
  'What are the risks of the breakout strategy?',
  'What happened during my last backtest?',
  'Explain maximum drawdown',
  'What is the current market regime?',
  'Summarize the technical indicators for ITC',
];
export const STAGES = ['Reading the question', 'Finding symbols and timeframe', 'Loading local prices and indicators', 'Applying the rules'];

function Dot({k}: {k: number}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const o = useSharedValue(reduce ? 1 : 0.25);
  useEffect(() => {
    if (!reduce) {
      o.value = withDelay(k * 150, withRepeat(withSequence(withTiming(1, {duration: 450}), withTiming(0.25, {duration: 450})), -1));
    }
  }, [o, k, reduce]);
  const s = useAnimatedStyle(() => ({opacity: o.value}));
  return <Animated.View style={[styles.tDot, {backgroundColor: p.accent}, s]} />;
}

function Thinking() {
  const [i, setI] = useState(0);
  const reduce = useReduceMotion();
  useEffect(() => {
    const t = setInterval(() => setI(x => Math.min(x + 1, STAGES.length - 1)), 260);
    return () => clearInterval(t);
  }, []);
  return (
    <View testID="assistant-thinking" style={styles.thinking}>
      <View style={styles.dots}>
        {[0, 1, 2].map(k => (
          <Dot key={k} k={k} />
        ))}
      </View>
      <Animated.View key={i} entering={reduce ? undefined : FadeInDown.duration(160)} exiting={reduce ? undefined : FadeOutUp.duration(120)}>
        <Txt variant="caption" tone="muted">
          {STAGES[i]}…
        </Txt>
      </Animated.View>
    </View>
  );
}

function Block({i, children}: {i: number; children: React.ReactNode}) {
  const reduce = useReduceMotion();
  return <Animated.View entering={reduce ? undefined : FadeInDown.delay(i * 80).duration(320)}>{children}</Animated.View>;
}

function Answer({a, onAsk}: {a: AssistantResponse; onAsk: (q: string) => void}) {
  const p = usePalette();
  let b = 0;
  return (
    <View testID="assistant-answer" style={styles.answer}>
      <Block i={b++}>
        <View style={styles.badges}>
          <Badge label={a.intent.replace(/_/g, ' ')} tone="info" />
          {a.entities.symbols.map(s => (
            <Badge key={s} label={s} />
          ))}
          {a.entities.timeframe ? <Badge label={a.entities.timeframe} /> : null}
          {a.entities.indicator ? <Badge label={a.entities.indicator} /> : null}
        </View>
      </Block>
      <Block i={b++}>
        <SimpleMarkdown source={a.answer} />
      </Block>
      {a.observations.length > 0 || a.interpretations.length > 0 ? (
        <Block i={b++}>
          <View style={styles.cols}>
            {a.observations.length > 0 ? (
              <View style={[styles.box, {borderColor: p.line}]}>
                <Txt variant="caption" weight="500" style={styles.boxTitle}>
                  Observed in the data
                </Txt>
                {a.observations.map(o => (
                  <Bullet key={o} strong>
                    {o}
                  </Bullet>
                ))}
              </View>
            ) : null}
            {a.interpretations.length > 0 ? (
              <View style={[styles.box, {borderColor: p.line}]}>
                <Txt variant="caption" weight="500" style={styles.boxTitle}>
                  How it is usually interpreted
                </Txt>
                {a.interpretations.map(o => (
                  <Bullet key={o}>{o}</Bullet>
                ))}
              </View>
            ) : null}
          </View>
        </Block>
      ) : null}
      {a.data.length > 0 ? (
        <Block i={b++}>
          <View testID="assistant-data">
            {a.data.map(d => (
              <View key={d.label} style={[styles.dataRow, {borderTopColor: p.rule}]}>
                <Txt variant="caption" tone="muted" style={styles.flex}>
                  {d.label}
                </Txt>
                <Txt variant="caption" num align="right">
                  {d.value}
                </Txt>
              </View>
            ))}
          </View>
        </Block>
      ) : null}
      {a.disclaimers.length > 0 ? (
        <Block i={b++}>
          {a.disclaimers.map(d => (
            <Txt key={d} variant="micro" tone="faint" style={styles.discl}>
              {d}
            </Txt>
          ))}
        </Block>
      ) : null}
      {a.suggestions.length > 0 ? (
        <Block i={b++}>
          <View style={styles.chips}>
            {a.suggestions.map(s => (
              <Pressable
                key={s}
                accessibilityRole="button"
                onPress={() => onAsk(s)}
                style={({pressed}) => [styles.chip, {borderColor: pressed ? p.faint : p.line}]}>
                <Txt variant="caption" tone="muted">
                  {s}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Block>
      ) : null}
    </View>
  );
}

export function AssistantScreen({route}: RootScreenProps<'Assistant'>) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const symbol = route.params?.symbol;
  const ask = useAssistant();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const scroll = useRef<ScrollView>(null);
  const started = useRef(false);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) {
      return;
    }
    const id = Date.now();
    setTurns(t => [...t, {id, q: question}]);
    setInput('');
    ask.mutate(
      {question, context: symbol ? {symbol} : undefined},
      {
        onSuccess: a => setTurns(t => t.map(x => (x.id === id ? {...x, a} : x))),
        onError: e => setTurns(t => t.map(x => (x.id === id ? {...x, error: (e as Error).message} : x))),
      },
    );
  };

  useEffect(() => {
    const q = route.params?.question;
    if (q && !started.current) {
      started.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({animated: !reduce}), 60);
    return () => clearTimeout(t);
  }, [turns, reduce]);

  const composer = (
    <View style={[styles.composer, {backgroundColor: p.surface, borderColor: p.line, marginBottom: Math.max(insets.bottom, 12)}]}>
      <TextInput
        testID="assistant-input"
        value={input}
        onChangeText={setInput}
        placeholder="e.g. Compare TCS and INFY on momentum"
        placeholderTextColor={p.faint}
        selectionColor={p.accent}
        accessibilityLabel="Ask the assistant"
        multiline
        onSubmitEditing={() => send(input)}
        blurOnSubmit
        style={[styles.input, {color: p.ink}, fontFor('400')]}
      />
      <Pressable
        testID="assistant-send"
        accessibilityRole="button"
        accessibilityLabel="Send"
        disabled={!input.trim() || ask.isPending}
        onPress={() => send(input)}
        style={[styles.send, {backgroundColor: p.ink, opacity: !input.trim() || ask.isPending ? 0.5 : 1}]}>
        <ArrowUp size={16} color={p.ground} />
      </Pressable>
    </View>
  );

  return (
    <Screen back title="AI assistant" testID="assistant-screen" scroll={false} keyboard footer={composer}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.sub}>
          <Txt variant="small" tone="muted">
            Answers are computed from local prices, indicators, signals and your backtests. No internet, no external model.
          </Txt>
          <View style={styles.badges}>
            <Badge label="rule-based-v1" tone="info" />
            {symbol ? <Badge label={`Context: ${symbol}`} /> : null}
          </View>
        </View>
        {turns.length === 0 ? (
          <Animated.View entering={reduce ? undefined : FadeInDown.duration(380)} style={[styles.intro, {backgroundColor: p.surface, borderColor: p.line}]}>
            <View style={styles.introHead}>
              <Logo size={28} />
              <View style={styles.flex}>
                <Txt weight="600" style={styles.introTitle}>
                  Ask about a stock, an indicator, a signal or a backtest
                </Txt>
                <Txt variant="caption" tone="muted">
                  It names the data it used and separates what it observed from how that is usually read.
                </Txt>
              </View>
            </View>
            <View style={styles.starters}>
              {STARTERS.map((s, i) => (
                <Animated.View key={s} entering={reduce ? undefined : FadeInDown.delay(100 + i * 30).duration(260)}>
                  <Pressable
                    testID={`starter-${i}`}
                    accessibilityRole="button"
                    onPress={() => send(s)}
                    style={({pressed}) => [styles.starter, {borderColor: pressed ? p.faint : p.line}]}>
                    <Txt variant="small" tone="muted">
                      {s}
                    </Txt>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ) : null}
        {turns.map(t => (
          <View key={t.id} style={styles.turn}>
            <Animated.View entering={reduce ? undefined : FadeInRight.duration(240)} style={[styles.q, {backgroundColor: p.raised}]}>
              <Txt variant="small">{t.q}</Txt>
            </Animated.View>
            <Animated.View entering={reduce ? undefined : FadeIn.duration(240)} style={styles.aRow}>
              <View style={[styles.bot, {backgroundColor: p.surface, borderColor: p.line}]}>
                <Bot size={14} color={p.accent} />
              </View>
              <View style={styles.flex}>
                {t.a ? (
                  <Answer a={t.a} onAsk={send} />
                ) : t.error ? (
                  <Txt variant="small" tone="down">
                    {t.error}
                  </Txt>
                ) : (
                  <Thinking />
                )}
              </View>
            </Animated.View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  content: {paddingHorizontal: 16, paddingBottom: 16, gap: 20},
  sub: {gap: 8},
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  intro: {borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 16},
  introHead: {flexDirection: 'row', gap: 12, alignItems: 'center'},
  introTitle: {fontSize: 15, lineHeight: 20},
  starters: {gap: 8},
  starter: {borderWidth: 1, borderRadius: radius.ctl, paddingHorizontal: 12, paddingVertical: 10},
  turn: {gap: 12},
  q: {alignSelf: 'flex-end', maxWidth: '85%', borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 10},
  aRow: {flexDirection: 'row', gap: 12},
  bot: {width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  answer: {gap: 14, paddingTop: 4},
  cols: {gap: 10},
  box: {borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 6},
  boxTitle: {marginBottom: 2},
  dataRow: {flexDirection: 'row', gap: 12, borderTopWidth: 1, paddingVertical: 6},
  discl: {marginTop: 2},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6},
  thinking: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6},
  dots: {flexDirection: 'row', gap: 4},
  tDot: {width: 6, height: 6, borderRadius: 3},
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 8,
  },
  input: {flex: 1, maxHeight: 120, minHeight: 36, fontSize: 13, paddingHorizontal: 8, paddingVertical: 8},
  send: {width: 36, height: 36, borderRadius: radius.ctl, alignItems: 'center', justifyContent: 'center'},
});
