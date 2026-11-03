import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Search} from 'lucide-react-native';
import {useStocks} from '../../api/hooks';
import {useDebounced} from '../../hooks/useDebounced';
import {usePalette} from '../../theme';
import {pct} from '../../utils/fmt';
import {Sheet} from '../Sheet';
import {TextField} from '../TextField';
import {Txt} from '../Txt';
import {changeColor, radius} from '../../theme';

/** Web SymbolSearch adapted to touch: a field showing the current symbol that opens a search sheet. */
export function SymbolPicker({value, onPick, label, testID}: {value: string; onPick: (s: string) => void; label?: string; testID?: string}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const results = useStocks({q: dq, limit: 20, sort: 'symbol'}, open);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Txt variant="caption" tone="muted">
          {label}
        </Txt>
      ) : null}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Symbol'}: ${value}. Change`}
        onPress={() => setOpen(true)}
        style={[styles.field, {backgroundColor: p.ground, borderColor: p.line}]}>
        <Search size={14} color={p.muted} />
        <Txt variant="small" weight="500" style={styles.flex}>
          {value}
        </Txt>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Pick a stock" scroll>
        <TextField autoFocus value={q} onChangeText={setQ} placeholder="Company or ticker" autoCapitalize="characters" accessibilityLabel="Search by company or ticker" />
        <View>
          {(results.data?.items ?? []).map(s => (
            <Pressable
              key={s.symbol}
              accessibilityRole="button"
              onPress={() => {
                onPick(s.symbol);
                setOpen(false);
                setQ('');
              }}
              style={({pressed}) => [styles.row, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
              <View style={styles.flex}>
                <Txt variant="small" weight="500">
                  {s.symbol}
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {s.name}
                </Txt>
              </View>
              <Txt variant="caption" num color={changeColor(p, s.change_pct)}>
                {pct(s.change_pct)}
              </Txt>
            </Pressable>
          ))}
          {results.data && results.data.items.length === 0 ? (
            <Txt variant="caption" tone="muted" style={styles.empty}>
              No instrument matches “{dq}”.
            </Txt>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 4},
  flex: {flex: 1},
  field: {flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.ctl, paddingHorizontal: 12, minHeight: 42},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderTopWidth: 1, paddingHorizontal: 4},
  empty: {paddingVertical: 12},
});
