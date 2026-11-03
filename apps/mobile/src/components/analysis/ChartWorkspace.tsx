import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AreaChart, CandlestickChart, LineChart as LineIcon, Save, SlidersHorizontal} from 'lucide-react-native';
import {useCandles, useIndicatorCatalog, useIndicators, useUpdatePreferences} from '../../api/hooks';
import type {Timeframe} from '../../api/types';
import {useTick} from '../../hooks/useLiveQuotes';
import {useAuthStore} from '../../store/auth';
import {radius, usePalette} from '../../theme';
import {parseChartConfig, spec, toChartConfig, withCatalog, type ChartKind, type IndicatorConfig} from '../../utils/chartConfig';
import {SourceBadge} from '../Badge';
import {Button} from '../Button';
import {Segmented} from '../Segmented';
import {Sheet} from '../Sheet';
import {Skeleton} from '../Skeleton';
import {ErrorState} from '../States';
import {toast} from '../Toast';
import {Txt} from '../Txt';
import {CandleChart} from '../charts/CandleChart';
import {IndicatorPicker} from './IndicatorPicker';

export const ALL_TF: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
const INTRADAY: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h'];

/**
 * Web ChartWorkspace on a phone: every timeframe the stock has, candle/line/area, the indicator
 * picker (every catalog indicator, editable params), overlays + panes, and "Save layout" to
 * PATCH /users/me/preferences {chart_config: {indicators, kind}} — the same JSON the web saves.
 */
export function ChartWorkspace({
  symbol,
  available,
  compact = false,
  initialTf = '1d',
}: {
  symbol: string;
  available: Timeframe[];
  compact?: boolean;
  initialTf?: Timeframe;
}) {
  const p = usePalette();
  const user = useAuthStore(s => s.user);
  const catalog = useIndicatorCatalog();
  const saved = useMemo(() => parseChartConfig(user?.preferences?.chart_config), [user?.preferences?.chart_config]);
  const [tf, setTf] = useState<Timeframe>(available.includes(initialTf) ? initialTf : available[available.length - 1] ?? '1d');
  const [kind, setKind] = useState<ChartKind>(saved.kind);
  const [config, setConfig] = useState<IndicatorConfig[]>(saved.indicators);
  const [picker, setPicker] = useState(false);
  const prefs = useUpdatePreferences();
  const live = useTick(symbol);

  useEffect(() => {
    if (!available.includes(tf) && available.length) {
      setTf(available.includes('1d') ? '1d' : available[0]);
    }
  }, [available, tf]);

  // every catalog indicator is pickable, even ones a saved layout predates
  useEffect(() => {
    if (catalog.data) {
      setConfig(c => withCatalog(c, catalog.data));
    }
  }, [catalog.data]);

  const limit = compact ? 300 : 800;
  const candles = useCandles(symbol, tf, limit);
  const enabled = useMemo(() => config.filter(c => c.enabled), [config]);
  const specs = useMemo(() => enabled.map(spec), [enabled]);
  const ind = useIndicators(symbol, tf, specs, limit);
  const overlays = useMemo(() => (ind.data?.indicators ?? []).filter(i => i.pane === 'overlay'), [ind.data]);
  const panes = useMemo(() => (compact ? [] : (ind.data?.indicators ?? []).filter(i => i.pane === 'separate')), [ind.data, compact]);
  const intraday = INTRADAY.includes(tf);
  const liveBar = useMemo(() => (live && !compact ? {price: live.price, time: live.time} : null), [live, compact]);

  const save = () =>
    prefs.mutate(
      {chart_config: toChartConfig(config, kind) as unknown as Record<string, unknown>},
      {
        onSuccess: () => toast.success('Chart layout saved to your profile'),
        onError: e => toast.error((e as Error).message),
      },
    );

  const kinds: [ChartKind, typeof CandlestickChart, string][] = [
    ['candles', CandlestickChart, 'Candles'],
    ['line', LineIcon, 'Line'],
    ['area', AreaChart, 'Area'],
  ];

  return (
    <View testID="chart-workspace">
      <View style={[styles.toolbar, {borderBottomColor: p.rule}]}>
        <Segmented
          testID="chart-tf"
          value={tf}
          onChange={setTf}
          options={ALL_TF.filter(t => available.includes(t)).map(t => ({value: t, label: t}))}
        />
        <View style={styles.toolRow}>
          <View style={styles.kinds}>
            {kinds.map(([k, Icon, label]) => (
              <Pressable
                key={k}
                testID={`chart-kind-${k}`}
                accessibilityRole="button"
                accessibilityLabel={`${label} chart`}
                accessibilityState={{selected: kind === k}}
                onPress={() => setKind(k)}
                style={[styles.kind, kind === k && {backgroundColor: p.raised}]}>
                <Icon size={16} color={kind === k ? p.ink : p.muted} />
              </Pressable>
            ))}
          </View>
          {!compact && catalog.data ? (
            <Button
              testID="open-indicators"
              size="sm"
              variant="ghost"
              title={`Indicators · ${enabled.length}`}
              icon={<SlidersHorizontal size={14} color={p.muted} />}
              onPress={() => setPicker(true)}
            />
          ) : null}
          <View style={styles.spacer} />
          {ind.isFetching ? (
            <Txt variant="caption" tone="faint">
              Calculating…
            </Txt>
          ) : null}
          <SourceBadge source={candles.data?.data_source} />
        </View>
        {!compact ? (
          <View style={styles.saveRow}>
            <Button
              testID="save-layout"
              size="sm"
              variant="ghost"
              title="Save layout"
              loading={prefs.isPending}
              icon={<Save size={14} color={p.muted} />}
              onPress={save}
              accessibilityLabel="Save indicators and chart type to your profile"
            />
          </View>
        ) : null}
      </View>
      {candles.isError ? (
        <ErrorState error={candles.error} onRetry={() => candles.refetch()} />
      ) : !candles.data ? (
        <Skeleton height={compact ? 280 : 340} rounded={0} />
      ) : candles.data.candles.length < 2 ? (
        <View style={styles.empty}>
          <Txt variant="small" tone="muted">
            No {tf} bars in the dataset for {symbol}.
          </Txt>
        </View>
      ) : (
        <CandleChart
          candles={candles.data.candles}
          kind={kind}
          overlays={overlays}
          panes={panes}
          intraday={intraday}
          height={compact ? 260 : 320}
          live={liveBar}
        />
      )}
      <Sheet visible={picker} onClose={() => setPicker(false)} scroll testID="indicator-sheet">
        {catalog.data ? <IndicatorPicker catalog={catalog.data} config={config} onChange={setConfig} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6, gap: 4, borderBottomWidth: 1},
  toolRow: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  kinds: {flexDirection: 'row', gap: 2},
  kind: {padding: 6, borderRadius: radius.sm},
  spacer: {flex: 1},
  saveRow: {flexDirection: 'row', justifyContent: 'flex-end'},
  empty: {height: 260, alignItems: 'center', justifyContent: 'center'},
});
