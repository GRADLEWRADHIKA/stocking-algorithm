import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Search} from 'lucide-react-native';
import {useOverview, useStocks} from '../api/hooks';
import {Button, ErrorState, PageHeader, Panel, Screen, Segmented, SkeletonRows, SourceBadge, Txt} from '../components';
import {BreadthBar, Heatmap, IndexStrip, QuoteList, SectorBars} from '../components/market/MarketBlocks';
import type {TabScreenProps} from '../navigation/types';
import {alpha, usePalette} from '../theme';
import {compact} from '../utils/fmt';
import {HeaderActions} from './shared';

export function MarketsScreen({navigation}: TabScreenProps<'Markets'>) {
  const p = usePalette();
  const overview = useOverview();
  const stocks = useStocks({limit: 200, sort: '-change_pct'});
  const [sizeBy, setSizeBy] = useState<'mcap' | 'equal'>('mcap');
  const o = overview.data;
  const openStock = (symbol: string) => navigation.navigate('StockDetail', {symbol});

  return (
    <Screen
      testID="markets-screen"
      refreshing={overview.isRefetching}
      onRefresh={() => {
        overview.refetch();
        stocks.refetch();
      }}>
      <View style={styles.top}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <PageHeader
              title="Markets"
              sub={
                <>
                  <Txt variant="small" tone="muted">
                    NSE and BSE universe, intraday heat by percentage change
                  </Txt>
                  <SourceBadge source={o?.data_source} />
                </>
              }
            />
          </View>
          <HeaderActions search={false} />
        </View>
        <Button
          size="sm"
          title="Open the stock explorer"
          testID="markets-open-explorer"
          icon={<Search size={14} color={p.ink} />}
          onPress={() => navigation.navigate('Explorer')}
        />
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
            title="Heat map by sector"
            action={
              <Segmented
                value={sizeBy}
                onChange={setSizeBy}
                testID="heat-size"
                options={[
                  {value: 'mcap', label: 'Size by market cap'},
                  {value: 'equal', label: 'Equal size'},
                ]}
              />
            }>
            {stocks.isError ? (
              <ErrorState error={stocks.error} onRetry={() => stocks.refetch()} />
            ) : stocks.data ? (
              <Heatmap stocks={stocks.data.items} sizeBy={sizeBy} onPress={openStock} />
            ) : (
              <SkeletonRows rows={6} />
            )}
          </Panel>
          <Panel index={2} title="Sector performance" padded>
            {o ? (
              <View style={styles.gap}>
                <BreadthBar {...o.breadth} />
                <SectorBars sectors={o.sectors} onSector={sector => navigation.navigate('Explorer', {sector})} />
              </View>
            ) : (
              <SkeletonRows rows={8} />
            )}
          </Panel>
          <Panel index={3} title="Most active by traded value">
            {o ? <QuoteList rows={o.most_active} metric="value" limit={8} onPress={openStock} /> : <SkeletonRows />}
          </Panel>
          <Panel index={4} title="Highest volume">
            {o ? (
              <View>
                {o.highest_volume.slice(0, 8).map((q, i) => (
                  <Pressable
                    key={q.symbol}
                    onPress={() => openStock(q.symbol)}
                    accessibilityRole="button"
                    style={({pressed}) => [
                      styles.volRow,
                      i > 0 && {borderTopWidth: 1, borderTopColor: p.rule},
                      pressed && {backgroundColor: alpha(p.raised, 0.6)},
                    ]}>
                    <Txt variant="small" weight="500" style={styles.flex}>
                      {q.symbol}
                    </Txt>
                    <Txt variant="small" num>
                      {compact(q.volume)}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            ) : (
              <SkeletonRows />
            )}
          </Panel>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  top: {paddingTop: 8, gap: 8},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  gap: {gap: 20},
  volRow: {flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 16},
});
