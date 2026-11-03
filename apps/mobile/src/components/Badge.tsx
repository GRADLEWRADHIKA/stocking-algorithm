import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import type {DataSource, SignalAction} from '../api/types';
import {alpha, radius, usePalette, type Palette} from '../theme';
import {Txt} from './Txt';

/** Web badge tones; legacy names (gain/loss/warning/simulated/paper) map onto them. */
export type BadgeTone =
  | 'neutral'
  | 'up'
  | 'down'
  | 'warn'
  | 'info'
  | 'accent'
  | 'gain'
  | 'loss'
  | 'warning'
  | 'simulated'
  | 'paper';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  dot?: boolean;
  /** Fixed-width centred badge (ActionBadge: web `w-11 justify-center`). */
  width?: number;
  bold?: boolean;
}

export function badgeColors(p: Palette, tone: BadgeTone) {
  switch (tone) {
    case 'up':
    case 'gain':
      return {bg: alpha(p.up, 0.12), fg: p.up};
    case 'down':
    case 'loss':
      return {bg: alpha(p.down, 0.12), fg: p.down};
    case 'warn':
    case 'warning':
    case 'simulated':
      return {bg: alpha(p.warn, 0.12), fg: p.warn};
    case 'info':
      return {bg: alpha(p.info, 0.12), fg: p.info};
    case 'accent':
    case 'paper':
      return {bg: alpha(p.accent, 0.12), fg: p.accent};
    default:
      return {bg: p.raised, fg: p.muted};
  }
}

/** Web Badge: h-5, rounded, px-1.5, 11px medium, background tinted at 12%. */
export function Badge({label, tone = 'neutral', style, testID, dot, width, bold}: BadgeProps) {
  const p = usePalette();
  const c = badgeColors(p, tone);
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.badge, {backgroundColor: c.bg}, width ? {width, justifyContent: 'center'} : null, style]}>
      {dot ? <View style={[styles.dot, {backgroundColor: c.fg}]} /> : null}
      <Txt variant="micro" weight={bold ? '600' : '500'} color={c.fg} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

export const SOURCE_LABEL: Record<DataSource, string> = {
  HISTORICAL_DATASET: 'Historical dataset',
  SIMULATED: 'Simulated data',
  PAPER_TRADING: 'Paper trading',
  DEMO_ANALYSIS: 'Demo analysis',
};

export function sourceTone(source: DataSource): BadgeTone {
  return source === 'HISTORICAL_DATASET' ? 'info' : source === 'PAPER_TRADING' ? 'accent' : 'warn';
}

/** Every price on screen is labelled with where it came from. Simulated data is never shown as real. */
export function SourceBadge({source, style}: {source: DataSource | null | undefined; style?: StyleProp<ViewStyle>}) {
  if (!source) {
    return null;
  }
  return <Badge testID="badge-source" label={SOURCE_LABEL[source]} tone={sourceTone(source)} dot style={style} />;
}

export function ActionBadge({action, style}: {action: SignalAction; style?: StyleProp<ViewStyle>}) {
  const tone: BadgeTone = action === 'BUY' ? 'up' : action === 'SELL' ? 'down' : 'neutral';
  return <Badge testID={`action-${action}`} label={action} tone={tone} width={44} bold style={style} />;
}

/** Shorthands kept for older call sites. */
export function SimulatedBadge({style}: {style?: StyleProp<ViewStyle>}) {
  return <SourceBadge source="SIMULATED" style={style} />;
}
export function PaperBadge({style}: {style?: StyleProp<ViewStyle>}) {
  return <SourceBadge source="PAPER_TRADING" style={style} />;
}
/** Falls back to "Simulated data" when a payload has no data_source yet (never implies real data). */
export function DataSourceBadge({source, style}: {source?: DataSource | null; style?: StyleProp<ViewStyle>}) {
  return <SourceBadge source={source ?? 'SIMULATED'} style={style} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    gap: 4,
  },
  dot: {width: 6, height: 6, borderRadius: 3},
});
