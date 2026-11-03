import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import {LayoutGrid, Rows3, SlidersHorizontal, X} from 'lucide-react-native';
import {useSectors, useStocks} from '../api/hooks';
import type {StockListParams} from '../api/endpoints';
import type {ScreenKey, StockSummary} from '../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Panel,
  Screen,
  SelectField,
  SkeletonRows,
  SourceBadge,
  Sparkline,
  Tabs,
  TextField,
  Txt,
} from '../components';
import {FlashPrice} from '../components/PriceText';
import {useLive} from '../hooks/useLiveQuotes';
import {useReduceMotion} from '../hooks/useReduceMotion';
import type {RootScreenProps} from '../navigation/types';
import {alpha, changeColor, radius, usePalette} from '../theme';
import {compact, pct, price} from '../utils/fmt';

/** Same screens and hint text as the web explorer. */
export const SCREENS: {value: ScreenKey | ''; label: string; hint: string}[] = [
  {value: '', label: 'All', hint: 'Every active instrument'},
  {value: 'gainers', label: 'Gainers', hint: 'Positive change today, strongest first'},
  {value: 'losers', label: 'Losers', hint: 'Negative change today, weakest first'},
  {value: 'momentum', label: 'Momentum', hint: '20-day rate of change above 5% with volume above its 20-day average'},
  {value: 'breakout', label: 'Breakouts', hint: 'Close above the prior 20-day high on above-average volume'},
  {value: 'ma_crossover', label: 'MA crossover', hint: 'EMA 20 crossed EMA 50 within the last 5 sessions'},
  {value: 'high_volatility', label: 'High volatility', hint: '20-day annualised volatility in the top quintile'},
  {value: 'oversold', label: 'Oversold', hint: 'RSI 14 below 30'},
  {value: 'overbought', label: 'Overbought', hint: 'RSI 14 above 70'},
];

export const SORTS = [
  {value: '-change_pct', label: 'Change, high to low'},
  {value: 'change_pct', label: 'Change, low to high'},
  {value: '-volume', label: 'Volume, high to low'},
  {value: '-price', label: 'Price, high to low'},
  {value: 'price', label: 'Price, low to high'},
  {value: 'symbol', label: 'Symbol A–Z'},
];

const NUM_FILTERS = [
  ['min_price', 'Min price ₹'],
  ['max_price', 'Max price ₹'],
  ['min_volume', 'Min volume'],
  ['min_mcap', 'Min mcap ₹Cr'],
  ['max_mcap', 'Max mcap ₹Cr'],
] as const;

type ScreenVal = ScreenKey | 'all';
const toVal = (s: ScreenKey | '' | undefined): ScreenVal => (s ? s : 'all');

function StockCard({s, onPress, i}: {s: StockSummary; onPress: () => void; i: number}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const live = useLive(st => st.ticks[s.symbol]);
  const c = live?.change_pct ?? s.change_pct;
  return (
    <Animated.View style={styles.cardCell} entering={reduce ? undefined : FadeInDown.delay(Math.min(i, 12) * 25).duration(300)}>
      <Card onPress={onPress} testID={`stock-card-${s.symbol}`} accessibilityLabel={`${s.symbol} ${s.name}`}>
        <View style={styles.cardTop}>
          <View style={styles.flex}>
            <Txt variant="small" weight="600">
              {s.symbol}
            </Txt>
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              {s.name}
            </Txt>
          </View>
          <Txt variant="micro" tone="faint">
            {s.exchange}
          </Txt>
        </View>
        <View style={styles.cardMid}>
          <View>
            <FlashPrice value={live?.price ?? s.price} dir={live?.dir} variant="body" />
            <Txt variant="caption" num color={changeColor(p, c)}>
              {pct(c)}
            </Txt>
          </View>
          <Sparkline data={s.sparkline} width={60} height={28} />
        </View>
        <View style={styles.cardBottom}>
          <Txt variant="micro" tone="muted" numberOfLines={1} style={styles.flex}>
            {s.sector}
          </Txt>
          <Txt variant="micro" num tone="muted">
            Vol {compact(live?.volume ?? s.volume)}
          </Txt>
        </View>
      </Card>
    </Animated.View>
  );
}

function StockListRow({s, onPress, i}: {s: StockSummary; onPress: () => void; i: number}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const l = useLive(st => st.ticks[s.symbol]);
  const c = l?.change_pct ?? s.change_pct;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.delay(Math.min(i, 20) * 15).duration(250)}>
      <Pressable
        testID={`stock-row-${s.symbol}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${s.symbol} ${s.name}`}
        style={({pressed}) => [styles.row, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}, pressed && {backgroundColor: alpha(p.raised, 0.7)}]}>
        <View style={styles.flex}>
          <Txt variant="small" weight="500" numberOfLines={1}>
            {s.symbol}{' '}
            <Txt variant="micro" tone="faint">
              {s.exchange}
            </Txt>
          </Txt>
          <Txt variant="caption" tone="muted" numberOfLines={1}>
            {s.name}
          </Txt>
        </View>
        <Sparkline data={s.sparkline} width={56} height={22} />
        <View style={styles.rowRight}>
          <FlashPrice value={l?.price ?? s.price} dir={l?.dir} variant="small" containerStyle={styles.selfEnd} />
          <Txt variant="caption" num color={changeColor(p, c)}>
            {pct(c)}
          </Txt>
          <Txt variant="micro" num tone="faint">
            {compact(l?.volume ?? s.volume)} · {s.market_cap ? `₹${price(s.market_cap, 0)} Cr` : '—'}
          </Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ExplorerScreen({navigation, route}: RootScreenProps<'Explorer'>) {
  const p = usePalette();
  const sectors = useSectors();
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(route.params?.q ?? '');
  const [debounced, setDebounced] = useState(q);
  const [f, setF] = useState<StockListParams>({
    sector: route.params?.sector ?? '',
    exchange: '',
    screen: route.params?.screen ?? '',
    sort: '-change_pct',
    min_price: null,
    max_price: null,
    min_volume: null,
    min_mcap: null,
    max_mcap: null,
    limit: 50,
    offset: 0,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (route.params?.sector !== undefined || route.params?.screen !== undefined) {
      setF(o => ({...o, offset: 0, sector: route.params?.sector ?? o.sector, screen: route.params?.screen ?? o.screen}));
    }
  }, [route.params?.sector, route.params?.screen]);

  const query = useMemo(() => ({...f, q: debounced}), [f, debounced]);
  const {data, isLoading, isError, error, refetch, isFetching, isRefetching} = useStocks(query);
  const set = (patch: Partial<StockListParams>) => setF(o => ({...o, offset: 0, ...patch}));
  const activeFilters = [f.sector, f.exchange, f.min_price, f.max_price, f.min_volume, f.min_mcap, f.max_mcap].filter(
    v => v !== '' && v !== null && v !== undefined,
  ).length;
  const screen = SCREENS.find(s => s.value === (f.screen ?? ''));
  const open = (symbol: string) => navigation.navigate('StockDetail', {symbol});

  return (
    <Screen
      back
      title="Stock explorer"
      testID="explorer-screen"
      keyboard
      refreshing={isRefetching}
      onRefresh={() => refetch()}
      right={
        <Button size="sm" variant="ghost" title="Custom screen" accessibilityLabel="Build a custom screen" onPress={() => navigation.navigate('StrategyBuilder', {mode: 'screen'})} />
      }
      headerExtra={
        <View style={styles.subRow}>
          <Txt variant="small" tone="muted">
            {data ? `${data.total} instruments match` : 'Searching…'}
          </Txt>
          <SourceBadge source={data?.items[0]?.data_source ?? 'SIMULATED'} />
        </View>
      }>
      <View>
        <Tabs<ScreenVal>
          testID="explorer-screens"
          value={toVal(f.screen)}
          onChange={v => set({screen: v === 'all' ? '' : v})}
          items={SCREENS.map(s => ({value: toVal(s.value), label: s.label}))}
        />
        <Txt variant="caption" tone="muted" style={styles.hint}>
          {screen?.hint}
        </Txt>
      </View>

      <TextField
        value={q}
        onChangeText={setQ}
        placeholder="Company or ticker"
        accessibilityLabel="Search by company or ticker"
        autoCapitalize="characters"
        autoCorrect={false}
        testID="explorer-search"
      />
      <View style={styles.controls}>
        <SelectField
          size="sm"
          style={styles.flex}
          accessibilityLabel="Sector"
          title="Sector"
          testID="explorer-sector"
          value={f.sector ?? ''}
          onChange={v => set({sector: v})}
          options={[{value: '', label: 'All sectors'}, ...(sectors.data ?? []).map(s => ({value: s, label: s}))]}
        />
        <SelectField
          size="sm"
          style={styles.flex}
          accessibilityLabel="Sort"
          title="Sort"
          testID="explorer-sort"
          value={f.sort ?? '-change_pct'}
          onChange={v => set({sort: v})}
          options={SORTS}
        />
      </View>
      <View style={styles.controls}>
        <Button
          size="sm"
          variant={showFilters || activeFilters ? 'secondary' : 'ghost'}
          title={`Filters${activeFilters ? ` · ${activeFilters}` : ''}`}
          icon={<SlidersHorizontal size={14} color={showFilters || activeFilters ? p.ink : p.muted} />}
          onPress={() => setShowFilters(v => !v)}
          testID="explorer-filters"
        />
        <View style={styles.viewToggle}>
          {isFetching ? (
            <Txt variant="caption" tone="faint" style={styles.updating}>
              Updating…
            </Txt>
          ) : null}
          {(
            [
              ['table', Rows3, 'List view'],
              ['cards', LayoutGrid, 'Card view'],
            ] as const
          ).map(([k, Icon, label]) => (
            <Pressable
              key={k}
              onPress={() => setView(k)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{selected: view === k}}
              testID={`explorer-view-${k}`}
              style={[styles.iconBtn, view === k && {backgroundColor: p.raised}]}>
              <Icon size={16} color={view === k ? p.ink : p.muted} />
            </Pressable>
          ))}
        </View>
      </View>

      {showFilters ? (
        <Animated.View entering={FadeInDown.duration(200)} style={[styles.filters, {backgroundColor: p.surface, borderColor: p.line}]}>
          <SelectField
            size="sm"
            label="Exchange"
            style={styles.filterCell}
            value={f.exchange ?? ''}
            onChange={v => set({exchange: v})}
            options={[
              {value: '', label: 'Any'},
              {value: 'NSE', label: 'NSE'},
              {value: 'BSE', label: 'BSE'},
            ]}
          />
          {NUM_FILTERS.map(([k, l]) => (
            <TextField
              key={k}
              size="sm"
              label={l}
              num
              keyboardType="numeric"
              containerStyle={styles.filterCell}
              value={drafts[k] ?? (f[k] === null || f[k] === undefined ? '' : String(f[k]))}
              onChangeText={t => {
                setDrafts(d => ({...d, [k]: t}));
                const n = t.trim() === '' ? null : Number(t);
                if (n === null || (Number.isFinite(n) && n >= 0)) {
                  set({[k]: n} as Partial<StockListParams>);
                }
              }}
            />
          ))}
          <View style={[styles.filterCell, styles.clearCell]}>
            <Button
              size="sm"
              variant="ghost"
              title="Clear"
              icon={<X size={14} color={p.muted} />}
              onPress={() => {
                setDrafts({});
                set({sector: '', exchange: '', min_price: null, max_price: null, min_volume: null, min_mcap: null, max_mcap: null});
              }}
            />
          </View>
        </Animated.View>
      ) : null}

      {isLoading ? (
        <Panel>
          <SkeletonRows rows={10} />
        </Panel>
      ) : isError ? (
        <Panel>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Panel>
      ) : !data || data.items.length === 0 ? (
        <Panel>
          <EmptyState title="Nothing matches these conditions" body="Loosen a filter or pick another screen." />
        </Panel>
      ) : view === 'cards' ? (
        <View style={styles.grid}>
          {data.items.map((s, i) => (
            <StockCard key={s.symbol} s={s} i={i} onPress={() => open(s.symbol)} />
          ))}
        </View>
      ) : (
        <Panel>
          {data.items.map((s, i) => (
            <StockListRow key={s.symbol} s={s} i={i} onPress={() => open(s.symbol)} />
          ))}
        </Panel>
      )}

      {data && data.total > data.limit ? (
        <View style={styles.pager}>
          <Txt variant="caption" num tone="muted">
            {data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}
          </Txt>
          <View style={styles.controls}>
            <Button
              size="sm"
              title="Previous"
              disabled={data.offset === 0}
              onPress={() => setF(o => ({...o, offset: Math.max(0, (o.offset ?? 0) - (o.limit ?? 50))}))}
            />
            <Button
              size="sm"
              title="Next"
              disabled={data.offset + data.limit >= data.total}
              onPress={() => setF(o => ({...o, offset: (o.offset ?? 0) + (o.limit ?? 50)}))}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  selfEnd: {alignSelf: 'flex-end'},
  subRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
  hint: {marginTop: 8},
  controls: {flexDirection: 'row', alignItems: 'center', gap: 8},
  viewToggle: {marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4},
  updating: {marginRight: 8},
  iconBtn: {padding: 7, borderRadius: radius.sm},
  filters: {flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderWidth: 1, borderRadius: radius.card, padding: 16},
  filterCell: {width: '47%'},
  clearCell: {justifyContent: 'flex-end'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6},
  cardCell: {width: '50%', padding: 6},
  cardTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 6},
  cardMid: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, gap: 6},
  cardBottom: {flexDirection: 'row', marginTop: 10, gap: 6},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10},
  rowRight: {alignItems: 'flex-end', minWidth: 96},
  pager: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
