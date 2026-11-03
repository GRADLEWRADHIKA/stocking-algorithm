import React, {useMemo} from 'react';
import Svg from 'react-native-svg';
import {usePalette} from '../../theme';
import {DrawPath} from './DrawPath';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  tone?: 'up' | 'down' | 'flat';
  color?: string;
  testID?: string;
}

/** Web Sparkline: tiny trend line that draws itself in once; colour follows first → last. */
export function Sparkline({data, width = 96, height = 28, strokeWidth = 1.5, tone, color, testID}: SparklineProps) {
  const p = usePalette();
  const d = useMemo(() => {
    const clean = (data ?? []).filter(v => Number.isFinite(v));
    if (clean.length < 2) {
      return '';
    }
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || 1;
    const step = width / (clean.length - 1);
    return clean
      .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(2)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(2)}`)
      .join(' ');
  }, [data, width, height]);
  if (!d) {
    return <Svg testID={testID} width={width} height={height} />;
  }
  const t = tone ?? (data[data.length - 1] >= data[0] ? 'up' : 'down');
  const stroke = color ?? (t === 'up' ? p.up : t === 'down' ? p.down : p.muted);
  return (
    <Svg testID={testID} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <DrawPath d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
