import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Animated, {FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {AlertTriangle} from 'lucide-react-native';
import {errorMessage} from '../../api/client';
import {useActiveAccount, usePlaceOrder, usePositions, useStocks} from '../../api/hooks';
import type {OrderSide, PaperOrder} from '../../api/types';
import {useDebounced} from '../../hooks/useDebounced';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {useTick} from '../../hooks/useLiveQuotes';
import {alpha, radius, usePalette} from '../../theme';
import {inr, pct, price} from '../../utils/fmt';
import {orderOutcome, orderSentence, validateOrder} from '../../utils/orderValidation';
import {Badge} from '../Badge';
import {Button} from '../Button';
import {SelectField} from '../SelectField';
import {Sheet} from '../Sheet';
import {TextField} from '../TextField';
import {toast} from '../Toast';
import {Txt} from '../Txt';

/** BUY / SELL toggle with a sliding emerald / red thumb (web: spring 500/40). */
export function SideToggle({value, onChange}: {value: OrderSide; onChange: (s: OrderSide) => void}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const half = Math.max(0, (w - 4) / 2);
  useEffect(() => {
    const target = value === 'BUY' ? 0 : half;
    x.value = reduce ? target : withSpring(target, {stiffness: 500, damping: 40});
  }, [value, half, reduce, x]);
  const thumb = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));
  return (
    <View
      testID="side-toggle"
      accessibilityRole="radiogroup"
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[styles.toggle, {backgroundColor: p.raised}]}>
      {w > 0 ? (
        <Animated.View style={[styles.thumb, {width: half, backgroundColor: value === 'BUY' ? p.up : p.down}, thumb]} />
      ) : null}
      {(['BUY', 'SELL'] as const).map(s => (
        <Pressable
          key={s}
          testID={`side-${s}`}
          accessibilityRole="radio"
          accessibilityState={{selected: value === s}}
          accessibilityLabel={s === 'BUY' ? 'Buy' : 'Sell'}
          onPress={() => onChange(s)}
          style={styles.toggleBtn}>
          <Txt variant="small" weight="600" color={value === s ? p.onFill : p.muted}>
            {s === 'BUY' ? 'Buy' : 'Sell'}
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}

/** Symbol picker for the unbound ticket (web SymbolSearch). */
function SymbolPicker({onPick}: {onPick: (s: string, price: number) => void}) {
  const p = usePalette();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const res = useStocks({q: dq, limit: 6, sort: 'symbol'}, dq.trim().length > 0);
  return (
    <View style={styles.gap4}>
      <TextField label="Stock" placeholder="Pick a stock" value={q} onChangeText={setQ} autoCapitalize="characters" testID="ticket-symbol-search" />
      {dq.trim() && res.data ? (
        <View style={[styles.results, {borderColor: p.line}]}>
          {res.data.items.length === 0 ? (
            <Txt variant="caption" tone="muted" style={styles.pad}>
              No matching instruments
            </Txt>
          ) : (
            res.data.items.map((s, i) => (
              <Pressable
                key={s.symbol}
                testID={`ticket-pick-${s.symbol}`}
                onPress={() => onPick(s.symbol, s.price)}
                style={({pressed}) => [styles.result, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
                <View style={styles.flex}>
                  <Txt variant="small" weight="500">
                    {s.symbol}
                  </Txt>
                  <Txt variant="caption" tone="muted" numberOfLines={1}>
                    {s.name}
                  </Txt>
                </View>
                <Txt variant="caption" num>
                  {price(s.price)}
                </Txt>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

export interface OrderTicketFormProps {
  symbol?: string;
  refPrice?: number;
  defaultSide?: OrderSide;
  onDone?: (order: PaperOrder) => void;
  onNoAccount?: () => void;
}

/** Simulated order entry. Validates locally, then the engine validates again and is authoritative. */
export function OrderTicketForm({symbol: fixedSymbol, refPrice, defaultSide = 'BUY', onDone, onNoAccount}: OrderTicketFormProps) {
  const p = usePalette();
  const {accounts, active: account, setAccountId} = useActiveAccount();
  const positions = usePositions(account?.id);
  const place = usePlaceOrder();
  const [symbol, setSymbol] = useState(fixedSymbol ?? '');
  const [pickedPrice, setPickedPrice] = useState<number | undefined>(refPrice);
  const [side, setSide] = useState<OrderSide>(defaultSide);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    if (fixedSymbol) {
      setSymbol(fixedSymbol);
    }
  }, [fixedSymbol]);

  const live = useTick(symbol || undefined);
  const ltp = live?.price ?? pickedPrice ?? null;
  const held = positions.data?.find(x => x.symbol === symbol)?.quantity ?? 0;
  const cash = account?.cash_balance ?? null;
  const v = validateOrder({side, orderType, quantity, limitPrice, stopLoss, takeProfit}, ltp, cash, held);
  const buy = side === 'BUY';
  const showErr = (k: keyof typeof v.errors) => (tried ? v.errors[k] : undefined);

  if (!account) {
    return (
      <View style={styles.gap8}>
        <Txt variant="small" tone="muted">
          Create a paper account on the Paper Trading screen first.
        </Txt>
        {onNoAccount ? <Button title="Open paper trading" variant="primary" size="sm" onPress={onNoAccount} /> : null}
      </View>
    );
  }

  const review = () => {
    setTried(true);
    setRejected(null);
    // funds is a hint only (the engine decides); every other error blocks review
    const blocking = Object.keys(v.errors).filter(k => k !== 'funds');
    if (!symbol || blocking.length) {
      return;
    }
    setConfirming(true);
  };

  const submit = () => {
    if (v.quantity === null) {
      return;
    }
    place.mutate(
      {
        accountId: account.id,
        body: {
          symbol,
          side,
          order_type: orderType,
          quantity: v.quantity,
          limit_price: orderType === 'LIMIT' ? v.limitPrice : null,
          stop_loss: v.stopLoss,
          take_profit: v.takeProfit,
        },
      },
      {
        onSuccess: res => {
          setConfirming(false);
          const out = orderOutcome(res);
          if (out.kind === 'rejected') {
            setRejected(out.description);
            toast.error(out.title, {description: out.description});
            return;
          }
          toast.success(out.title, {description: out.description});
          onDone?.(res);
        },
        onError: e => {
          setConfirming(false);
          toast.error('Order not accepted', {description: errorMessage(e)});
        },
      },
    );
  };

  return (
    <View style={styles.gap12} testID="order-ticket">
      <View style={styles.between}>
        <Badge label="Paper trading" tone="accent" />
        {accounts.length > 1 ? (
          <SelectField
            size="sm"
            accessibilityLabel="Paper account"
            title="Paper account"
            value={String(account.id)}
            options={accounts.map(a => ({value: String(a.id), label: a.name}))}
            onChange={id => setAccountId(Number(id))}
            style={styles.acct}
          />
        ) : (
          <Txt variant="caption" tone="muted">
            {account.name}
          </Txt>
        )}
      </View>

      <SideToggle value={side} onChange={setSide} />

      {!fixedSymbol ? (
        symbol ? (
          <View style={styles.gap4}>
            <Txt variant="caption" tone="muted">
              Stock
            </Txt>
            <View style={[styles.picked, {borderColor: p.line}]}>
              <Txt variant="small" weight="500">
                {symbol}
              </Txt>
              <Pressable onPress={() => setSymbol('')} hitSlop={8} accessibilityRole="button">
                <Txt variant="caption" tone="muted">
                  Change
                </Txt>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <SymbolPicker
              onPick={(s, px) => {
                setSymbol(s);
                setPickedPrice(px);
              }}
            />
            {tried ? (
              <Txt variant="caption" tone="down">
                Choose a stock
              </Txt>
            ) : null}
          </>
        )
      ) : null}

      <View style={styles.grid}>
        <SelectField
          label="Order type"
          testID="order-type"
          value={orderType}
          options={[
            {value: 'MARKET', label: 'Market'},
            {value: 'LIMIT', label: 'Limit'},
          ]}
          onChange={setOrderType}
          style={styles.flex}
        />
        <TextField
          label="Quantity"
          testID="order-qty"
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          error={showErr('quantity')}
          hint={side === 'SELL' ? `${held} held` : undefined}
          containerStyle={styles.flex}
        />
      </View>
      {orderType === 'LIMIT' ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
          <TextField
            label="Limit price ₹"
            testID="order-limit"
            value={limitPrice}
            onChangeText={setLimitPrice}
            keyboardType="decimal-pad"
            placeholder={ltp ? price(ltp) : ''}
            error={showErr('limitPrice')}
          />
        </Animated.View>
      ) : null}
      <View style={styles.grid}>
        <TextField
          label="Stop-loss ₹ (optional)"
          value={stopLoss}
          onChangeText={setStopLoss}
          keyboardType="decimal-pad"
          error={showErr('stopLoss')}
          containerStyle={styles.flex}
        />
        <TextField
          label="Target ₹ (optional)"
          value={takeProfit}
          onChangeText={setTakeProfit}
          keyboardType="decimal-pad"
          error={showErr('takeProfit')}
          containerStyle={styles.flex}
        />
      </View>

      <View style={[styles.summary, {backgroundColor: alpha(p.raised, 0.6)}]}>
        <View style={styles.between}>
          <Txt variant="caption" tone="muted">
            Last simulated price
          </Txt>
          <Txt variant="caption" num testID="ticket-ltp">
            {price(ltp)}
            {live ? `  ${pct(live.change_pct)}` : ''}
          </Txt>
        </View>
        <View style={styles.between}>
          <Txt variant="caption" tone="muted">
            Estimated value
          </Txt>
          <Txt variant="caption" num testID="ticket-est">
            {inr(v.estValue)}
          </Txt>
        </View>
        <View style={styles.between}>
          <Txt variant="caption" tone="muted">
            Available cash
          </Txt>
          <Txt variant="caption" num tone={buy && v.errors.funds ? 'down' : 'ink'}>
            {inr(cash)}
          </Txt>
        </View>
      </View>
      {v.warning && tried ? (
        <Txt variant="caption" tone="warn">
          {v.warning}
        </Txt>
      ) : null}

      {rejected ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          testID="order-rejected"
          accessibilityRole="alert"
          style={[styles.rejected, {backgroundColor: alpha(p.down, 0.1), borderColor: alpha(p.down, 0.4)}]}>
          <AlertTriangle size={16} color={p.down} />
          <View style={styles.flex}>
            <Txt variant="small" weight="600" tone="down">
              Order rejected
            </Txt>
            <Txt variant="caption" tone="ink">
              {rejected}
            </Txt>
          </View>
        </Animated.View>
      ) : null}

      <Button
        testID="review-order"
        title={`Review ${buy ? 'buy' : 'sell'} order`}
        variant={buy ? 'buy' : 'sell'}
        size="lg"
        full
        onPress={review}
      />

      <Sheet visible={confirming} onClose={() => setConfirming(false)} title="Confirm paper order" testID="order-confirm">
        <View style={styles.gap12}>
          <Txt variant="small">
            <Txt variant="small" tone={buy ? 'up' : 'down'}>
              {side}
            </Txt>
            {orderSentence({
              side,
              quantity: v.quantity ?? 0,
              symbol,
              orderType,
              limitPrice: v.limitPrice,
              stopLoss: v.stopLoss,
              takeProfit: v.takeProfit,
            }).slice(side.length)}
          </Txt>
          <View style={[styles.summary, {backgroundColor: alpha(p.raised, 0.6)}]}>
            <View style={styles.between}>
              <Txt variant="caption" tone="muted">
                Estimated value
              </Txt>
              <Txt variant="caption" num>
                {inr(v.estValue)}
              </Txt>
            </View>
            <View style={styles.between}>
              <Txt variant="caption" tone="muted">
                Account
              </Txt>
              <Txt variant="caption">{account.name}</Txt>
            </View>
          </View>
          <Txt variant="caption" tone="muted">
            Virtual money only. No order reaches any exchange or broker.
          </Txt>
          <View style={styles.grid}>
            <Button title="Back" variant="ghost" style={styles.flex} onPress={() => setConfirming(false)} />
            <Button
              testID="place-order"
              title="Place order"
              variant={buy ? 'buy' : 'sell'}
              style={styles.flex}
              loading={place.isPending}
              onPress={submit}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  gap4: {gap: 4},
  gap8: {gap: 8},
  gap12: {gap: 12},
  pad: {padding: 12},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  acct: {minWidth: 140},
  grid: {flexDirection: 'row', gap: 12},
  toggle: {flexDirection: 'row', borderRadius: radius.ctl, padding: 2, height: 40},
  thumb: {position: 'absolute', top: 2, bottom: 2, left: 2, borderRadius: 5},
  toggleBtn: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  results: {borderWidth: 1, borderRadius: radius.ctl, overflow: 'hidden'},
  result: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44},
  picked: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.ctl, paddingHorizontal: 12, minHeight: 40},
  summary: {borderRadius: radius.ctl, paddingHorizontal: 12, paddingVertical: 8, gap: 4},
  rejected: {flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: radius.ctl, padding: 12},
});
