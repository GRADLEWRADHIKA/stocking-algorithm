import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {ArrowUpRight, Radar, Sparkles} from 'lucide-react-native';
import {useActiveAccount, useOrders, useOverview, useScanSignals, useSignals, useWatchlists} from '../api/hooks';
import {
  AnimatedNumber,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  HeadLink,
  Panel,
  Screen,
  SignalRow,
  SkeletonRows,
  SourceBadge,
  Tabs,
  TextField,
  Txt,
  Wordmark,
} from '../components';
import {BreadthBar, IndexStrip, QuoteList, SectorBars} from '../components/market/MarketBlocks';
import {FlashPrice} from '../components/PriceText';
import {useLive} from '../hooks/useLiveQuotes';
import type {TabScreenProps} from '../navigation/types';
import {alpha, changeColor, usePalette} from '../theme';
import {dateTime, inr, pct, price, signedInr, todayIst} from '../utils/fmt';
import {HeaderActions} from './shared';

type Movers = 'gainers' | 'losers' | 'active' | 'volume';

/** Previous weekday sessions (IST), most recent first — quick picks for the replay. */
export function previousSessions(n: number, from = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(from.getTime() + 330 * 60 * 1000);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

export function isValidReplayDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return false;
  }
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v <= todayIst();
}

function PortfolioSnapshot({onOpen, onPaper}: {onOpen: () => void; onPaper: () => void}) {
  const p = usePalette();
  const {active: acc, isLoading} = useActiveAccount();
  const orders = useOrders(acc?.id ?? null);
  if (isLoading) {
    return <SkeletonRows rows={4} />;
  }
  if (!acc) {
    return (
      <EmptyState
        title="No paper account yet"
        body="Create a virtual account to start simulated trading."
        action={<Button size="sm" variant="primary" title="Open paper trading" onPress={onPaper} />}
      />
    );
  }
  const recent = (orders.data ?? []).filter(o => o.status === 'FILLED').slice(0, 4);
  return (
    <View testID="portfolio-snapshot">
      <View style={styles.pad}>
        <Txt variant="caption" tone="muted">
          {acc.name} · equity
        </Txt>
        <AnimatedNumber value={acc.equity} format={v => inr(v)} variant="display" weight="500" />
        <View style={styles.wrapRow}>
          <Txt variant="caption" tone="muted">
            Today{' '}
            <Txt variant="caption" num color={changeColor(p, acc.day_pnl)}>
              {signedInr(acc.day_pnl)}
            </Txt>
          </Txt>
          <Txt variant="caption" tone="muted">
            Since start{' '}
            <Txt variant="caption" num color={changeColor(p, acc.total_return_pct)}>
              {pct(acc.total_return_pct)}
            </Txt>
          </Txt>
        </View>
      </View>
      <View style={[styles.dl, {borderColor: p.rule}]}>
        {(
          [
            ['Cash', inr(acc.cash_balance, 0), undefined],
            ['Holdings', inr(acc.holdings_value, 0), undefined],
            ['Unrealised', signedInr(acc.unrealized_pnl, 0), changeColor(p, acc.unrealized_pnl)],
          ] as const
        ).map(([k, v, c], i) => (
          <View key={k} style={[styles.dlCell, i > 0 && {borderLeftWidth: 1, borderLeftColor: p.rule}]}>
            <Txt variant="caption" tone="muted">
              {k}
            </Txt>
            <Txt variant="small" num color={c} numberOfLines={1} adjustsFontSizeToFit>
              {v}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.pad}>
        <Txt variant="caption" tone="muted" style={styles.mb8}>
          Recent paper fills
        </Txt>
        {recent.length === 0 ? (
          <Txt variant="caption" tone="muted">
            No filled orders yet.
          </Txt>
        ) : (
          recent.map(o => (
            <View key={o.id} style={styles.fill}>
              <Txt variant="caption" weight="600" tone={o.side === 'BUY' ? 'up' : 'down'} style={styles.side}>
                {o.side}
              </Txt>
              <Txt variant="caption" weight="500">
                {o.symbol}
              </Txt>
              <Txt variant="caption" num tone="muted">
                {o.filled_quantity} @ {price(o.avg_fill_price)}
              </Txt>
              <Txt variant="micro" num tone="faint" style={styles.mlAuto}>
                {dateTime(o.updated_at)}
              </Txt>
            </View>
          ))
        )}
      </View>
      <Pressable onPress={onOpen} accessibilityRole="link" style={[styles.footLink, {borderTopColor: p.rule}]}>
        <Txt variant="caption" tone="muted">
          Open portfolio
        </Txt>
        <ArrowUpRight size={14} color={p.muted} />
      </Pressable>
    </View>
  );
}

function WatchlistSummary({onStock, onManage}: {onStock: (s: string) => void; onManage: () => void}) {
  const p = usePalette();
  const {data, isLoading} = useWatchlists();
  const ticks = useLive(s => s.ticks);
  const wl = data?.[0];
  if (isLoading) {
    return <SkeletonRows rows={4} />;
  }
  if (!wl || wl.items.length === 0) {
    return (
      <EmptyState
        title="Watchlist is empty"
        body="Add symbols from any stock page."
        action={<Button size="sm" title="Go to watchlists" onPress={onManage} />}
      />
    );
  }
  return (
    <View>
      {wl.items.slice(0, 6).map((it, i) => {
        const l = ticks[it.symbol];
        const c = l?.change_pct ?? it.change_pct;
        return (
          <Pressable
            key={it.symbol}
            onPress={() => onStock(it.symbol)}
            accessibilityRole="button"
            style={({pressed}) => [styles.wlRow, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}, pressed && {backgroundColor: alpha(p.raised, 0.6)}]}>
            <Txt variant="small" weight="500" style={styles.flex}>
              {it.symbol}
            </Txt>
            <FlashPrice value={l?.price ?? it.price} dir={l?.dir} variant="small" />
            <Txt variant="caption" num align="right" color={changeColor(p, c)} style={styles.wlPct}>
              {pct(c)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HomeScreen({navigation}: TabScreenProps<'Home'>) {
  const p = usePalette();
  const [date, setDate] = useState('');
  const [draft, setDraft] = useState('');
  const [replayOpen, setReplayOpen] = useState(false);
  const overview = useOverview(date || undefined);
  const signals = useSignals({limit: 8});
  const scan = useScanSignals();
  const [movers, setMovers] = useState<Movers>('gainers');
  const o = overview.data;
  const openStock = (symbol: string) => navigation.navigate('StockDetail', {symbol});
  const draftValid = isValidReplayDate(draft);

  const applyDate = (d: string) => {
    setDate(d);
    setDraft(d);
    setReplayOpen(false);
  };

  return (
    <Screen
      testID="home-screen"
      refreshing={overview.isRefetching}
      onRefresh={() => {
        overview.refetch();
        signals.refetch();
      }}>
        <View style={styles.header}>
          <View style={styles.headRow}>
            <Wordmark />
            <HeaderActions />
          </View>
          <View>
            <Txt variant="h1" accessibilityRole="header">
              Market overview
            </Txt>
            <View style={styles.wrapRow}>
              <Txt variant="small" tone="muted">
                {o ? `${date ? 'Replay of the session on' : 'As of'} ${dateTime(o.as_of, !date)} IST` : 'Loading session…'}
              </Txt>
              <SourceBadge source={o?.data_source} />
            </View>
          </View>
          <View style={styles.wrapRow}>
            <Button
              size="sm"
              variant="primary"
              title="Run signal scan"
              testID="run-scan"
              loading={scan.isPending}
              icon={<Radar size={14} color={p.ground} />}
              onPress={() => scan.mutate({})}
            />
            <Button size="sm" title={date ? `Replay ${date}` : 'Replay a past session'} testID="replay-toggle" onPress={() => setReplayOpen(v => !v)} />
            {date ? <Button size="sm" variant="ghost" title="Back to live" onPress={() => applyDate('')} /> : null}
          </View>
          {replayOpen ? (
            <View style={[styles.replay, {backgroundColor: p.surface, borderColor: p.line}]}>
              <Txt variant="caption" tone="muted">
                Replay a past session from the dataset
              </Txt>
              <View style={styles.replayRow}>
                <TextField
                  size="sm"
                  num
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  maxLength={10}
                  accessibilityLabel="Replay a past session"
                  containerStyle={styles.flex}
                  error={draft && !draftValid ? 'Use a past date as YYYY-MM-DD' : null}
                />
                <Button size="sm" variant="primary" title="Replay" disabled={!draftValid} onPress={() => applyDate(draft)} />
              </View>
            </View>
          ) : null}
          {replayOpen ? (
            <ChipRow style={styles.chips}>
              {previousSessions(6).map(d => (
                <Chip key={d} label={d} selected={d === date} onPress={() => applyDate(d)} />
              ))}
            </ChipRow>
          ) : null}
        </View>
      {overview.isError ? (
        <Panel>
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        </Panel>
      ) : (
        <>
          <Panel index={0}>{o ? <IndexStrip indices={o.indices} /> : <SkeletonRows rows={2} />}</Panel>

          <Panel
            index={1}
            title="Breadth and sectors"
            action={
              o ? (
                <Txt variant="caption" tone="muted">
                  {o.breadth.advancers + o.breadth.decliners + o.breadth.unchanged} stocks in universe
                </Txt>
              ) : null
            }
            padded>
            {o ? (
              <View style={styles.gap24}>
                <BreadthBar {...o.breadth} />
                <View>
                  <View style={styles.summaryHead}>
                    <Sparkles size={14} color={p.accent} />
                    <Txt variant="caption" tone="muted" style={styles.flex}>
                      Session summary, computed from the figures on this page
                    </Txt>
                  </View>
                  <View style={styles.gap8}>
                    {o.market_summary.map((line, i) => (
                      <View key={i} style={styles.bullet}>
                        <View style={[styles.dot, {backgroundColor: p.faint}]} />
                        <Txt variant="small" style={styles.flex}>
                          {line}
                        </Txt>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => navigation.navigate('Assistant', {question: "Summarize today's market"})}
                    accessibilityRole="link"
                    style={styles.askLink}>
                    <Txt variant="caption" tone="muted">
                      Ask the assistant for more
                    </Txt>
                    <ArrowUpRight size={12} color={p.muted} />
                  </Pressable>
                </View>
                <SectorBars sectors={o.sectors} onSector={sector => navigation.navigate('Explorer', {sector})} />
              </View>
            ) : (
              <SkeletonRows rows={6} />
            )}
          </Panel>

          <Panel index={2} title="Paper portfolio" action={<SourceBadge source="PAPER_TRADING" />}>
            <PortfolioSnapshot onOpen={() => navigation.navigate('Portfolio')} onPaper={() => navigation.navigate('PaperTrading')} />
          </Panel>

          <Panel
            index={3}
            titleNode={
              <Tabs<Movers>
                ruled={false}
                size="sm"
                value={movers}
                onChange={setMovers}
                testID="movers"
                items={[
                  {value: 'gainers', label: 'Top gainers'},
                  {value: 'losers', label: 'Top losers'},
                  {value: 'active', label: 'Most active'},
                  {value: 'volume', label: 'Volume'},
                ]}
              />
            }>
            {o ? (
              <QuoteList
                key={movers}
                rows={movers === 'gainers' ? o.top_gainers : movers === 'losers' ? o.top_losers : movers === 'active' ? o.most_active : o.highest_volume}
                metric={movers === 'active' ? 'value' : movers === 'volume' ? 'volume' : 'change'}
                limit={6}
                onPress={openStock}
              />
            ) : (
              <SkeletonRows />
            )}
          </Panel>

          <Panel index={4} title="Latest strategy signals" action={<HeadLink label="View all" onPress={() => navigation.navigate('Signals')} />}>
            {signals.isLoading ? (
              <SkeletonRows />
            ) : signals.isError ? (
              <ErrorState error={signals.error} onRetry={() => signals.refetch()} />
            ) : (signals.data ?? []).length === 0 ? (
              <EmptyState title="No signals stored yet" body="Run a scan to evaluate every built-in strategy across the universe." />
            ) : (
              <View style={styles.clipTop}>
                {(signals.data ?? []).slice(0, 6).map(s => (
                  <SignalRow key={`${s.id ?? ''}-${s.symbol}-${s.strategy_key}`} s={s} onPress={() => navigation.navigate('SignalDetail', {signal: s})} />
                ))}
              </View>
            )}
          </Panel>

          <Panel index={5} title="Watchlist" action={<HeadLink label="Manage" onPress={() => navigation.navigate('Watchlist')} />}>
            <WatchlistSummary onStock={openStock} onManage={() => navigation.navigate('Watchlist')} />
          </Panel>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  header: {gap: 12, paddingTop: 8},
  headRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  wrapRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2},
  replay: {borderWidth: 1, borderRadius: 8, padding: 12, gap: 8},
  replayRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  chips: {paddingHorizontal: 0},
  pad: {paddingHorizontal: 16, paddingVertical: 12, gap: 2},
  mb8: {marginBottom: 8},
  dl: {flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1},
  dlCell: {flex: 1, paddingHorizontal: 16, paddingVertical: 10, gap: 2},
  fill: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6},
  side: {width: 32},
  mlAuto: {marginLeft: 'auto'},
  footLink: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10},
  gap24: {gap: 24},
  gap8: {gap: 8},
  summaryHead: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8},
  bullet: {flexDirection: 'row', gap: 8},
  dot: {width: 4, height: 4, borderRadius: 2, marginTop: 8},
  askLink: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12},
  clipTop: {marginTop: -1},
  wlRow: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 42, paddingHorizontal: 16},
  wlPct: {width: 64},
});
