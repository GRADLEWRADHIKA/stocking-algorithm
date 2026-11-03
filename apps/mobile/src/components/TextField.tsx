import React, {forwardRef, useState} from 'react';
import {StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle} from 'react-native';
import {alpha, fontFor, radius, usePalette} from '../theme';
import {Txt} from './Txt';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** JetBrains Mono input (numbers). */
  num?: boolean;
  size?: 'sm' | 'md';
}

/** Web `.field`: ground background, 1px line border, 6px radius; focus turns the border saffron/70. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {label, error, hint, left, right, containerStyle, style, onFocus, onBlur, num, size = 'md', ...rest},
  ref,
) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? p.down : focused ? alpha(p.accent, 0.7) : p.line;
  const isNum = num ?? (rest.keyboardType === 'numeric' || rest.keyboardType === 'decimal-pad' || rest.keyboardType === 'number-pad');
  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Txt variant="caption" tone="muted">
          {label}
        </Txt>
      ) : null}
      <View style={[styles.field, {backgroundColor: p.ground, borderColor, minHeight: size === 'sm' ? 34 : 42}, rest.editable === false && styles.disabled]}>
        {left}
        <TextInput
          ref={ref}
          placeholderTextColor={p.faint}
          selectionColor={p.accent}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, {color: p.ink, fontSize: size === 'sm' ? 13 : 14}, fontFor('400', isNum), style]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Txt variant="caption" tone="down">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" tone="faint">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {gap: 4},
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.ctl,
    paddingHorizontal: 12,
    gap: 8,
  },
  disabled: {opacity: 0.5},
  input: {flex: 1, paddingVertical: 6},
});
