import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeIn} from 'react-native-reanimated';
import {Bot, FlaskConical, ShoppingCart} from 'lucide-react-native';
import {useAnalysis, useAssistant, useCandles, useStockDetail} from '../api/hooks';
import type {StockAnalysis, StockDetail, Timeframe} from '../api/types';
import {Badge, SourceBadge} from '../components/Badge';
import {Button} from '../components/Button';
import {Panel, KV, Bullet} from '../components/Panel';
import {FlashPrice} from '../components/PriceText';
import {Screen} from '../components/Screen';
import {SignalCard, StrengthMeter} from '../components/SignalCard';
import {SimpleMarkdown} from '../components/SimpleMarkdown';
import {Skeleton, SkeletonRows} from '../components/Skeleton';
import {EmptyState, ErrorState} from '../components/States';
import {Tabs} from '../components/Tabs';
import {Txt} from '../components/Txt';
import {ChartWorkspace} from '../components/analysis/ChartWorkspace';
import {LineChart} from '../components/charts/LineChart';
import {WatchButton} from '../components/trading/WatchButton';
import {useReduceMotion} from '../hooks/useReduceMotion';
import {useTick} from '../hooks/useLiveQuotes';
import type {RootScreenProps, StockTab} from '../navigation/types';
import {alpha, changeColor, usePalette} from '../theme';
import {compact, pct, price, signed} from '../utils/fmt';

const fx = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));

function Header({s, onTrade, onBacktest, onAsk}: {s: StockDetail; onTrade: (refPrice: number) => void; onBacktest: () => void; onAsk: () => void}) {
  const p = usePalette();
  const live = useTick(s.symbol);
  const px = live?.price ?? s.price;
  const ch = live?.change ?? s.change;
  const cp = live?.change_pct ?? s.change_pct;
  return (
    <View style={styles.header}>
      <View style={styles.badges}>
        <Txt variant="h1" accessibilityRole="header">
          {s.symbol}
        </Txt>
        <Badge label={s.exchange} />
        <Badge label={s.sector} />
        <SourceBadge source={s.data_source} />
      </View>
      <Txt variant="small" tone="muted">
        {s.name}
      </Txt>
      <View style={styles.priceRow}>
        <FlashPrice testID="stock-price" value={px} dir={live?.dir} weight="500" style={styles.bigPrice} />
        <Txt variant="body" num color={changeColor(p, cp)}>
          {signed(ch)} ({pct(cp)})
        </Txt>
      </View>
      <View style={styles.actions}>
        <WatchButton symbol={s.symbol} />
        <Button testID="stock-backtest" size="sm" title="Backtest" icon={<FlaskConical size={14} color={p.ink} />} onPress={onBacktest} />
        <Button testID="stock-ask" size="sm" title="Ask assistant" icon={<Bot size={14} color={p.ink} />} onPress={onAsk} />
        <Button
          testID="stock-trade"
          size="sm"
          variant="primary"
          title="Paper trade"
          icon={<ShoppingCart size={14} color={p.ground} />}
          onPress={() => onTrade(px)}
        />
      </View>
    </View>
  );
}

function TrendSummary({a}: {a: StockAnalysis}) {
  const p = usePalette();
  const dirTone = a.trend.direction === 'UPTREND' ? 'up' : a.trend.direction === 'DOWNTREND' ? 'down' : 'neutral';
  return (
    <View style={styles.pad16}>
      <View style={styles.badges}>
        <Badge tone={dirTone} label={a.trend.direction.toLowerCase()} />
        <Badge label={`${a.trend.strength.toLowerCase()} trend`} />
        <Badge tone={a.volatility.state === 'HIGH' ? 'warn' : 'neutral'} label={`${a.volatility.state.toLowerCase()} volatility`} />
        <Badge tone="info" label={a.regime.label.replace(/_/g, ' ').toLowerCase()} />
      </View>
      <Txt variant="small" style={styles.para}>
        {a.regime.description}
      </Txt>
      <View>
        <KV first k="RSI 14" v={fx(a.momentum.rsi)} />
        <KV k="ADX 14" v={fx(a.trend.adx)} />
        <KV k="MACD histogram" v={fx(a.momentum.macd_histogram, 2)} color={changeColor(p, a.momentum.macd_histogram)} />
        <KV k="ATR as % of price" v={pct(a.volatility.atr_pct, 2, false)} />
        <KV k="Volume vs 20-day avg" v={`${a.volume.ratio.toFixed(2)}×`} />
        <KV k="Nearest support" v={price(a.levels.supports[0])} />
        <KV k="Nearest resistance" v={price(a.levels.resistances[0])} />
      </View>
    </View>
  );
}

function TechnicalTab({a}: {a: StockAnalysis}) {
  const p = usePalette();
  const blocks: {title: string; rows: [string, string, string?][]; note: string}[] = [
    {
      title: 'Trend',
      note: `${a.trend.direction.toLowerCase()}, ${a.trend.strength.toLowerCase()}`,
      rows: [
        ['EMA 20', price(a.trend.ema_20)],
        ['EMA 50', price(a.trend.ema_50)],
        ['SMA 200', price(a.trend.sma_200)],
        ['ADX 14', fx(a.trend.adx)],
        ['EMA 20 slope, 5 bars', pct(a.trend.slope_20_pct), changeColor(p, a.trend.slope_20_pct)],
      ],
    },
    {
      title: 'Momentum',
      note: a.momentum.state,
      rows: [
        ['RSI 14', fx(a.momentum.rsi)],
        ['ROC 10', pct(a.momentum.roc_10), changeColor(p, a.momentum.roc_10)],
        ['MACD', fx(a.momentum.macd, 2)],
        ['MACD signal', fx(a.momentum.macd_signal, 2)],
        ['Stochastic %K / %D', `${fx(a.momentum.stoch_k)} / ${fx(a.momentum.stoch_d)}`],
      ],
    },
    {
      title: 'Volatility',
      note: a.volatility.state.toLowerCase(),
      rows: [
        ['ATR 14', price(a.volatility.atr)],
        ['ATR % of price', pct(a.volatility.atr_pct, 2, false)],
        ['Historical vol, 20 bars (ann.)', pct(a.volatility.hist_vol_20, 1, false)],
        ['Bollinger width', pct(a.volatility.bb_width_pct, 2, false)],
      ],
    },
    {
      title: 'Volume',
      note: `OBV ${a.volume.obv_trend.toLowerCase()}`,
      rows: [
        ['Latest volume', compact(a.volume.latest)],
        ['20-bar average', compact(a.volume.avg_20)],
        ['Ratio', `${a.volume.ratio.toFixed(2)}×`],
        ['OBV trend', a.volume.obv_trend.toLowerCase()],
      ],
    },
  ];
  let idx = 0;
  return (
    <View style={styles.stack}>
      {blocks.map(b => (
        <Panel
          key={b.title}
          index={idx++}
          title={b.title}
          action={
            <Txt variant="caption" tone="muted">
              {b.note}
            </Txt>
          }
          bodyStyle={styles.kvBody}>
          {b.rows.map(([k, v, c], i) => (
            <KV key={k} first={i === 0} k={k} v={v} color={c} />
          ))}
        </Panel>
      ))}
      <Panel index={idx++} title="Support and resistance" padded>
        {[...a.levels.resistances].reverse().map(l => (
          <View key={`r${l}`} style={styles.level}>
            <Txt variant="caption" tone="down" style={styles.levelLabel}>
              Resistance
            </Txt>
            <Txt variant="small" num>
              {price(l)}
            </Txt>
            <Txt variant="caption" num tone="muted" style={styles.ml}>
              {pct(((l - a.price) / a.price) * 100)}
            </Txt>
          </View>
        ))}
        <View style={[styles.level, styles.levelMid, {borderColor: p.rule}]}>
          <Txt variant="caption" style={styles.levelLabel}>
            Analysed price
          </Txt>
          <Txt variant="small" num weight="500">
            {price(a.price)}
          </Txt>
        </View>
        {a.levels.supports.map(l => (
          <View key={`s${l}`} style={styles.level}>
            <Txt variant="caption" tone="up" style={styles.levelLabel}>
              Support
            </Txt>
            <Txt variant="small" num>
              {price(l)}
            </Txt>
            <Txt variant="caption" num tone="muted" style={styles.ml}>
              {pct(((l - a.price) / a.price) * 100)}
            </Txt>
          </View>
        ))}
        {a.levels.supports.length + a.levels.resistances.length === 0 ? (
          <Txt variant="caption" tone="muted">
            No swing levels found in the lookback window.
          </Txt>
        ) : null}
        <Txt variant="micro" tone="faint" style={styles.mt12}>
          Levels are clustered swing highs and lows from the analysed timeframe.
        </Txt>
      </Panel>
      <Panel index={idx++} title="What the data shows" padded bodyStyle={styles.gap8}>
        {a.observations.map((o, i) => (
          <Bullet key={i} strong>
            {o}
          </Bullet>
        ))}
      </Panel>
      <Panel index={idx++} title="How it is usually read" padded bodyStyle={styles.gap8}>
        {a.interpretations.map((o, i) => (
          <Bullet key={i}>{o}</Bullet>
        ))}
        <Txt variant="micro" tone="faint" style={styles.mt4}>
          Interpretations are educational and do not predict future prices.
        </Txt>
      </Panel>
    </View>
  );
}

function PerformanceTab({s}: {s: StockDetail}) {
  const p = usePalette();
  const candles = useCandles(s.symbol, '1d', 800);
  const periods = Object.entries(s.performance) as [string, number | null][];
  const max = Math.max(1, ...periods.map(([, v]) => Math.abs(v ?? 0)));
  const closes = useMemo(() => (candles.data?.candles ?? []).map(c => c.close), [candles.data]);
  return (
    <View style={styles.stack}>
      <Panel index={0} title="Daily close, full history" action={<SourceBadge source={candles.data?.data_source} />} bodyStyle={styles.pad12}>
        {candles.data ? (
          <LineChart series={[{key: 'close', values: closes, color: p.ink, area: true}]} height={240} formatY={v => price(v, 0)} />
        ) : candles.isError ? (
          <ErrorState error={candles.error} onRetry={() => candles.refetch()} compact />
        ) : (
          <Skeleton height={240} />
        )}
      </Panel>
      <Panel index={1} title="Returns by period" padded>
        <View style={styles.gap10}>
          {periods.map(([k, v]) => (
            <View key={k} style={styles.perfRow}>
              <Txt variant="small" tone="muted" style={styles.perfKey}>
                {k}
              </Txt>
              <View style={styles.perfTrack}>
                <View style={[styles.axis, {backgroundColor: p.line}]} />
                {v !== null ? (
                  <View
                    style={[
                      styles.perfBar,
                      {width: `${(Math.abs(v) / max) * 50}%`, backgroundColor: alpha(v >= 0 ? p.up : p.down, 0.8)},
                      v >= 0 ? {left: '50%'} : {right: '50%'},
                    ]}
                  />
                ) : null}
              </View>
              <Txt variant="small" num align="right" color={changeColor(p, v)} style={styles.perfVal}>
                {pct(v)}
              </Txt>
            </View>
          ))}
        </View>
        <View style={styles.mt16}>
          <KV first k="52-week high" v={price(s.stats.high_52w)} />
          <KV k="52-week low" v={price(s.stats.low_52w)} />
          <KV k="Annualised volatility" v={pct(s.stats.volatility_annualized, 1, false)} />
          <KV k="Beta vs NIFTY 50" v={fx(s.stats.beta, 2)} />
        </View>
      </Panel>
    </View>
  );
}

function AiTab({symbol}: {symbol: string}) {
  const trend = useAssistant();
  const summary = useAssistant();
  const {mutate: askTrend} = trend;
  const {mutate: askSummary} = summary;
  useEffect(() => {
    askTrend({question: `Why is ${symbol} showing its current trend?`, context: {symbol}});
    askSummary({question: `Summarize the available technical indicators for ${symbol}`, context: {symbol}});
  }, [symbol, askTrend, askSummary]);
  return (
    <View style={styles.stack}>
      {[
        {m: trend, title: 'Trend explanation'},
        {m: summary, title: 'Indicator summary'},
      ].map(({m, title}, i) => (
        <Panel key={title} index={i} title={title} action={<Badge tone="info" label="Rule-based, local" />} padded>
          {m.isPending ? (
            <SkeletonRows rows={6} style={styles.p0} />
          ) : m.isError ? (
            <ErrorState error={m.error} compact />
          ) : m.data ? (
            <View>
              <SimpleMarkdown source={m.data.answer} />
              {m.data.data.length > 0 ? (
                <View style={styles.mt12}>
                  {m.data.data.map((d, j) => (
                    <KV key={d.label} first={j === 0} k={d.label} v={d.value} />
                  ))}
                </View>
              ) : null}
              {m.data.disclaimers.map(d => (
                <Txt key={d} variant="micro" tone="faint" style={styles.mt8}>
                  {d}
                </Txt>
              ))}
            </View>
          ) : null}
        </Panel>
      ))}
    </View>
  );
}

export function StockDetailScreen({route, navigation}: RootScreenProps<'StockDetail'>) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const symbol = route.params.symbol.toUpperCase();
  const [tab, setTab] = useState<StockTab>(route.params.tab ?? 'overview');
  const [tf, setTf] = useState<Timeframe>('1d');
  const [sigFilter, setSigFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');
  const stock = useStockDetail(symbol);
  const analysis = useAnalysis(symbol, tf);

  useEffect(() => {
    if (route.params.tab) {
      setTab(route.params.tab);
    }
  }, [route.params.tab]);

  const refresh = () => {
    stock.refetch();
    analysis.refetch();
  };

  if (stock.isError) {
    return (
      <Screen back testID="stock-detail-screen">
        <Panel>
          <ErrorState error={stock.error} onRetry={() => stock.refetch()} />
        </Panel>
      </Screen>
    );
  }
  if (!stock.data) {
    return (
      <Screen back testID="stock-detail-screen">
        <View style={styles.gap12}>
          <Skeleton width={160} height={28} />
          <Skeleton width={240} height={36} />
          <Skeleton height={360} rounded={8} />
        </View>
      </Screen>
    );
  }

  const s = stock.data;
  const a = analysis.data;
  const signals = (a?.signals ?? []).filter(x => sigFilter === 'ALL' || x.action === sigFilter);
  const active = (a?.signals ?? []).filter(x => x.action !== 'HOLD');
  const techTfs = s.available_timeframes.filter(t => ['15m', '1h', '1d', '1w'].includes(t));

  return (
    <Screen back testID="stock-detail-screen" refreshing={stock.isRefetching} onRefresh={refresh}>
      <Header
        s={s}
        onTrade={refPrice => navigation.navigate('OrderTicket', {symbol: s.symbol, refPrice})}
        onBacktest={() => navigation.navigate('Backtesting', {symbol: s.symbol})}
        onAsk={() => navigation.navigate('Assistant', {symbol: s.symbol})}
      />
      <Tabs
        testID="stock-tabs"
        value={tab}
        onChange={setTab}
        items={[
          {value: 'overview', label: 'Overview'},
          {value: 'chart', label: 'Chart'},
          {value: 'technical', label: 'Technical analysis'},
          {value: 'fundamentals', label: 'Fundamentals'},
          {value: 'performance', label: 'Historical performance'},
          {value: 'ai', label: 'AI insights'},
          {value: 'signals', label: `Trading signals${active.length ? ` · ${active.length}` : ''}`},
        ]}
      />
      <Animated.View key={tab} entering={reduce ? undefined : FadeIn.duration(200)} style={styles.stack}>
        {tab === 'overview' ? (
          <>
            <Panel index={0}>
              <ChartWorkspace symbol={symbol} available={s.available_timeframes} compact />
            </Panel>
            <Panel index={1} title="Read of the daily chart" action={a ? <SourceBadge source={a.data_source} /> : null}>
              {a ? <TrendSummary a={a} /> : analysis.isError ? <ErrorState error={analysis.error} compact /> : <SkeletonRows rows={8} />}
            </Panel>
            <Panel index={2} title="Session" bodyStyle={styles.kvBody}>
              <KV first k="Open" v={price(s.stats.open)} />
              <KV k="Day high" v={price(s.stats.day_high)} />
              <KV k="Day low" v={price(s.stats.day_low)} />
              <KV k="Previous close" v={price(s.prev_close)} />
              <KV k="Volume" v={compact(s.volume)} />
              <KV k="20-day avg volume" v={compact(s.stats.avg_volume_20d)} />
            </Panel>
            <Panel index={3} title="About" padded>
              <Txt variant="small" style={styles.para}>
                {s.description}
              </Txt>
              <View style={styles.mt12}>
                <KV first k="ISIN" v={s.isin ?? '—'} />
                <KV k="Market cap" v={s.market_cap ? `₹${price(s.market_cap, 0)} Cr` : '—'} />
                <KV k="P/E" v={fx(s.fundamentals.pe_ratio)} />
              </View>
            </Panel>
            <Panel
              index={4}
              title="Strategy read-out"
              action={
                <Pressable onPress={() => setTab('signals')} hitSlop={10} accessibilityRole="link">
                  <Txt variant="caption" tone="muted">
                    Details
                  </Txt>
                </Pressable>
              }>
              {a ? (
                a.signals.map((x, i) => (
                  <View key={x.strategy_key} style={[styles.readout, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}]}>
                    <Txt variant="caption" weight="600" tone={x.action === 'BUY' ? 'up' : x.action === 'SELL' ? 'down' : 'faint'} style={styles.readAction}>
                      {x.action}
                    </Txt>
                    <Txt variant="small" tone="muted" numberOfLines={1} style={styles.flex}>
                      {x.strategy}
                    </Txt>
                    <StrengthMeter score={x.strength.score} />
                  </View>
                ))
              ) : (
                <SkeletonRows rows={6} />
              )}
            </Panel>
          </>
        ) : null}

        {tab === 'chart' ? (
          <Panel index={0}>
            <ChartWorkspace symbol={symbol} available={s.available_timeframes} />
          </Panel>
        ) : null}

        {tab === 'technical' ? (
          <>
            <View style={styles.tfRow}>
              <Txt variant="caption" tone="muted">
                Timeframe
              </Txt>
              <Tabs ruled={false} size="sm" value={tf} onChange={setTf} items={techTfs.map(t => ({value: t, label: t}))} />
            </View>
            {a ? <TechnicalTab a={a} /> : analysis.isError ? <ErrorState error={analysis.error} onRetry={() => analysis.refetch()} /> : <SkeletonRows rows={10} />}
          </>
        ) : null}

        {tab === 'fundamentals' ? (
          <>
            <Panel index={0} title="Valuation" action={<SourceBadge source={s.fundamentals.data_source} />} bodyStyle={styles.kvBody}>
              <KV first k="Market capitalisation" v={s.fundamentals.market_cap ? `₹${price(s.fundamentals.market_cap, 0)} Cr` : '—'} />
              <KV k="Price / earnings" v={fx(s.fundamentals.pe_ratio, 2)} />
              <KV k="Price / book" v={fx(s.fundamentals.pb_ratio, 2)} />
              <KV k="Earnings per share" v={s.fundamentals.eps ? `₹${price(s.fundamentals.eps)}` : '—'} />
            </Panel>
            <Panel index={1} title="Per share" bodyStyle={styles.kvBody}>
              <KV first k="Book value" v={s.fundamentals.book_value ? `₹${price(s.fundamentals.book_value)}` : '—'} />
              <KV k="Dividend yield" v={pct(s.fundamentals.dividend_yield, 2, false)} />
              <KV k="Face value" v={s.fundamentals.face_value ? `₹${price(s.fundamentals.face_value)}` : '—'} />
              <KV k="ISIN" v={s.isin ?? '—'} />
            </Panel>
            <Txt variant="caption" tone="muted">
              Fundamentals shown are{' '}
              {s.fundamentals.data_source === 'SIMULATED' ? 'generated demo values for interface testing, not company filings' : 'from the imported dataset'}. A
              dash means the dataset has no value.
            </Txt>
          </>
        ) : null}

        {tab === 'performance' ? <PerformanceTab s={s} /> : null}
        {tab === 'ai' ? <AiTab symbol={symbol} /> : null}

        {tab === 'signals' ? (
          <>
            <Tabs
              ruled={false}
              size="sm"
              value={sigFilter}
              onChange={setSigFilter}
              items={(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map(v => ({value: v, label: v === 'ALL' ? 'All strategies' : v.toLowerCase()}))}
            />
            <Txt variant="caption" tone="muted">
              Strength scores rank how clearly conditions are met. They are not probabilities of profit.
            </Txt>
            {!a ? (
              analysis.isError ? (
                <ErrorState error={analysis.error} onRetry={() => analysis.refetch()} />
              ) : (
                <SkeletonRows rows={8} />
              )
            ) : signals.length === 0 ? (
              <Panel>
                <EmptyState title="No strategy is in this state" />
              </Panel>
            ) : (
              signals.map((x, i) => <SignalCard key={x.strategy_key} s={x} index={i} />)
            )}
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  header: {gap: 4, paddingBottom: 4},
  badges: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
  priceRow: {flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 8, flexWrap: 'wrap'},
  bigPrice: {fontSize: 32, lineHeight: 38, letterSpacing: -0.6},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10},
  stack: {gap: 12},
  pad16: {padding: 16, gap: 12},
  pad12: {padding: 12},
  p0: {padding: 0},
  para: {lineHeight: 20},
  kvBody: {paddingHorizontal: 16, paddingVertical: 4},
  gap8: {gap: 8},
  gap10: {gap: 10},
  gap12: {gap: 12},
  mt4: {marginTop: 4},
  mt8: {marginTop: 8},
  mt12: {marginTop: 12},
  mt16: {marginTop: 16},
  ml: {marginLeft: 'auto'},
  level: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3},
  levelMid: {borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 8, marginVertical: 8},
  levelLabel: {width: 96},
  perfRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  perfKey: {width: 40},
  perfTrack: {flex: 1, height: 8},
  axis: {position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1},
  perfBar: {position: 'absolute', top: 0, height: 8, borderRadius: 2},
  perfVal: {width: 70},
  readout: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, paddingHorizontal: 16},
  readAction: {width: 40},
  tfRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
});
