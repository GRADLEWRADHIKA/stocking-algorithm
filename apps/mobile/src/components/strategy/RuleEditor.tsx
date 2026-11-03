import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import Animated, {FadeIn, FadeOut, LinearTransition} from 'react-native-reanimated';
import {Plus, Trash2} from 'lucide-react-native';
import type {IndicatorMeta, Operand, RuleCondition, RuleGroup} from '../../api/types';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {alpha, radius, usePalette} from '../../theme';
import {OPERATORS, PRICE_FIELDS, indicatorOperand} from '../../utils/rules';
import {Button} from '../Button';
import {SelectField, type SelectOption} from '../SelectField';
import {TextField} from '../TextField';
import {Txt} from '../Txt';

/** Number input that keeps the typed text (so "-", "1." etc. survive) and reports NaN when empty. */
export function NumInput({
  value,
  onChange,
  label,
  width,
  placeholder,
  hint,
  accessibilityLabel,
  testID,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  label?: string;
  width?: number;
  placeholder?: string;
  hint?: string;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(v));
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    if (Number(text) !== value || (text === '' && value !== null && value !== undefined && !Number.isNaN(value))) {
      setText(fmt(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextField
      testID={testID}
      label={label}
      hint={hint}
      num
      size="sm"
      keyboardType="numbers-and-punctuation"
      value={text}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel ?? label}
      onChangeText={t => {
        setText(t);
        onChange(t.trim() === '' ? NaN : Number(t));
      }}
      containerStyle={width ? {width} : undefined}
    />
  );
}

function OperandEditor({value, onChange, catalog, label}: {value: Operand; onChange: (o: Operand) => void; catalog: IndicatorMeta[]; label: string}) {
  const kind = value.type === 'indicator' ? `ind:${value.indicator}` : value.type === 'price' ? `price:${value.field}` : 'constant';
  const meta = value.type === 'indicator' ? catalog.find(c => c.key === value.indicator) : undefined;
  const options: SelectOption<string>[] = [
    ...catalog.map(c => ({value: `ind:${c.key}`, label: c.name, group: 'Indicators'})),
    ...PRICE_FIELDS.map(f => ({value: `price:${f}`, label: f[0].toUpperCase() + f.slice(1), group: 'Price'})),
    {value: 'constant', label: 'Number', group: 'Number'},
  ];
  return (
    <View style={styles.operand}>
      <SelectField
        size="sm"
        value={kind}
        options={options}
        accessibilityLabel={`${label} operand`}
        title={`${label} side`}
        style={styles.operandSelect}
        onChange={v => {
          if (v === 'constant') {
            onChange({type: 'constant', value: 50});
          } else if (v.startsWith('price:')) {
            onChange({type: 'price', field: v.slice(6) as 'close'});
          } else {
            const m = catalog.find(c => c.key === v.slice(4));
            if (m) {
              onChange(indicatorOperand(m));
            }
          }
        }}
      />
      {value.type === 'indicator' && meta
        ? meta.params.map(p => (
            <NumInput
              key={p.name}
              width={64}
              value={value.params[p.name] ?? p.default}
              accessibilityLabel={`${meta.name} ${p.label}`}
              onChange={v => onChange({...value, params: {...value.params, [p.name]: v}})}
            />
          ))
        : null}
      {value.type === 'indicator' && meta && meta.fields.length > 1 ? (
        <SelectField
          size="sm"
          value={value.field ?? meta.fields[0]}
          accessibilityLabel={`${meta.name} output`}
          options={meta.fields.map(f => ({value: f, label: f.replace(/_/g, ' ')}))}
          onChange={f => onChange({...value, field: f})}
          style={styles.fieldSelect}
        />
      ) : null}
      {value.type === 'constant' ? (
        <NumInput width={90} value={value.value} accessibilityLabel={`${label} value`} onChange={v => onChange({type: 'constant', value: v})} />
      ) : null}
    </View>
  );
}

/** AND / OR pill toggle (web: raised track, the active option on surface). */
export function LogicToggle({value, onChange}: {value: 'AND' | 'OR'; onChange: (v: 'AND' | 'OR') => void}) {
  const p = usePalette();
  return (
    <View style={[styles.toggle, {backgroundColor: p.raised}]} accessibilityRole="radiogroup">
      {(['AND', 'OR'] as const).map(l => {
        const on = value === l;
        return (
          <Pressable
            key={l}
            accessibilityRole="radio"
            accessibilityState={{selected: on}}
            accessibilityLabel={`Combine with ${l}`}
            onPress={() => onChange(l)}
            style={[styles.toggleBtn, on && {backgroundColor: p.surface}]}>
            <Txt variant="micro" weight="600" tone={on ? 'ink' : 'muted'}>
              {l}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RuleGroupEditor({
  title,
  group,
  onChange,
  catalog,
  tone,
  testID,
}: {
  title: string;
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  catalog: IndicatorMeta[];
  tone: 'up' | 'down';
  testID?: string;
}) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const update = (i: number, c: RuleCondition) => onChange({...group, conditions: group.conditions.map((x, j) => (j === i ? c : x))});
  const add = () => {
    const rsi = catalog.find(c => c.key === 'rsi') ?? catalog[0];
    if (!rsi) {
      return;
    }
    onChange({...group, conditions: [...group.conditions, {left: indicatorOperand(rsi), operator: '>', right: {type: 'constant', value: 50}}]});
  };
  return (
    <View testID={testID}>
      <View style={styles.groupHead}>
        <View style={[styles.toneBar, {backgroundColor: tone === 'up' ? p.up : p.down}]} />
        <Txt variant="title" style={styles.flex}>
          {title}
        </Txt>
        <Txt variant="caption" tone="muted">
          Combine with
        </Txt>
        <LogicToggle value={group.logic} onChange={logic => onChange({...group, logic})} />
      </View>
      {group.conditions.map((c, i) => (
        <Animated.View
          key={i}
          entering={reduce ? undefined : FadeIn.duration(200)}
          exiting={reduce ? undefined : FadeOut.duration(150)}
          layout={reduce ? undefined : LinearTransition.duration(200)}>
          {i > 0 ? (
            <Txt variant="micro" weight="600" tone="accent" style={styles.logic}>
              {group.logic}
            </Txt>
          ) : null}
          <View style={[styles.rule, {backgroundColor: p.ground, borderColor: p.line}]}>
            <OperandEditor label="Left" value={c.left} catalog={catalog} onChange={left => update(i, {...c, left})} />
            <View style={styles.opRow}>
              <SelectField
                size="sm"
                value={c.operator}
                accessibilityLabel="Comparison"
                options={OPERATORS.map(o => ({value: o.value, label: o.label}))}
                onChange={operator => update(i, {...c, operator})}
                style={styles.flex}
              />
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${title.toLowerCase()} rule ${i + 1}`}
                onPress={() => onChange({...group, conditions: group.conditions.filter((_, j) => j !== i)})}
                style={({pressed}) => [styles.trash, pressed && {backgroundColor: alpha(p.down, 0.1)}]}>
                <Trash2 size={15} color={p.faint} />
              </Pressable>
            </View>
            <OperandEditor label="Right" value={c.right} catalog={catalog} onChange={right => update(i, {...c, right})} />
          </View>
        </Animated.View>
      ))}
      <Button title="Add condition" size="sm" variant="ghost" icon={<Plus size={14} color={p.muted} />} onPress={add} style={styles.add} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  operand: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 6},
  operandSelect: {minWidth: 150, flexGrow: 1},
  fieldSelect: {minWidth: 100},
  groupHead: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8},
  toneBar: {width: 2, height: 16, borderRadius: 1},
  toggle: {flexDirection: 'row', borderRadius: radius.ctl, padding: 2},
  toggleBtn: {height: 26, paddingHorizontal: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center'},
  logic: {paddingVertical: 4, paddingLeft: 8},
  rule: {borderWidth: 1, borderRadius: radius.ctl, padding: 10, gap: 8},
  opRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  trash: {padding: 6, borderRadius: 4},
  add: {alignSelf: 'flex-start', marginTop: 8},
});
