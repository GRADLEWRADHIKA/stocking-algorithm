import React, {useState} from 'react';
import {Pressable, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {Check, ChevronDown} from 'lucide-react-native';
import {radius, usePalette} from '../theme';
import {Sheet} from './Sheet';
import {Txt} from './Txt';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
  /** Group heading shown above this option (web <optgroup>). */
  group?: string;
  hint?: string;
}

export interface SelectFieldProps<V extends string> {
  value: V;
  options: ReadonlyArray<SelectOption<V>>;
  onChange: (v: V) => void;
  label?: string;
  /** Sheet title (defaults to label). */
  title?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  num?: boolean;
}

/** Web <Select> adapted to touch: a field-styled button that opens a bottom sheet of options. */
export function SelectField<V extends string>({
  value,
  options,
  onChange,
  label,
  title,
  placeholder = 'Select',
  size = 'md',
  style,
  testID,
  accessibilityLabel,
  num,
}: SelectFieldProps<V>) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  let lastGroup: string | undefined;
  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Txt variant="caption" tone="muted">
          {label}
        </Txt>
      ) : null}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? title}
        accessibilityHint={current?.label}
        onPress={() => setOpen(true)}
        style={[styles.field, {backgroundColor: p.ground, borderColor: p.line, minHeight: size === 'sm' ? 34 : 42}]}>
        <Txt variant={size === 'sm' ? 'caption' : 'small'} num={num} tone={current ? 'ink' : 'faint'} numberOfLines={1} style={styles.flex}>
          {current?.label ?? placeholder}
        </Txt>
        <ChevronDown size={14} color={p.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? label ?? accessibilityLabel} scroll testID={testID ? `${testID}-sheet` : undefined}>
        <View>
          {options.map(o => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const selected = o.value === value;
            return (
              <View key={o.value}>
                {head ? (
                  <Txt variant="micro" tone="faint" style={styles.group}>
                    {head}
                  </Txt>
                ) : null}
                <Pressable
                  testID={testID ? `${testID}-opt-${o.value}` : undefined}
                  accessibilityRole="menuitem"
                  accessibilityState={{selected}}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({pressed}) => [styles.opt, {borderTopColor: p.rule}, pressed && {backgroundColor: p.raised}]}>
                  <View style={styles.flex}>
                    <Txt variant="small" num={num} weight={selected ? '500' : '400'}>
                      {o.label}
                    </Txt>
                    {o.hint ? (
                      <Txt variant="caption" tone="muted">
                        {o.hint}
                      </Txt>
                    ) : null}
                  </View>
                  {selected ? <Check size={16} color={p.accent} /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 4},
  flex: {flex: 1},
  field: {flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.ctl, paddingHorizontal: 12},
  group: {marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6},
  opt: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 4, borderTopWidth: 1},
});
