import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {BellPlus, Trash2} from 'lucide-react-native';
import {useAlertMutations, useAlerts} from '../../api/hooks';
import type {Alert, AlertType} from '../../api/types';
import {radius, usePalette} from '../../theme';
import {relative} from '../../utils/fmt';
import {Badge} from '../Badge';
import {Button} from '../Button';
import {SelectField} from '../SelectField';
import {EmptyState} from '../States';
import {SkeletonRows} from '../Skeleton';
import {TextField} from '../TextField';
import {toast} from '../Toast';
import {Txt} from '../Txt';
import {SymbolSearch} from './SymbolSearch';

/** All 8 alert types with the same labels and parameters as the web watchlist page. */
export const ALERT_TYPES: {v: AlertType; l: string; needs: 'threshold' | 'period' | 'ma'}[] = [
  {v: 'PRICE_ABOVE', l: 'Price rises above', needs: 'threshold'},
  {v: 'PRICE_BELOW', l: 'Price falls below', needs: 'threshold'},
  {v: 'PCT_CHANGE_ABOVE', l: 'Day change above %', needs: 'threshold'},
  {v: 'PCT_CHANGE_BELOW', l: 'Day change below %', needs: 'threshold'},
  {v: 'RSI_ABOVE', l: 'RSI rises above', needs: 'period'},
  {v: 'RSI_BELOW', l: 'RSI falls below', needs: 'period'},
  {v: 'MA_CROSS_UP', l: 'Fast MA crosses above slow', needs: 'ma'},
  {v: 'MA_CROSS_DOWN', l: 'Fast MA crosses below slow', needs: 'ma'},
];

export function AlertForm({defaultSymbol}: {defaultSymbol?: string}) {
  const p = usePalette();
  const {create} = useAlertMutations();
  const [symbol, setSymbol] = useState(defaultSymbol ?? '');
  const [type, setType] = useState<AlertType>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');
  const [period, setPeriod] = useState('14');
  const [fast, setFast] = useState('20');
  const [slow, setSlow] = useState('50');
  const needs = ALERT_TYPES.find(a => a.v === type)!.needs;

  useEffect(() => {
    if (defaultSymbol && !symbol) {
      setSymbol(defaultSymbol);
    }
  }, [defaultSymbol, symbol]);

  const submit = () => {
    if (!symbol) {
      return toast.error('Choose a stock');
    }
    if (needs !== 'ma' && (threshold.trim() === '' || Number.isNaN(Number(threshold)))) {
      return toast.error('Enter a threshold');
    }
    if (needs === 'ma' && Number(fast) >= Number(slow)) {
      return toast.error('Fast period must be shorter than slow');
    }
    create.mutate(
      {
        symbol,
        alert_type: type,
        threshold: needs === 'ma' ? null : Number(threshold),
        params: needs === 'period' ? {period: Number(period)} : needs === 'ma' ? {fast: Number(fast), slow: Number(slow)} : {},
      },
      {
        onSuccess: a => {
          toast.success('Alert armed', {description: a.description});
          setThreshold('');
        },
        onError: e => toast.error((e as Error).message),
      },
    );
  };

  return (
    <View testID="alert-form" style={styles.form}>
      <View style={styles.field}>
        <Txt variant="caption" tone="muted">
          Stock
        </Txt>
        {symbol ? (
          <View style={[styles.picked, {borderColor: p.line}]}>
            <Txt variant="small" weight="500">
              {symbol}
            </Txt>
            <Pressable onPress={() => setSymbol('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change stock">
              <Txt variant="caption" tone="muted">
                Change
              </Txt>
            </Pressable>
          </View>
        ) : (
          <SymbolSearch testID="alert-symbol" onPick={setSymbol} placeholder="Pick a stock" />
        )}
      </View>
      <SelectField
        testID="alert-type"
        label="Condition"
        value={type}
        onChange={setType}
        options={ALERT_TYPES.map(a => ({value: a.v, label: a.l}))}
      />
      <View style={styles.grid}>
        {needs !== 'ma' ? (
          <TextField
            testID="alert-threshold"
            containerStyle={styles.flex}
            label={type.startsWith('RSI') ? 'RSI level' : type.startsWith('PCT') ? 'Percent' : 'Price ₹'}
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numbers-and-punctuation"
            num
          />
        ) : null}
        {needs === 'period' ? (
          <TextField containerStyle={styles.flex} label="RSI period" value={period} onChangeText={setPeriod} keyboardType="number-pad" />
        ) : null}
        {needs === 'ma' ? (
          <>
            <TextField containerStyle={styles.flex} label="Fast EMA" value={fast} onChangeText={setFast} keyboardType="number-pad" />
            <TextField containerStyle={styles.flex} label="Slow EMA" value={slow} onChangeText={setSlow} keyboardType="number-pad" />
          </>
        ) : null}
      </View>
      <Button
        testID="alert-submit"
        title="Arm alert"
        variant="primary"
        full
        loading={create.isPending}
        icon={<BellPlus size={14} color={p.ground} />}
        onPress={submit}
      />
      <Txt variant="micro" tone="faint">
        Checked by a local background job against the simulated feed. Fires once, then disarms.
      </Txt>
    </View>
  );
}

function AlertRow({a, first}: {a: Alert; first: boolean}) {
  const p = usePalette();
  const am = useAlertMutations();
  return (
    <View testID={`alert-${a.id}`} style={[styles.alertRow, !first && {borderTopWidth: 1, borderTopColor: p.rule}]}>
      <View style={styles.flex}>
        <Txt variant="small">{a.description}</Txt>
        <Txt variant="micro" tone="faint">
          {a.triggered_at ? `Triggered ${relative(a.triggered_at)}` : `Created ${relative(a.created_at)}`}
        </Txt>
      </View>
      <Pressable
        hitSlop={8}
        accessibilityRole="switch"
        accessibilityState={{checked: a.is_active}}
        accessibilityLabel={a.is_active ? 'Disarm alert' : 'Re-arm alert'}
        onPress={() => am.setActive.mutate({id: a.id, active: !a.is_active})}>
        <Badge label={a.is_active ? 'armed' : a.triggered_at ? 'fired' : 'off'} tone={a.is_active ? 'up' : 'neutral'} />
      </Pressable>
      <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete alert" onPress={() => am.remove.mutate(a.id)} style={styles.del}>
        <Trash2 size={14} color={p.faint} />
      </Pressable>
    </View>
  );
}

export function AlertList({symbol}: {symbol?: string}) {
  const alerts = useAlerts();
  if (alerts.isLoading) {
    return <SkeletonRows rows={3} />;
  }
  const list = (alerts.data ?? []).filter(a => !symbol || a.symbol === symbol);
  if (list.length === 0) {
    return <EmptyState title="No alerts" />;
  }
  return (
    <View style={styles.list}>
      {list.map((a, i) => (
        <AlertRow key={a.id} a={a} first={i === 0} />
      ))}
    </View>
  );
}

export function useArmedCount(): number {
  const alerts = useAlerts();
  return (alerts.data ?? []).filter(a => a.is_active).length;
}

const styles = StyleSheet.create({
  form: {gap: 12, padding: 16},
  field: {gap: 4},
  picked: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.ctl, paddingHorizontal: 12, paddingVertical: 8},
  grid: {flexDirection: 'row', gap: 12},
  flex: {flex: 1},
  list: {paddingHorizontal: 16},
  alertRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10},
  del: {padding: 2},
});
