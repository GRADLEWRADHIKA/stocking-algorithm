import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Path, Rect} from 'react-native-svg';
import {usePalette} from '../theme';
import {Txt} from './Txt';

/** QuantDesk mark (same geometry as web Logo.tsx): a candle body whose wick becomes a rising step line. */
export function Logo({size = 22}: {size?: number}) {
  const p = usePalette();
  return (
    <Svg testID="logo" width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={1} y={1} width={22} height={22} rx={6} fill={p.ink} />
      <Path d="M8 6.5v11" stroke={p.ground} strokeWidth={1.5} strokeLinecap="round" />
      <Rect x={6} y={9} width={4} height={5.5} rx={1} fill={p.ground} />
      <Path
        d="M12.5 15.5l2.5-3 2 1.5 2.5-4"
        fill="none"
        stroke={p.accent}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Wordmark({size = 22}: {size?: number}) {
  return (
    <View style={styles.row} accessibilityLabel="QuantDesk">
      <Logo size={size} />
      <Txt weight="600" style={styles.word}>
        QuantDesk
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  word: {fontSize: 15, letterSpacing: -0.3},
});
