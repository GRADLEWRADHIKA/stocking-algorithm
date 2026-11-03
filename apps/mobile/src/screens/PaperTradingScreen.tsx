import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeIn} from 'react-native-reanimated';
import {Plus} from 'lucide-react-native';
import {errorMessage} from '../api/client';
import {useActiveAccount, useCancelOrder, useOrders, usePositions, useTransactions} from '../api/hooks';
import type {OrderStatus, PaperOrder, PaperPosition, PaperTransaction} from '../api/types';
import {AnimatedNumber} from '../components/AnimatedNumber';
import {Badge, type BadgeTone, SourceBadge} from '../components/Badge';
import {Button} from '../components/Button';
import {Panel} from '../components/Panel';
import {FlashPrice} from '../components/PriceText';
import {Screen} from '../components/Screen';
import {SkeletonRows} from '../components/Skeleton';
import {EmptyState, ErrorState} from '../components/States';
import {Tabs} from '../components/Tabs';
import {toast} from '../components/Toast';
import {Txt} from '../components/Txt';
import {AccountSwitcher, NewAccountButton} from '../components/trading/AccountSwitcher';
import {useTick} from '../hooks/useLiveQuotes';
import {useReduceMotion} from '../hooks/useReduceMotion';
import type {PaperTab, RootScreenProps} from '../navigation/types';
import {changeColor, usePalette} from '../theme';
import {dateTime, inr, pct, price, signedInr} from '../utils/fmt';

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: 'warn',
  OPEN: 'info',
  FILLED: 'up',
  CANCELLED: 'neutral',
  REJECTED: 'down',
};

function PositionRow({x, onPress}: {x: PaperPosition; onPress: () => void}) {
  const p = usePalette();
  const l = useTick(x.symbol);
  const ltp = l?.price ?? x.ltp;
  const mv = ltp * x.quantity;
  const u = mv - x.invested;
  const day = l?.change_pct ?? x.day_change_pct;
  return (
    <Pressable
      testID={`position-${x.symbol}`}
      onPress={onPress}
      accessibilityRole="button"
      style={({pressed}) => [styles.row, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
      <View style={styles.flex}>
        <Txt variant="small" weight="500">
          {x.symbol}
        </Txt>
        <Txt variant="micro" tone="faint" numberOfLines={1}>
          {x.sector}
        </Txt>
        <Txt variant="micro" num tone="muted">
          {x.quantity} × {price(x.avg_price)} · inv {inr(x.invested, 0)}
        </Txt>
      </View>
      <View style={styles.end}>
        <FlashPrice value={ltp} dir={l?.dir} variant="small" />
        <Txt variant="micro" num color={changeColor(p, day)}>
          Day {pct(day)}
        </Txt>
      </View>
      <View style={[styles.end, styles.w96]}>
        <Txt variant="small" num>
          {inr(mv, 0)}
        </Txt>
        <Txt variant="micro" num color={changeColor(p, u)}>
          {signedInr(u, 0)} {pct(x.invested ? (u / x.invested) * 100 : null)}
        </Txt>
      </View>
    </Pressable>
  );
}

function OrderRow({o, onCancel, cancelling}: {o: PaperOrder; onCancel?: () => void; cancelling?: boolean}) {
  const p = usePalette();
  return (
    <Animated.View entering={FadeIn.duration(200)} testID={`order-${o.id}`} style={[styles.row, styles.top, {borderTopColor: p.rule}]}>
      <View style={styles.flex}>
        <View style={styles.inline}>
          <Txt variant="small" weight="600" tone={o.side === 'BUY' ? 'up' : 'down'}>
            {o.side}
          </Txt>
          <Txt variant="small" weight="500">
            {o.symbol}
          </Txt>
          <Badge label={o.status.toLowerCase()} tone={STATUS_TONE[o.status]} />
        </View>
        <Txt variant="micro" tone="muted">
          {o.order_type.replace('_', ' ').toLowerCase()}
          {o.parent_order_id ? ` · child of #${o.parent_order_id}` : ''} · {dateTime(o.created_at)}
        </Txt>
        <Txt variant="micro" num tone="muted">
          Qty {o.filled_quantity}/{o.quantity} · limit/trigger {price(o.limit_price ?? o.trigger_price)} · fill {price(o.avg_fill_price)}
        </Txt>
        {o.rejection_reason ? (
          <Txt variant="micro" tone="down">
            {o.rejection_reason}
          </Txt>
        ) : null}
      </View>
      {onCancel ? <Button size="sm" variant="danger" title="Cancel" loading={cancelling} onPress={onCancel} /> : null}
    </Animated.View>
  );
}

function LedgerRow({t}: {t: PaperTransaction}) {
  const p = usePalette();
  return (
    <View style={[styles.row, {borderTopColor: p.rule}]}>
      <View style={styles.flex}>
        <Txt variant="small">
          {t.type.toLowerCase()} {t.symbol ?? ''}
        </Txt>
        <Txt variant="micro" num tone="muted">
          {dateTime(t.created_at)}
          {t.quantity ? ` · ${t.quantity} @ ${price(t.price)}` : ''}
        </Txt>
      </View>
      <View style={styles.end}>
        <Txt variant="small" num color={changeColor(p, t.amount)}>
          {signedInr(t.amount)}
        </Txt>
        <Txt variant="micro" num tone="muted">
          Bal {inr(t.balance_after)}
        </Txt>
      </View>
    </View>
  );
}

/** Web /paper-trading: account metrics, positions / open / executed / history / ledger, order ticket. */
export function PaperTradingScreen({route, navigation}: RootScreenProps<'PaperTrading'>) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const {active: acc, isLoading, isError, error, refetch} = useActiveAccount();
  const id = acc?.id ?? null;
  const [tab, setTab] = useState<PaperTab>(route.params?.tab ?? 'positions');
  const positions = usePositions(id);
  const orders = useOrders(id);
  const tx = useTransactions(id);
  const cancel = useCancelOrder();

  const all = orders.data ?? [];
  const openOrders = all.filter(o => o.status === 'OPEN' || o.status === 'PENDING');
  const executed = all.filter(o => o.status === 'FILLED');
  const list = tab === 'open' ? openOrders : tab === 'executed' ? executed : all;

  const refresh = () => {
    refetch();
    positions.refetch();
    orders.refetch();
    tx.refetch();
  };

  const newOrder = () => navigation.navigate('OrderTicket', {symbol: ''});

  const metrics: [string, React.ReactNode, string | undefined][] = acc
    ? [
        [
          'Equity',
          <AnimatedNumber key="e" value={acc.equity} format={v => inr(v, 0)} variant="h2" weight="400" />,
          undefined,
        ],
        ['Available cash', inr(acc.cash_balance, 0), undefined],
        ['Blocked for orders', inr(acc.blocked_margin, 0), p.muted],
        ['Realised P&L', signedInr(acc.realized_pnl, 0), changeColor(p, acc.realized_pnl)],
        ['Unrealised P&L', signedInr(acc.unrealized_pnl, 0), changeColor(p, acc.unrealized_pnl)],
        ['Return since start', pct(acc.total_return_pct), changeColor(p, acc.total_return_pct)],
      ]
    : [];

  return (
    <Screen
      back
      testID="paper-trading-screen"
      title="Paper trading"
      subtitle="Simulated orders against the local market feed. Virtual money only."
      refreshing={orders.isRefetching}
      onRefresh={refresh}
      headerExtra={
        <View style={styles.actions}>
          <SourceBadge source="PAPER_TRADING" />
          <View style={styles.spacer} />
          <AccountSwitcher />
          <NewAccountButton />
        </View>
      }>
      {isLoading ? (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      ) : isError ? (
        <Panel>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Panel>
      ) : !acc ? (
        <Panel>
          <EmptyState
            title="No paper account"
            body="Create one with virtual capital to start trading."
            action={<NewAccountButton variant="primary" />}
          />
        </Panel>
      ) : (
        <>
          <Panel index={0}>
            <View style={styles.metrics}>
              {metrics.map(([k, v, c]) => (
                <View key={k} style={[styles.metric, {borderColor: p.rule}]}>
                  <Txt variant="caption" tone="muted">
                    {k}
                  </Txt>
                  {typeof v === 'string' ? (
                    <Txt variant="body" num color={c} numberOfLines={1} style={styles.metricVal}>
                      {v}
                    </Txt>
                  ) : (
                    v
                  )}
                </View>
              ))}
            </View>
          </Panel>

          <Button
            testID="new-order"
            title="New order"
            variant="primary"
            icon={<Plus size={14} color={p.ground} />}
            onPress={newOrder}
          />

          <Panel
            index={1}
            titleNode={
              <Tabs<PaperTab>
                ruled={false}
                size="sm"
                value={tab}
                onChange={setTab}
                testID="paper-tabs"
                items={[
                  {value: 'positions', label: `Positions · ${positions.data?.length ?? 0}`},
                  {value: 'open', label: `Open orders · ${openOrders.length}`},
                  {value: 'executed', label: 'Executed'},
                  {value: 'history', label: 'Order history'},
                  {value: 'ledger', label: 'Ledger'},
                ]}
              />
            }>
            <Animated.View key={tab} entering={reduce ? undefined : FadeIn.duration(150)}>
              {tab === 'positions' ? (
                positions.isLoading ? (
                  <SkeletonRows />
                ) : positions.isError ? (
                  <ErrorState error={positions.error} onRetry={() => positions.refetch()} />
                ) : (positions.data ?? []).length === 0 ? (
                  <EmptyState title="No open positions" body="Buy something with New order." />
                ) : (
                  <View style={styles.list}>
                    <View style={styles.listHead}>
                      <SourceBadge source="SIMULATED" />
                    </View>
                    {positions.data!.map(x => (
                      <PositionRow key={x.symbol} x={x} onPress={() => navigation.navigate('StockDetail', {symbol: x.symbol})} />
                    ))}
                  </View>
                )
              ) : null}

              {tab === 'open' || tab === 'executed' || tab === 'history' ? (
                orders.isLoading ? (
                  <SkeletonRows />
                ) : orders.isError ? (
                  <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
                ) : list.length === 0 ? (
                  <EmptyState title={tab === 'open' ? 'No working orders' : 'No orders yet'} />
                ) : (
                  <View style={styles.list}>
                    {list.map(o => (
                      <OrderRow
                        key={o.id}
                        o={o}
                        cancelling={cancel.isPending && cancel.variables?.orderId === o.id}
                        onCancel={
                          o.status === 'OPEN' || o.status === 'PENDING'
                            ? () =>
                                cancel.mutate(
                                  {accountId: acc.id, orderId: o.id},
                                  {
                                    onSuccess: () => toast.success(`Order #${o.id} cancelled`),
                                    onError: e => toast.error(errorMessage(e)),
                                  },
                                )
                            : undefined
                        }
                      />
                    ))}
                  </View>
                )
              ) : null}

              {tab === 'ledger' ? (
                tx.isLoading ? (
                  <SkeletonRows />
                ) : tx.isError ? (
                  <ErrorState error={tx.error} onRetry={() => tx.refetch()} />
                ) : (tx.data ?? []).length === 0 ? (
                  <EmptyState title="No transactions" />
                ) : (
                  <View style={styles.list}>
                    {tx.data!.map(t => (
                      <LedgerRow key={t.id} t={t} />
                    ))}
                  </View>
                )
              ) : null}
            </Animated.View>
          </Panel>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0, gap: 2},
  end: {alignItems: 'flex-end', gap: 2},
  w96: {minWidth: 96},
  inline: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  actions: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  spacer: {flex: 1},
  metrics: {flexDirection: 'row', flexWrap: 'wrap'},
  metric: {width: '50%', paddingHorizontal: 16, paddingVertical: 12, borderRightWidth: 1, borderBottomWidth: 1, gap: 4},
  metricVal: {fontSize: 17, lineHeight: 22},
  list: {},
  listHead: {paddingHorizontal: 16, paddingVertical: 8},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1},
  top: {alignItems: 'flex-start'},
});
