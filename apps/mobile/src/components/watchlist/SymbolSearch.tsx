import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Search} from 'lucide-react-native';
import {useStocks} from '../../api/hooks';
import {useDebounced} from '../../hooks/useDebounced';
import {usePalette} from '../../theme';
import {pct, price} from '../../utils/fmt';
import {TextField} from '../TextField';
import {Txt} from '../Txt';

/** Web SymbolSearch: type a company or ticker, pick from the live universe (GET /stocks?q=). */
export function SymbolSearch({onPick, placeholder = 'Company or ticker', testID}: {onPick: (symbol: string) => void; placeholder?: string; testID?: string}) {
  const p = usePalette();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const res = useStocks({q: dq, limit: 6}, dq.length > 0);
  const items = dq ? res.data?.items ?? [] : [];
  return (
    <View style={styles.wrap}>
      <TextField
        testID={testID}
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        size="sm"
        left={<Search size={14} color={p.faint} />}
        accessibilityLabel={placeholder}
      />
      {dq && items.length === 0 && !res.isFetching ? (
        <Txt variant="caption" tone="muted" style={styles.none}>
          No instrument matches “{dq}”.
        </Txt>
      ) : null}
      {items.length > 0 ? (
        <View style={[styles.list, {borderColor: p.line, backgroundColor: p.surface}]}>
          {items.map((s, i) => (
            <Pressable
              key={s.symbol}
              testID={`pick-${s.symbol}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.symbol} ${s.name}`}
              onPress={() => {
                onPick(s.symbol);
                setQ('');
              }}
              style={({pressed}) => [styles.item, i > 0 && {borderTopWidth: 1, borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
              <View style={styles.flex}>
                <Txt variant="small" weight="500">
                  {s.symbol}{' '}
                  <Txt variant="micro" tone="faint">
                    {s.exchange}
                  </Txt>
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {s.name}
                </Txt>
              </View>
              <View style={styles.right}>
                <Txt variant="caption" num>
                  {price(s.price)}
                </Txt>
                <Txt variant="micro" num tone={s.change_pct > 0 ? 'up' : s.change_pct < 0 ? 'down' : 'muted'}>
                  {pct(s.change_pct)}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 6},
  list: {borderWidth: 1, borderRadius: 6, overflow: 'hidden'},
  item: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8},
  flex: {flex: 1},
  right: {alignItems: 'flex-end'},
  none: {paddingHorizontal: 2},
});
