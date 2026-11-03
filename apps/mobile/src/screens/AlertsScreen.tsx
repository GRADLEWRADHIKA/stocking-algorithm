import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useAlerts} from '../api/hooks';
import {Panel, Screen, SourceBadge, Txt} from '../components';
import {AlertForm, AlertList, useArmedCount} from '../components/watchlist/Alerts';
import type {RootScreenProps} from '../navigation/types';

/** Web watchlist page "#alerts" panels as their own screen (reached from the bell, stock pages and Profile). */
export function AlertsScreen({route}: RootScreenProps<'Alerts'>) {
  const symbol = route.params?.symbol;
  const alerts = useAlerts();
  const armed = useArmedCount();
  return (
    <Screen
      back
      title="Alerts"
      testID="alerts-screen"
      keyboard
      refreshing={alerts.isRefetching}
      onRefresh={alerts.refetch}
      headerExtra={
        <View style={styles.sub}>
          <Txt variant="small" tone="muted" style={styles.flex}>
            Evaluated against the simulated feed.
          </Txt>
          <SourceBadge source="SIMULATED" />
        </View>
      }>
      <Panel index={0} title="New alert">
        <AlertForm defaultSymbol={symbol} />
      </Panel>
      <Panel index={1} title={`Alerts · ${armed} armed`}>
        <AlertList />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: {flexDirection: 'row', alignItems: 'center', gap: 8},
  flex: {flex: 1},
});
