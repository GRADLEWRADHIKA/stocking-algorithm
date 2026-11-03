import React from 'react';
import {StyleSheet, Text, type TextProps, type TextStyle} from 'react-native';
import {fontFor, type as typeScale, usePalette} from '../theme';

type Variant = keyof typeof typeScale;
export type TxtTone =
  | 'default'
  | 'ink'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'up'
  | 'down'
  | 'warn'
  | 'info'
  // legacy names
  | 'gain'
  | 'loss'
  | 'warning'
  | 'onAccent';

export interface TxtProps extends TextProps {
  variant?: Variant;
  tone?: TxtTone;
  /** JetBrains Mono, tabular numerals (prices, quantities, every figure). */
  num?: boolean;
  weight?: TextStyle['fontWeight'];
  color?: string;
  align?: TextStyle['textAlign'];
}

/** Text primitive: Public Sans for words, JetBrains Mono (`num`) for figures — as on the web. */
export function Txt({variant = 'body', tone = 'default', num, weight, color, align, style, ...rest}: TxtProps) {
  const p = usePalette();
  const toneColor: Record<TxtTone, string> = {
    default: p.ink,
    ink: p.ink,
    muted: p.muted,
    faint: p.faint,
    accent: p.accent,
    up: p.up,
    down: p.down,
    warn: p.warn,
    info: p.info,
    gain: p.up,
    loss: p.down,
    warning: p.warn,
    onAccent: p.ground,
  };
  const base = typeScale[variant];
  // Explicit `weight` wins, then a fontWeight in `style`, then the variant's weight.
  const styleWeight = (StyleSheet.flatten(style) as TextStyle | undefined)?.fontWeight;
  const w = weight ?? styleWeight ?? base.fontWeight;
  return (
    <Text
      {...rest}
      style={[
        base,
        {color: color ?? toneColor[tone]},
        num ? styles.num : null,
        align ? {textAlign: align} : null,
        style,
        fontFor(w, !!num),
      ]}
    />
  );
}

const styles = StyleSheet.create({
  num: {letterSpacing: -0.2},
});
