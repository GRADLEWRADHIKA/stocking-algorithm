import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SourceBadge} from '../components/Badge';
import {Panel} from '../components/Panel';
import {Screen} from '../components/Screen';
import {OrderTicketForm} from '../components/trading/OrderTicketForm';
import type {RootScreenProps} from '../navigation/types';

/** Web: the "Paper trade SYMBOL" dialog on the stock page / "New order" on paper trading. */
export function OrderTicketScreen({route, navigation}: RootScreenProps<'OrderTicket'>) {
  const {symbol, side, refPrice} = route.params;
  return (
    <Screen
      back
      keyboard
      testID="order-ticket-screen"
      title={symbol ? `Paper trade ${symbol}` : 'Order ticket'}
      subtitle="Simulated execution against the local market feed."
      headerExtra={
        <View style={styles.badges}>
          <SourceBadge source="PAPER_TRADING" />
          <SourceBadge source="SIMULATED" />
        </View>
      }>
      <Panel title="Order ticket" padded>
        <OrderTicketForm
          symbol={symbol || undefined}
          refPrice={refPrice}
          defaultSide={side ?? 'BUY'}
          onDone={() => navigation.goBack()}
          onNoAccount={() => navigation.replace('PaperTrading')}
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: {flexDirection: 'row', gap: 8},
});
