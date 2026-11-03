import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {Check} from 'lucide-react-native';
import type {IndicatorMeta} from '../../api/types';
import {alpha, fontFor, radius, usePalette} from '../../theme';
import {clampParam, DEFAULT_CONFIG, type IndicatorConfig} from '../../utils/chartConfig';
import {Txt} from '../Txt';

function ParamInput({
  value,
  min,
  max,
  label,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onCommit: (v: number) => void;
}) {
  const p = usePalette();
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() === '' || Number.isNaN(v)) {
      setText(String(value));
      return;
    }
    const c = clampParam(v, min, max);
    setText(String(c));
    onCommit(c);
  };
  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType="decimal-pad"
      value={text}
      onChangeText={setText}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onSubmitEditing={commit}
      selectionColor={p.accent}
      style={[
        styles.param,
        {color: p.ink, backgroundColor: p.ground, borderColor: focused ? alpha(p.accent, 0.7) : p.line},
        fontFor('400', true),
      ]}
    />
  );
}

/** Web IndicatorPicker: every catalog indicator, enable toggle, pane note, editable params, Reset, add SMA/EMA. */
export function IndicatorPicker({
  catalog,
  config,
  onChange,
}: {
  catalog: IndicatorMeta[];
  config: IndicatorConfig[];
  onChange: (c: IndicatorConfig[]) => void;
}) {
  const p = usePalette();
  const meta = (k: string) => catalog.find(m => m.key === k);
  const update = (i: number, patch: Partial<IndicatorConfig>) => onChange(config.map((c, j) => (j === i ? {...c, ...patch} : c)));
  return (
    <View testID="indicator-picker">
      <View style={[styles.head, {borderBottomColor: p.rule}]}>
        <Txt variant="title">Indicators</Txt>
        <Pressable testID="indicators-reset" hitSlop={10} onPress={() => onChange(DEFAULT_CONFIG.map(c => ({...c, params: [...c.params]})))}>
          <Txt variant="caption" tone="muted">
            Reset
          </Txt>
        </Pressable>
      </View>
      {config.map((c, i) => {
        const m = meta(c.key);
        if (!m) {
          return null;
        }
        return (
          <View key={`${c.key}-${i}`} style={styles.row}>
            <Pressable
              testID={`indicator-toggle-${c.key}-${i}`}
              accessibilityRole="checkbox"
              accessibilityState={{checked: c.enabled}}
              accessibilityLabel={m.name}
              onPress={() => update(i, {enabled: !c.enabled})}
              style={styles.label}>
              <View style={[styles.box, {borderColor: c.enabled ? p.accent : p.line, backgroundColor: c.enabled ? p.accent : 'transparent'}]}>
                {c.enabled ? <Check size={11} strokeWidth={3} color={p.ground} /> : null}
              </View>
              <View style={styles.flex}>
                <Txt variant="small" numberOfLines={1}>
                  {m.name}
                </Txt>
                <Txt variant="micro" tone="faint">
                  {m.pane === 'overlay' ? 'on price' : 'own pane'}
                </Txt>
              </View>
            </Pressable>
            <View style={styles.params}>
              {m.params.map((pm, j) => (
                <ParamInput
                  key={pm.name}
                  label={`${m.name} ${pm.label}`}
                  value={c.params[j] ?? pm.default}
                  min={pm.min}
                  max={pm.max}
                  onCommit={v => {
                    const params = m.params.map((q, k) => c.params[k] ?? q.default);
                    params[j] = v;
                    update(i, {params});
                  }}
                />
              ))}
            </View>
          </View>
        );
      })}
      <View style={[styles.foot, {borderTopColor: p.rule}]}>
        <Pressable
          testID="indicators-add-ma"
          hitSlop={8}
          onPress={() => {
            const m = catalog.find(x => x.pane === 'overlay') ?? meta('sma');
            if (m) {
              onChange([...config, {key: m.key, params: m.params.map(q => q.default), enabled: true}]);
            }
          }}>
          <Txt variant="caption" tone="muted">
            + Add another SMA/EMA to compare
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8},
  label: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36},
  box: {width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center'},
  params: {flexDirection: 'row', gap: 4},
  param: {width: 52, height: 32, borderWidth: 1, borderRadius: radius.ctl, textAlign: 'center', fontSize: 12, paddingVertical: 0},
  foot: {borderTopWidth: 1, paddingTop: 10, marginTop: 4},
});
