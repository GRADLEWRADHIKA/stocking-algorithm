import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Bot, FlaskConical, ShoppingCart} from 'lucide-react-native';
import {Button, Screen, SignalCard} from '../components';
import type {RootScreenProps} from '../navigation/types';
import {usePalette} from '../theme';

/** The full SignalCard (web: the side panel that opens when a signal row is selected). */
export function SignalDetailScreen({navigation, route}: RootScreenProps<'SignalDetail'>) {
  const p = usePalette();
  const s = route.params.signal;
  return (
    <Screen back title={`${s.symbol} · ${s.action}`} subtitle={s.strategy} testID="signal-detail-screen">
      <SignalCard s={s} showSymbol onSymbolPress={symbol => navigation.navigate('StockDetail', {symbol, tab: 'signals'})} />
      <View style={styles.row}>
        <Button
          size="sm"
          title="Backtest"
          icon={<FlaskConical size={14} color={p.ink} />}
          onPress={() => navigation.navigate('Backtesting', {symbol: s.symbol, strategyKey: s.strategy_key})}
        />
        <Button
          size="sm"
          title="Ask assistant"
          icon={<Bot size={14} color={p.ink} />}
          onPress={() => navigation.navigate('Assistant', {symbol: s.symbol, question: `Explain the ${s.strategy} signal on ${s.symbol}`})}
        />
        <Button
          size="sm"
          variant="primary"
          title="Paper trade"
          icon={<ShoppingCart size={14} color={p.ground} />}
          onPress={() => navigation.navigate('OrderTicket', {symbol: s.symbol, side: s.action === 'SELL' ? 'SELL' : 'BUY', refPrice: s.price})}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
