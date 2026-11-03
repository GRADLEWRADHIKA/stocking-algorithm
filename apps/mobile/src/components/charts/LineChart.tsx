import React, {useMemo, useState} from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Svg, {G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import Animated, {FadeIn} from 'react-native-reanimated';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {CUSTOM_FONTS, FONTS, alpha, usePalette} from '../../theme';
import {DrawPath} from './DrawPath';
import {areaPath, extent, linear, linePath, padExtent, shortNum, ticks} from './scale';

export interface LineSeries {
  key: string;
  values: Array<number | null>;
  color: string;
  strokeWidth?: number;
  area?: boolean;
  dashed?: boolean;
}

export interface HistogramSeries {
  values: Array<number | null>;
  positive?: string;
  negative?: string;
}

export interface RefLine {
  value: number;
  color?: string;
  label?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  histogram?: HistogramSeries;
  height?: number;
  /** Fixed y-domain (e.g. [0,100] for RSI). */
  yDomain?: [number, number];
  refLines?: RefLine[];
  showAxis?: boolean;
  formatY?: (v: number) => string;
  /** Changing this key re-runs the fade-in transition (e.g. on timeframe change). */
  transitionKey?: string;
  testID?: string;
}

const AXIS_W = 46;

/** Multi-series line / area chart (+ optional zero-centred histogram) in plain SVG. */
export function LineChart({
  series,
  histogram,
  height = 180,
  yDomain,
  refLines,
  showAxis = true,
  formatY = shortNum,
  transitionKey,
  testID,
}: LineChartProps) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const plotW = Math.max(0, width - (showAxis ? AXIS_W : 0));
  const n = Math.max(series[0]?.values.length ?? 0, histogram?.values.length ?? 0);

  const computed = useMemo(() => {
    if (!plotW || n < 2) {
      return null;
    }
    const all: Array<number | null> = [];
    series.forEach(s => all.push(...s.values));
    histogram?.values.forEach(v => all.push(v));
    if (histogram) {
      all.push(0);
    }
    refLines?.forEach(r => all.push(r.value));
    const domain = yDomain ?? padExtent(extent(all));
    const x = linear([0, n - 1], [2, plotW - 2]);
    const y = linear(domain, [height - 6, 6]);
    return {domain, x, y};
  }, [series, histogram, refLines, yDomain, plotW, n, height]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View testID={testID} style={{height}} onLayout={onLayout}>
      {computed ? (
        <Animated.View key={transitionKey} entering={reduce ? undefined : FadeIn.duration(350)} style={StyleSheet.absoluteFill}>
          <Svg width={width} height={height}>
            {showAxis
              ? ticks(computed.domain, 4).map(t => (
                  <G key={`t${t}`}>
                    <Line x1={0} x2={plotW} y1={computed.y(t)} y2={computed.y(t)} stroke={alpha(p.rule, 0.9)} strokeWidth={1} />
                    <SvgText x={plotW + 6} y={computed.y(t) + 4} fontSize={10} fill={p.muted} fontFamily={CUSTOM_FONTS ? FONTS.num['400'] : undefined}>
                      {formatY(t)}
                    </SvgText>
                  </G>
                ))
              : null}
            {refLines?.map(r => (
              <G key={`r${r.value}`}>
                <Line
                  x1={0}
                  x2={plotW}
                  y1={computed.y(r.value)}
                  y2={computed.y(r.value)}
                  stroke={r.color ?? p.faint}
                  strokeDasharray="4,4"
                  strokeWidth={1}
                />
                {r.label ? (
                  <SvgText x={4} y={computed.y(r.value) - 3} fontSize={9} fill={r.color ?? p.faint}>
                    {r.label}
                  </SvgText>
                ) : null}
              </G>
            ))}
            {histogram
              ? histogram.values.map((v, i) => {
                  if (v === null || !Number.isFinite(v)) {
                    return null;
                  }
                  const bw = Math.max(1, plotW / n - 1);
                  const y0 = computed.y(0);
                  const yv = computed.y(v);
                  return (
                    <Rect
                      key={`h${i}`}
                      x={computed.x(i) - bw / 2}
                      y={Math.min(y0, yv)}
                      width={bw}
                      height={Math.max(1, Math.abs(yv - y0))}
                      fill={v >= 0 ? histogram.positive ?? p.up : histogram.negative ?? p.down}
                      opacity={0.6}
                    />
                  );
                })
              : null}
            {series.map(s => (
              <G key={s.key}>
                {s.area ? <Path d={areaPath(s.values, computed.x, computed.y, height)} fill={s.color} opacity={0.08} /> : null}
                {s.dashed ? (
                  <Path
                    d={linePath(s.values, computed.x, computed.y)}
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 1.6}
                    strokeDasharray="5,4"
                    fill="none"
                    strokeLinejoin="round"
                  />
                ) : (
                  <DrawPath
                    d={linePath(s.values, computed.x, computed.y)}
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 1.6}
                    fill="none"
                    strokeLinejoin="round"
                  />
                )}
              </G>
            ))}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
