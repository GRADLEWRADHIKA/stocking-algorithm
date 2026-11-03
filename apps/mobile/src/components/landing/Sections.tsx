import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {ArrowUpRight} from 'lucide-react-native';
import type {Signal} from '../../api/types';
import {changeColor, fontFor, radius, usePalette} from '../../theme';
import {pct} from '../../utils/fmt';
import {istClock} from '../../utils/landing';
import {PressableScale} from '../PressableScale';
import {ConditionList} from '../SignalCard';
import {Skeleton} from '../Skeleton';
import {Txt} from '../Txt';
import {IndicesFragment} from './Fragments';
import {useLandingAnalysis, useLandingStatus} from './data';
import {RiseOnView} from './RiseOnView';
import {ServerAddressLink} from '../ServerAddress';

/* ------------------------------------------------------------------ how it works: run-in column */
export function HowItWorks({
  signal,
  onPaper,
}: {
  signal: Signal | undefined;
  onPaper: () => void;
}) {
  const p = usePalette();
  const a = useLandingAnalysis(signal?.symbol ?? 'INFY').data;
  const chips: [string, string | null | undefined][] = a
    ? [
        ['RSI 14', a.momentum.rsi?.toFixed(1)],
        ['ADX 14', a.trend.adx?.toFixed(1)],
        [
          'ATR % of price',
          a.volatility.atr_pct === null
            ? null
            : `${a.volatility.atr_pct.toFixed(2)}%`,
        ],
        ['Volume vs 20-day', `${a.volume.ratio.toFixed(2)}×`],
      ]
    : [];
  const hp = signal?.historical_performance;
  const frame = [
    styles.frame,
    {backgroundColor: p.surface, borderColor: p.line},
  ];
  const stages: {lead: string; body: string; evidence: React.ReactNode}[] = [
    {
      lead: 'To begin,',
      body: 'prices come from a deterministic market simulator or from CSV files you import. Every file is checked for gaps, duplicates and impossible bars, and every price on screen carries a label saying where it came from.',
      evidence: <IndicesFragment limit={2} />,
    },
    {
      lead: 'Next,',
      body: 'eleven indicators are computed with standard definitions and strictly in time order: the value on a bar never sees the bars that came after it.',
      evidence: a ? (
        <View style={[frame, styles.chips]}>
          {chips.map(([k, v], i) => (
            <View
              key={k}
              style={[
                styles.chip,
                i % 2 === 1 && {borderLeftWidth: 1, borderLeftColor: p.rule},
                i > 1 && {borderTopWidth: 1, borderTopColor: p.rule},
              ]}>
              <Txt variant="caption" tone="muted">
                {k}
              </Txt>
              <Txt num style={styles.chipVal}>
                {v ?? '—'}
              </Txt>
            </View>
          ))}
        </View>
      ) : (
        <Skeleton height={110} rounded={radius.card} />
      ),
    },
    {
      lead: 'Then,',
      body: 'nine strategies test their rules on the latest bar. A signal is only BUY or SELL when its required conditions hold, and it writes down each one, met or not.',
      evidence: signal ? (
        <View style={[frame, styles.pad]}>
          <ConditionList conditions={signal.conditions.slice(0, 3)} />
        </View>
      ) : (
        <Skeleton height={112} rounded={radius.card} />
      ),
    },
    {
      lead: 'Before any order,',
      body: 'the backtester replays history with brokerage, charges, slippage and next-bar fills, and keeps the last part of the period aside as an out-of-sample test.',
      evidence: (
        <View style={[frame, styles.pad, styles.wrapRow]}>
          <Txt variant="small" tone="muted" style={styles.full}>
            {signal
              ? `${signal.strategy} on ${signal.symbol}`
              : 'Same rules, stored history'}
          </Txt>
          <Txt variant="small">
            Trades{' '}
            <Txt variant="small" num>
              {String(hp?.trades ?? '—')}
            </Txt>
          </Txt>
          <Txt variant="small">
            Win rate{' '}
            <Txt variant="small" num>
              {hp?.win_rate === null || hp?.win_rate === undefined
                ? '—'
                : pct(hp.win_rate, 0, false)}
            </Txt>
          </Txt>
          <Txt variant="small">
            Avg trade{' '}
            <Txt variant="small" num color={changeColor(p, hp?.avg_return_pct)}>
              {pct(hp?.avg_return_pct)}
            </Txt>
          </Txt>
        </View>
      ),
    },
    {
      lead: 'Finally,',
      body: 'ideas meet the market in a paper account: market and limit orders, attached stop-loss and targets, positions and a full ledger, with virtual money only.',
      evidence: (
        <View style={[frame, styles.paper]}>
          <View style={[styles.toggle, {backgroundColor: p.raised}]}>
            <View style={[styles.toggleOn, {backgroundColor: p.up}]}>
              <Txt variant="small" weight="600" color={p.onFill}>
                Buy
              </Txt>
            </View>
            <View style={styles.toggleOff}>
              <Txt variant="small" weight="600" tone="muted">
                Sell
              </Txt>
            </View>
          </View>
          <PressableScale
            onPress={onPaper}
            accessibilityRole="button"
            style={[styles.inkBtn, {backgroundColor: p.ink}]}>
            <Txt variant="small" weight="500" color={p.ground}>
              Open paper account
            </Txt>
          </PressableScale>
        </View>
      ),
    },
  ];
  return (
    <>
      {stages.map(s => (
        <RiseOnView key={s.lead} style={styles.stage}>
          <Txt style={styles.runIn} tone="muted">
            <Txt style={styles.runIn} weight="600">
              {s.lead}
            </Txt>{' '}
            {s.body}
          </Txt>
          <View style={styles.evidence}>{s.evidence}</View>
        </RiseOnView>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ proof */
export const NEEDS: [string, string][] = [
  ['API keys', 'None. No data vendor, no LLM provider, no broker credentials.'],
  [
    'Internet',
    'Not at runtime. Prices come from the local simulator or files you import.',
  ],
  [
    'Real money',
    'Never. Orders fill against simulated prices in virtual accounts.',
  ],
];
export const STACK = [
  'Python',
  'FastAPI',
  'PostgreSQL',
  'pandas',
  'scikit-learn',
  'Next.js',
  'React Native',
];

export function StackBand() {
  const p = usePalette();
  return (
    <View
      testID="welcome-stack"
      style={[styles.band, {backgroundColor: p.surface}]}>
      <Txt style={styles.bandTitle} weight="500" accessibilityRole="header">
        Everything runs on your machine
      </Txt>
      <View style={styles.needs}>
        {NEEDS.map(([k, v]) => (
          <View key={k} style={styles.need}>
            <Txt style={styles.lg} weight="500">
              {k}
            </Txt>
            <Txt style={styles.lg} tone="muted">
              {v}
            </Txt>
          </View>
        ))}
      </View>
      <Txt style={[styles.lg, styles.mt40]}>Built on open source</Txt>
      <View style={styles.stackGrid}>
        {STACK.map(x => (
          <Txt key={x} weight="500" style={styles.stackItem}>
            {x}
          </Txt>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ cta: a sentence with a blank */
export function Cta({
  onSubmit,
  onDemo,
}: {
  onSubmit: (raw: string) => void;
  onDemo: () => void;
}) {
  const p = usePalette();
  const [sym, setSym] = useState('');
  return (
    <View testID="welcome-cta" style={styles.cta}>
      <View style={styles.ctaLine}>
        <Txt style={styles.ctaText} weight="500" accessibilityRole="header">
          Backtest
        </Txt>
        <TextInput
          testID="cta-symbol"
          value={sym}
          onChangeText={setSym}
          placeholder="RELIANCE"
          placeholderTextColor={p.faint}
          maxLength={20}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Stock symbol"
          selectionColor={p.accent}
          onSubmitEditing={() => onSubmit(sym)}
          style={[
            styles.ctaInput,
            fontFor('500'),
            {backgroundColor: p.raised, color: p.ink},
          ]}
        />
        <PressableScale
          testID="cta-today"
          onPress={() => onSubmit(sym)}
          accessibilityRole="button"
          accessibilityLabel="Backtest today"
          style={[styles.ctaBtn, {backgroundColor: p.accent}]}>
          <Txt style={styles.ctaText} weight="500" color={p.ground}>
            today
          </Txt>
        </PressableScale>
      </View>
      <Txt tone="muted" style={styles.mt24}>
        You log in with the demo trader, the backtester opens on that stock, and
        every result is net of costs.
      </Txt>
      <Pressable
        onPress={onDemo}
        hitSlop={8}
        accessibilityRole="link"
        style={styles.mt12}>
        <Txt>Or try the engine first ↑</Txt>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ footer of tiles */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Txt num style={styles.clock} testID="ist-clock">
      {istClock(now)}
    </Txt>
  );
}

export function Footer({
  onOpen,
  onRegister,
}: {
  onOpen: () => void;
  onRegister: () => void;
}) {
  const p = usePalette();
  const status = useLandingStatus();
  const s = status.data;
  const tile = [styles.tile, {backgroundColor: p.surface}];
  return (
    <View testID="welcome-footer" style={styles.footer}>
      <View style={[styles.wordTile, {backgroundColor: p.ink}]}>
        <Txt weight="600" color={p.ground} style={styles.word}>
          QuantDesk
        </Txt>
      </View>
      <PressableScale
        testID="open-terminal"
        onPress={onOpen}
        accessibilityRole="button"
        activeScale={0.98}
        style={[styles.openTile, {backgroundColor: p.accent}]}>
        <Txt weight="500" color={p.ground} style={styles.openText}>
          Open the terminal
        </Txt>
        <ArrowUpRight
          size={52}
          strokeWidth={2.5}
          color={p.ground}
          style={styles.end}
        />
      </PressableScale>
      <View style={styles.tileRow}>
        <View style={[tile, styles.half]}>
          <Txt>Mumbai</Txt>
          <View>
            <Clock />
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.dot,
                  {backgroundColor: s?.session === 'OPEN' ? p.up : p.faint},
                ]}
              />
              <Txt variant="small" tone="muted" testID="session-status">
                {s
                  ? s.session === 'OPEN'
                    ? 'Simulated session open'
                    : 'Simulated session closed'
                  : 'Server offline'}
              </Txt>
            </View>
          </View>
        </View>
        <View style={[tile, styles.half]}>
          <Txt tone="muted">Accounts</Txt>
          <View style={styles.gap8}>
            <Pressable onPress={onOpen} accessibilityRole="link" hitSlop={6}>
              <Txt>Log in</Txt>
            </Pressable>
            <Pressable
              onPress={onRegister}
              accessibilityRole="link"
              hitSlop={6}>
              <Txt>Create an account</Txt>
            </Pressable>
          </View>
        </View>
      </View>
      <View style={tile}>
        <Txt tone="muted">Server</Txt>
        <ServerAddressLink />
      </View>
      <View style={tile}>
        <Txt style={styles.statement}>
          A research desk for Indian equities that you run yourself.
        </Txt>
        <Txt variant="small" tone="muted" style={styles.mt24}>
          Prices are simulated or imported, never live NSE/BSE quotes. Paper
          trading only. Nothing here is investment advice.
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {width: '100%'},
  end: {alignSelf: 'flex-end'},
  gap8: {gap: 8},
  mt12: {marginTop: 12},
  mt24: {marginTop: 24},
  mt40: {marginTop: 40},
  frame: {borderWidth: 1, borderRadius: radius.card, overflow: 'hidden'},
  pad: {padding: 16},
  stage: {marginBottom: 72, marginHorizontal: 16},
  runIn: {fontSize: 17, lineHeight: 27},
  evidence: {marginTop: 20},
  chips: {flexDirection: 'row', flexWrap: 'wrap'},
  chip: {width: '50%', paddingHorizontal: 16, paddingVertical: 12},
  chipVal: {fontSize: 15, marginTop: 4},
  wrapRow: {flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6},
  paper: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12},
  toggle: {flex: 1, flexDirection: 'row', borderRadius: radius.ctl, padding: 2},
  toggleOn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 5,
  },
  toggleOff: {flex: 1, alignItems: 'center', paddingVertical: 6},
  inkBtn: {borderRadius: radius.ctl, paddingHorizontal: 14, paddingVertical: 9},
  band: {paddingHorizontal: 16, paddingVertical: 72},
  bandTitle: {fontSize: 30, lineHeight: 33, letterSpacing: -0.9},
  needs: {marginTop: 40, gap: 24},
  need: {gap: 4},
  lg: {fontSize: 18, lineHeight: 26},
  stackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 24,
    rowGap: 20,
  },
  stackItem: {width: '50%', fontSize: 24, lineHeight: 30, letterSpacing: -0.36},
  cta: {paddingHorizontal: 16, paddingVertical: 120},
  ctaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: {fontSize: 34, lineHeight: 40, letterSpacing: -1.2},
  ctaInput: {
    fontSize: 30,
    height: 44,
    minWidth: 170,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: radius.ctl,
  },
  ctaBtn: {
    borderRadius: radius.ctl,
    paddingHorizontal: 10,
    height: 44,
    justifyContent: 'center',
  },
  footer: {padding: 8, gap: 6},
  tile: {borderRadius: radius.card, padding: 20},
  tileRow: {flexDirection: 'row', gap: 6},
  half: {flex: 1, minHeight: 150, justifyContent: 'space-between'},
  wordTile: {
    borderRadius: radius.card,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  word: {fontSize: 54, lineHeight: 60, letterSpacing: -2.7},
  openTile: {
    borderRadius: radius.card,
    minHeight: 190,
    padding: 24,
    justifyContent: 'space-between',
  },
  openText: {fontSize: 28, lineHeight: 34},
  clock: {fontSize: 24, lineHeight: 30},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4},
  dot: {width: 6, height: 6, borderRadius: 3},
  statement: {fontSize: 22, lineHeight: 30},
});
