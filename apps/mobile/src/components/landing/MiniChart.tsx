import React, {useMemo, useState} from 'react';
import {View, type LayoutChangeEvent} from 'react-native';
import Svg, {G, Line, Rect, Text as SvgText} from 'react-native-svg';
import type {Candle, IndicatorSeries} from '../../api/types';
import {FONTS, usePalette} from '../../theme';
import {splitSupertrend} from '../../utils/supertrend';
import {DrawPath} from '../charts/DrawPath';

/** Web landing MiniChart: small candlestick chart with Supertrend drawn per regime (never joined across a flip). */
export function MiniChart({candles, st, height = 200}: {candles: Candle[]; st?: IndicatorSeries; height?: number}) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const m = useMemo(() => {
    if (candles.length < 2 || width <= 0) {
      return null;
    }
    const pad = {l: 4, r: 46, t: 8, b: 8};
    const values = (st?.lines.value ?? []).map(x => x.value).filter(Number.isFinite);
    const lo = Math.min(...candles.map(c => c.low), ...values);
    const hi = Math.max(...candles.map(c => c.high), ...values);
    const step = (width - pad.l - pad.r) / candles.length;
    const x = (i: number) => pad.l + i * step + step / 2;
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);
    const idx = new Map(candles.map((c, i) => [c.time, i]));
    const segs = splitSupertrend(st?.lines.value, st?.lines.direction)
      .map(s => ({
        side: s.side,
        d: s.points
          .filter(pt => idx.has(pt.time))
          .map((pt, j) => `${j ? 'L' : 'M'}${x(idx.get(pt.time) as number).toFixed(1)},${y(pt.value).toFixed(1)}`)
          .join(' '),
      }))
      .filter(s => s.d);
    return {x, y, step, segs, ticks: [hi, (hi + lo) / 2, lo], pad};
  }, [candles, st, width, height]);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Daily candles with Supertrend" accessibilityRole="image">
      {m ? (
        <Svg width={width} height={height}>
          {m.ticks.map(t => (
            <G key={t}>
              <Line x1={m.pad.l} x2={width - m.pad.r} y1={m.y(t)} y2={m.y(t)} stroke={p.rule} />
              <SvgText x={width - m.pad.r + 6} y={m.y(t) + 4} fill={p.muted} fontSize={10} fontFamily={FONTS.num['400']}>
                {t.toFixed(0)}
              </SvgText>
            </G>
          ))}
          {candles.map((c, i) => {
            const col = c.close >= c.open ? p.up : p.down;
            return (
              <G key={c.time}>
                <Line x1={m.x(i)} x2={m.x(i)} y1={m.y(c.high)} y2={m.y(c.low)} stroke={col} strokeWidth={1} />
                <Rect
                  x={m.x(i) - m.step * 0.32}
                  width={m.step * 0.64}
                  y={m.y(Math.max(c.open, c.close))}
                  height={Math.max(1, Math.abs(m.y(c.open) - m.y(c.close)))}
                  fill={col}
                />
              </G>
            );
          })}
          {m.segs.map((s, i) => (
            <DrawPath
              key={i}
              testID={s.side > 0 ? 'mini-supertrend-up' : 'mini-supertrend-down'}
              d={s.d}
              fill="none"
              stroke={s.side > 0 ? p.up : p.down}
              strokeWidth={2}
              strokeLinejoin="round"
              duration={900}
              delay={400 + i * 50}
            />
          ))}
        </Svg>
      ) : (
        <View style={{height}} />
      )}
    </View>
  );
}
