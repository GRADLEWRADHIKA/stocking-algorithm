import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import type {BacktestMetrics, BacktestResult} from '../../api/types';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {alpha, changeColor, usePalette} from '../../theme';
import {dateTime, inr, pct, price, signedInr} from '../../utils/fmt';
import {AnimatedNumber} from '../AnimatedNumber';
import {SourceBadge} from '../Badge';
import {Bullet, Panel} from '../Panel';
import {EmptyState} from '../States';
import {Tabs} from '../Tabs';
import {Txt} from '../Txt';
import {LineChart} from '../charts/LineChart';

/** Same eight figures as the web MetricStrip. */
export function MetricStrip({m}: {m: BacktestMetrics}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const cells: [string, React.ReactNode][] = [
    [
      'Net profit',
      <AnimatedNumber key="np" variant="h2" weight="400" value={m.net_profit} format={v => signedInr(v, 0)} color={changeColor(p, m.net_profit)} />,
    ],
    [
      'Total return',
      <AnimatedNumber key="tr" variant="h2" weight="400" value={m.total_return_pct} format={v => pct(v)} color={changeColor(p, m.total_return_pct)} />,
    ],
    ['Annualised', <Cell key="an" v={pct(m.annualized_return_pct)} c={changeColor(p, m.annualized_return_pct)} />],
    ['Buy and hold', <Cell key="bh" v={pct(m.buy_and_hold_return_pct)} c={p.muted} />],
    ['Max drawdown', <Cell key="dd" v={pct(-Math.abs(m.max_drawdown_pct))} c={p.down} />],
    ['Sharpe', <Cell key="sh" v={m.sharpe_ratio?.toFixed(2) ?? '—'} />],
    ['Profit factor', <Cell key="pf" v={m.profit_factor?.toFixed(2) ?? '—'} />],
    ['Win rate', <Cell key="wr" v={m.win_rate === null ? '—' : pct(m.win_rate, 1, false)} />],
  ];
  return (
    <View style={styles.strip} testID="metric-strip">
      {cells.map(([k, v], i) => (
        <Animated.View
          key={k}
          entering={reduce ? undefined : FadeInDown.delay(i * 40).duration(300)}
          style={[styles.cell, {borderColor: p.rule}, i % 2 === 1 && styles.cellRight]}>
          <Txt variant="caption" tone="muted">
            {k}
          </Txt>
          {v}
        </Animated.View>
      ))}
    </View>
  );
}

function Cell({v, c}: {v: string; c?: string}) {
  return (
    <Txt variant="h2" weight="400" num color={c} numberOfLines={1}>
      {v}
    </Txt>
  );
}

const FIELDS: [string, (m: BacktestMetrics) => string][] = [
  ['Final capital', m => inr(m.final_capital, 0)],
  ['Net profit', m => signedInr(m.net_profit, 0)],
  ['Total return', m => pct(m.total_return_pct)],
  ['Annualised return', m => pct(m.annualized_return_pct)],
  ['Trades', m => String(m.num_trades)],
  ['Winning / losing', m => `${m.winning_trades} / ${m.losing_trades}`],
  ['Win rate', m => (m.win_rate === null ? '—' : pct(m.win_rate, 1, false))],
  ['Average win', m => signedInr(m.avg_win, 0)],
  ['Average loss', m => signedInr(m.avg_loss, 0)],
  ['Average trade', m => pct(m.avg_trade_return_pct)],
  ['Max drawdown', m => pct(-Math.abs(m.max_drawdown_pct))],
  ['Sharpe ratio', m => m.sharpe_ratio?.toFixed(2) ?? '—'],
  ['Sortino ratio', m => m.sortino_ratio?.toFixed(2) ?? '—'],
  ['Profit factor', m => m.profit_factor?.toFixed(2) ?? '—'],
  ['Time in market', m => pct(m.exposure_pct, 1, false)],
  ['Costs paid', m => inr(m.total_costs, 0)],
];

export function MetricsTable({rows}: {rows: {label: string; m: BacktestMetrics | null}[]}) {
  const p = usePalette();
  return (
    <View testID="metrics-table">
      <View style={styles.tr}>
        <Txt variant="micro" tone="muted" style={styles.th}>
          Metric
        </Txt>
        {rows.map(r => (
          <Txt key={r.label} variant="micro" tone="muted" align="right" style={styles.td}>
            {r.label}
          </Txt>
        ))}
      </View>
      {FIELDS.map(([k, f]) => (
        <View key={k} style={[styles.tr, {borderTopColor: p.rule, borderTopWidth: 1}]}>
          <Txt variant="caption" tone="muted" style={styles.th}>
            {k}
          </Txt>
          {rows.map(r => (
            <Txt key={r.label} variant="caption" num align="right" style={styles.td} numberOfLines={1}>
              {r.m ? f(r.m) : '—'}
            </Txt>
          ))}
        </View>
      ))}
    </View>
  );
}

function Legend({items}: {items: {name: string; color: string; dashed?: boolean}[]}) {
  return (
    <View style={styles.legend}>
      {items.map(i => (
        <View key={i.name} style={styles.legendItem}>
          <View style={[styles.swatch, {backgroundColor: i.color, opacity: i.dashed ? 0.7 : 1}]} />
          <Txt variant="caption" tone="muted">
            {i.name}
          </Txt>
        </View>
      ))}
    </View>
  );
}

type Tab = 'equity' | 'drawdown' | 'trades' | 'split' | 'assumptions';

/** Web Results panel: metric strip, equity vs buy-and-hold, drawdown, trades, in/out of sample, assumptions. */
export function BacktestResults({r, index = 0}: {r: BacktestResult; index?: number}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [tab, setTab] = useState<Tab>('equity');
  const intraday = !['1d', '1w', '1M'].includes(r.config.timeframe);
  const eq = useMemo(
    () => [
      {key: 'eq', values: r.equity_curve.map(x => x.equity), color: p.accent, strokeWidth: 2},
      {key: 'bh', values: r.equity_curve.map(x => x.benchmark), color: p.muted, dashed: true},
    ],
    [r, p],
  );
  const dd = useMemo(() => [{key: 'dd', values: r.drawdown_curve.map(x => -Math.abs(x.drawdown_pct)), color: p.down, area: true}], [r, p]);
  const first = r.equity_curve[0]?.time;
  const last = r.equity_curve[r.equity_curve.length - 1]?.time;

  return (
    <Panel
      index={index}
      testID="backtest-results"
      titleNode={
        <View>
          <Txt variant="title" numberOfLines={2}>
            {r.strategy_name} on {r.symbol} · {r.config.timeframe}
          </Txt>
          <Txt variant="micro" num tone="muted">
            {dateTime(r.period.start, false)} → {dateTime(r.period.end, false)} · {r.bars} bars
          </Txt>
        </View>
      }
      action={<SourceBadge source={r.data_source} />}>
      <MetricStrip m={r.metrics} />
      <View style={styles.tabs}>
        <Tabs
          value={tab}
          onChange={setTab}
          testID="backtest-tabs"
          items={[
            {value: 'equity', label: 'Equity curve'},
            {value: 'drawdown', label: 'Drawdown'},
            {value: 'trades', label: `Trades · ${r.trades.length}`},
            {value: 'split', label: 'In / out of sample', disabled: !r.out_of_sample},
            {value: 'assumptions', label: 'Assumptions'},
          ]}
        />
      </View>
      <Animated.View key={tab} entering={reduce ? undefined : FadeIn.duration(150)} style={styles.tabBody}>
        {tab === 'equity' ? (
          <>
            <Legend
              items={[
                {name: 'Strategy equity', color: p.accent},
                {name: 'Buy and hold', color: p.muted, dashed: true},
              ]}
            />
            <LineChart series={eq} height={240} formatY={v => `₹${(v / 1000).toFixed(0)}K`} transitionKey={`eq${r.id}`} testID="equity-chart" />
            <View style={styles.axis}>
              <Txt variant="micro" num tone="faint">
                {first ? dateTime(first, intraday) : ''}
              </Txt>
              <Txt variant="micro" num tone="faint">
                {last ? dateTime(last, intraday) : ''}
              </Txt>
            </View>
          </>
        ) : null}
        {tab === 'drawdown' ? (
          <LineChart series={dd} height={200} formatY={v => `${v.toFixed(1)}%`} refLines={[{value: 0}]} transitionKey={`dd${r.id}`} testID="drawdown-chart" />
        ) : null}
        {tab === 'trades' ? (
          r.trades.length === 0 ? (
            <EmptyState
              title="The strategy never entered a trade in this period"
              body="Entry conditions were not met on any bar. Try a longer period or looser rules."
            />
          ) : (
            <View>
              {r.trades.map((t, i) => (
                <View key={i} style={[styles.trade, i > 0 && {borderTopColor: p.rule, borderTopWidth: 1}]}>
                  <View style={styles.tradeTop}>
                    <Txt variant="caption" num tone="muted" style={styles.flex}>
                      {dateTime(t.entry_time, intraday)} → {dateTime(t.exit_time, intraday)}
                    </Txt>
                    <Txt variant="small" num color={changeColor(p, t.pnl)}>
                      {signedInr(t.pnl, 0)}
                    </Txt>
                  </View>
                  <View style={styles.tradeTop}>
                    <Txt variant="caption" num style={styles.flex}>
                      {t.quantity} × {price(t.entry_price)} → {price(t.exit_price)}
                    </Txt>
                    <Txt variant="caption" num color={changeColor(p, t.pnl_pct)}>
                      {pct(t.pnl_pct)}
                    </Txt>
                  </View>
                  <Txt variant="micro" num tone="faint">
                    Costs {price(t.costs)} · {t.bars_held} bars · {t.exit_reason.replace(/_/g, ' ').toLowerCase()}
                  </Txt>
                </View>
              ))}
            </View>
          )
        ) : null}
        {tab === 'split' ? (
          <>
            <Txt variant="caption" tone="muted" style={styles.mb12}>
              The last {r.config.out_of_sample_pct}% of bars were held out. Indicators warmed up on earlier data only. A large gap between the columns suggests
              the rules fit the past more than they generalise.
            </Txt>
            <MetricsTable
              rows={[
                {label: 'Whole period', m: r.metrics},
                {label: 'In sample', m: r.in_sample},
                {label: 'Out of sample', m: r.out_of_sample},
              ]}
            />
          </>
        ) : null}
        {tab === 'assumptions' ? (
          <View style={styles.gap8}>
            {r.assumptions.map(a => (
              <Bullet key={a}>{a}</Bullet>
            ))}
          </View>
        ) : null}
      </Animated.View>
      <View style={[styles.foot, {borderTopColor: p.rule, backgroundColor: alpha(p.surface, 1)}]}>
        <Txt variant="micro" tone="faint">
          Simulated results on {r.data_source === 'SIMULATED' ? 'generated' : 'historical'} data after modelled costs and slippage. Past performance does not
          indicate future results.
        </Txt>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  strip: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {width: '50%', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderRightWidth: 1, gap: 2},
  cellRight: {borderRightWidth: 0},
  tabs: {paddingHorizontal: 16, paddingTop: 12},
  tabBody: {padding: 16},
  legend: {flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginBottom: 8},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 6},
  swatch: {width: 12, height: 2, borderRadius: 1},
  axis: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 4},
  tr: {flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 6},
  th: {flex: 1.3},
  td: {flex: 1},
  trade: {paddingVertical: 10, gap: 2},
  tradeTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
  mb12: {marginBottom: 12},
  gap8: {gap: 8},
  foot: {borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 8},
});
