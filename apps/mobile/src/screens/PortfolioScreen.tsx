import React, {useMemo, useState} from 'react';
import {Pressable, Share, StyleSheet, View} from 'react-native';
import {Download} from 'lucide-react-native';
import {errorMessage} from '../api/client';
import {api} from '../api/endpoints';
import {useActiveAccount, usePortfolio} from '../api/hooks';
import type {PaperPosition} from '../api/types';
import {AnimatedNumber} from '../components/AnimatedNumber';
import {SourceBadge} from '../components/Badge';
import {Button} from '../components/Button';
import {HeadLink, KV, Panel} from '../components/Panel';
import {Screen} from '../components/Screen';
import {SkeletonRows} from '../components/Skeleton';
import {EmptyState, ErrorState} from '../components/States';
import {toast} from '../components/Toast';
import {Txt} from '../components/Txt';
import {Donut} from '../components/charts/Donut';
import {LineChart} from '../components/charts/LineChart';
import {AccountSwitcher, NewAccountButton} from '../components/trading/AccountSwitcher';
import {useTick} from '../hooks/useLiveQuotes';
import type {TabScreenProps} from '../navigation/types';
import {changeColor, usePalette} from '../theme';
import {inr, pct, price, signedInr} from '../utils/fmt';
import {HeaderActions} from './shared';

/** Web CSV filename: quantdesk-paper-<account>.csv */
export function reportFileName(accountName: string): string {
  return `quantdesk-paper-${accountName.replace(/\W+/g, '-').toLowerCase()}.csv`;
}

function Holding({x, onPress}: {x: PaperPosition; onPress: () => void}) {
  const p = usePalette();
  const l = useTick(x.symbol);
  const ltp = l?.price ?? x.ltp;
  const mv = l ? ltp * x.quantity : x.market_value;
  const u = l ? mv - x.invested : x.unrealized_pnl;
  const up = l ? (x.invested ? (u / x.invested) * 100 : null) : x.unrealized_pnl_pct;
  return (
    <Pressable
      testID={`holding-${x.symbol}`}
      onPress={onPress}
      accessibilityRole="button"
      style={({pressed}) => [styles.row, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
      <View style={styles.flex}>
        <Txt variant="small" weight="500">
          {x.symbol}
        </Txt>
        <Txt variant="micro" num tone="faint">
          {x.quantity} × {price(x.avg_price)}
        </Txt>
      </View>
      <Txt variant="small" num>
        {inr(mv, 0)}
      </Txt>
      <View style={styles.pnl}>
        <Txt variant="small" num color={changeColor(p, u)}>
          {signedInr(u, 0)}
        </Txt>
        <Txt variant="micro" num color={changeColor(p, u)}>
          {pct(up)}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Web /portfolio: equity, equity history, risk, statistics, allocation donuts, holdings, CSV report. */
export function PortfolioScreen({navigation}: TabScreenProps<'Portfolio'>) {
  const p = usePalette();
  const {active: acc, isLoading: accLoading} = useActiveAccount();
  const q = usePortfolio(acc?.id ?? null);
  const [downloading, setDownloading] = useState(false);
  const d = q.data;

  const eq = useMemo(
    () => (d ? [{key: 'equity', color: p.accent, area: true, values: d.equity_history.map(x => x.equity)}] : []),
    [d, p.accent],
  );

  const download = async () => {
    if (!acc) {
      return;
    }
    setDownloading(true);
    try {
      const csv = await api.portfolio.reportCsv(acc.id);
      await Share.share({title: reportFileName(acc.name), message: csv});
    } catch (e) {
      toast.error('Report failed', {description: errorMessage(e)});
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Screen
      testID="portfolio-screen"
      title="Portfolio"
      subtitle={acc ? `${acc.name}, valued at simulated prices` : 'Paper portfolios'}
      right={<HeaderActions />}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      headerExtra={
        <View style={styles.actions}>
          <SourceBadge source="PAPER_TRADING" />
          <View style={styles.spacer} />
          <AccountSwitcher />
          <Button
            testID="csv-report"
            size="sm"
            title="CSV report"
            icon={<Download size={14} color={p.ink} />}
            loading={downloading}
            disabled={!acc}
            onPress={download}
          />
        </View>
      }>
      {accLoading ? (
        <Panel>
          <SkeletonRows rows={10} />
        </Panel>
      ) : !acc ? (
        <Panel>
          <EmptyState title="No paper account" action={<NewAccountButton variant="primary" />} />
        </Panel>
      ) : q.isError ? (
        <Panel>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Panel>
      ) : !d ? (
        <Panel>
          <SkeletonRows rows={10} />
        </Panel>
      ) : (
        <>
          <Panel index={0} padded>
            <Txt variant="caption" tone="muted">
              Equity
            </Txt>
            <AnimatedNumber testID="portfolio-equity" value={d.account.equity} format={v => inr(v)} variant="display" style={styles.equity} />
            <View style={styles.subline}>
              <Txt variant="caption" tone="muted">
                Invested{' '}
                <Txt variant="caption" num>
                  {inr(d.account.holdings_value - d.account.unrealized_pnl, 0)}
                </Txt>
              </Txt>
              <Txt variant="caption" tone="muted">
                Today{' '}
                <Txt variant="caption" num color={changeColor(p, d.account.day_pnl)}>
                  {signedInr(d.account.day_pnl, 0)}
                </Txt>
              </Txt>
              <Txt variant="caption" tone="muted">
                Since start{' '}
                <Txt variant="caption" num color={changeColor(p, d.account.total_return_pct)}>
                  {pct(d.account.total_return_pct)}
                </Txt>{' '}
                on {inr(d.account.initial_capital, 0)}
              </Txt>
            </View>
            <View style={styles.chart}>
              {eq[0] && eq[0].values.length > 1 ? (
                <LineChart series={eq} height={200} formatY={v => `₹${(v / 100000).toFixed(2)}L`} testID="equity-chart" />
              ) : (
                <EmptyState title="Equity history starts after the first trading day" />
              )}
            </View>
          </Panel>

          <Panel index={1} title="Risk exposure" bodyStyle={styles.kvBody}>
            <KV first k="Largest position" v={pct(d.risk.largest_position_pct, 1, false)} color={d.risk.largest_position_pct > 25 ? p.warn : undefined} />
            <KV k="Top sector weight" v={pct(d.risk.top_sector_pct, 1, false)} color={d.risk.top_sector_pct > 40 ? p.warn : undefined} />
            <KV k="Cash" v={pct(d.risk.cash_pct, 1, false)} />
            <KV k="Volatility (ann.)" v={pct(d.risk.portfolio_volatility_pct, 1, false)} />
            <KV k="Beta vs NIFTY 50" v={d.risk.portfolio_beta?.toFixed(2) ?? '—'} />
            <KV k="1-day VaR, 95%" v={d.risk.var_95_1d === null ? '—' : inr(d.risk.var_95_1d, 0)} />
          </Panel>

          <Panel index={2} title="Trading statistics" bodyStyle={styles.kvBody}>
            <KV first k="Closed trades" v={String(d.stats.total_trades)} />
            <KV k="Won / lost" v={`${d.stats.winning_trades} / ${d.stats.losing_trades}`} />
            <KV k="Win rate" v={d.stats.win_rate === null ? '—' : pct(d.stats.win_rate, 1, false)} />
            <KV k="Best / worst" v={`${signedInr(d.stats.best_trade, 0)} / ${signedInr(d.stats.worst_trade, 0)}`} />
            <KV k="Avg holding" v={d.stats.avg_holding_days === null ? '—' : `${d.stats.avg_holding_days.toFixed(1)} days`} />
          </Panel>

          <Panel index={3} title="By holding" padded>
            {d.allocation_by_symbol.length ? (
              <Donut testID="donut-holding" parts={d.allocation_by_symbol} center={`${d.allocation_by_symbol.length} lines`} />
            ) : (
              <EmptyState title="All cash" />
            )}
          </Panel>
          <Panel index={4} title="By sector" padded>
            {d.allocation_by_sector.length ? (
              <Donut testID="donut-sector" parts={d.allocation_by_sector} center={`${d.allocation_by_sector.length} sectors`} />
            ) : (
              <EmptyState title="All cash" />
            )}
          </Panel>

          <Panel
            index={5}
            title="Holdings"
            action={
              <>
                <SourceBadge source="SIMULATED" />
                <HeadLink label="Trade" testID="portfolio-trade" onPress={() => navigation.navigate('PaperTrading')} />
              </>
            }>
            {d.positions.length === 0 ? (
              <EmptyState title="No holdings" />
            ) : (
              <View>
                <View style={[styles.row, styles.head]}>
                  <Txt variant="caption" tone="muted" style={styles.flex}>
                    Symbol
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    Value
                  </Txt>
                  <Txt variant="caption" tone="muted" align="right" style={styles.pnl}>
                    P&L
                  </Txt>
                </View>
                {d.positions.map(x => (
                  <Holding key={x.symbol} x={x} onPress={() => navigation.navigate('StockDetail', {symbol: x.symbol})} />
                ))}
              </View>
            )}
          </Panel>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  actions: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  spacer: {flex: 1},
  equity: {fontSize: 32, lineHeight: 38, marginTop: 2},
  subline: {flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2, marginTop: 4},
  chart: {marginTop: 16},
  kvBody: {paddingHorizontal: 16, paddingVertical: 4},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1},
  head: {borderTopWidth: 0, paddingVertical: 8},
  pnl: {minWidth: 92, alignItems: 'flex-end'},
});
