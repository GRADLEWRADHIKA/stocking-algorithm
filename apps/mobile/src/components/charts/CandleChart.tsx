import React, {useMemo, useState} from 'react';
import {StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent} from 'react-native';
import Svg, {G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import Animated, {FadeIn} from 'react-native-reanimated';
import type {Candle, IndicatorSeries, SeriesPoint} from '../../api/types';
import {useReduceMotion} from '../../hooks/useReduceMotion';
import {alpha, CUSTOM_FONTS, FONTS, OVERLAY_COLORS, usePalette} from '../../theme';
import {compact, dateTime, price} from '../../utils/fmt';
import {splitSupertrend} from '../../utils/supertrend';
import type {ChartKind} from '../../utils/chartConfig';
import {Txt} from '../Txt';
import {DrawPath} from './DrawPath';
import {extent, linear, padExtent, shortNum, ticks} from './scale';

export type {ChartKind};

export interface CandleChartProps {
  candles: Candle[];
  kind?: ChartKind;
  /** Overlay indicators (pane === 'overlay'): drawn on the price scale. */
  overlays?: IndicatorSeries[];
  /** Separate-pane indicators: one stacked pane each, sharing the time axis. */
  panes?: IndicatorSeries[];
  intraday?: boolean;
  height?: number;
  paneHeight?: number;
  /** Live tick: moves the last bar's close (and extends high/low) without a refetch. */
  live?: {price: number; time: number} | null;
  /** How many of the most recent bars fit the phone width. */
  visibleBars?: number;
  testID?: string;
}

const AXIS_W = 58;
const X_AXIS_H = 18;
const NUM_FONT = CUSTOM_FONTS ? FONTS.num['400'] : undefined;

type Model = {
  bars: Candle[];
  idx: Map<number, number>;
  x: (i: number) => number;
  bw: number;
};

/** Polyline through time-keyed points that fall inside the visible window (breaks on gaps). */
function seriesPath(points: SeriesPoint[] | undefined, m: Model, y: (v: number) => number): string {
  if (!points?.length) {
    return '';
  }
  let d = '';
  let last = -2;
  for (const pt of points) {
    const i = m.idx.get(pt.time);
    if (i === undefined || !Number.isFinite(pt.value)) {
      last = -2;
      continue;
    }
    d += `${i === last + 1 && d ? 'L' : 'M'}${m.x(i).toFixed(2)},${y(pt.value).toFixed(2)}`;
    last = i;
  }
  return d;
}

function visibleValues(points: SeriesPoint[] | undefined, m: Model): number[] {
  return (points ?? []).filter(pt => m.idx.has(pt.time) && Number.isFinite(pt.value)).map(pt => pt.value);
}

function timeLabel(t: number, intraday: boolean): string {
  const s = dateTime(t, intraday);
  return intraday ? s.slice(5) : s;
}

/**
 * Phone version of the web PriceChart: candles / line / area with a volume histogram,
 * overlays on price (Supertrend split by regime), separate indicator panes on one time axis,
 * an OHLC legend that follows the finger, and the live tick applied to the last bar.
 */
export function CandleChart({
  candles,
  kind = 'candles',
  overlays = [],
  panes = [],
  intraday = false,
  height = 320,
  paneHeight = 110,
  live,
  visibleBars,
  testID,
}: CandleChartProps) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const plotW = Math.max(0, width - AXIS_W);

  const model = useMemo<Model | null>(() => {
    if (!plotW || candles.length < 2) {
      return null;
    }
    const n = Math.min(candles.length, visibleBars ?? Math.max(40, Math.floor(plotW / 4.5)));
    const bars = candles.slice(-n).map(c => ({...c}));
    if (live && bars.length) {
      const b = bars[bars.length - 1];
      bars[bars.length - 1] = {...b, close: live.price, high: Math.max(b.high, live.price), low: Math.min(b.low, live.price)};
    }
    const idx = new Map(bars.map((c, i) => [c.time, i]));
    const step = plotW / (bars.length + 2);
    return {bars, idx, x: (i: number) => step * (i + 1), bw: Math.max(1, step * 0.66)};
  }, [candles, plotW, live, visibleBars]);

  const main = useMemo(() => {
    if (!model) {
      return null;
    }
    const priceH = height - X_AXIS_H;
    const vals: number[] = [];
    model.bars.forEach(c => {
      if (kind === 'candles') {
        vals.push(c.high, c.low);
      } else {
        vals.push(c.close);
      }
    });
    overlays.forEach(o => {
      const keys = o.indicator === 'supertrend' ? ['value'] : Object.keys(o.lines);
      keys.forEach(k => vals.push(...visibleValues(o.lines[k], model)));
    });
    const domain = padExtent(extent(vals), 0.05);
    // volume occupies the bottom 18% (web: scaleMargins top 0.82)
    const y = linear(domain, [priceH * 0.8, 6]);
    const maxVol = Math.max(1, ...model.bars.map(c => c.volume));
    const vy = (v: number) => priceH - (v / maxVol) * priceH * 0.18;
    return {y, domain, vy, priceH};
  }, [model, overlays, kind, height]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const touch = (e: GestureResponderEvent) => {
    if (!model) {
      return;
    }
    const step = plotW / (model.bars.length + 2);
    const i = Math.round(e.nativeEvent.locationX / step) - 1;
    setCursor(Math.max(0, Math.min(model.bars.length - 1, i)));
  };

  const shown = model ? model.bars[cursor ?? model.bars.length - 1] : candles[candles.length - 1];
  const chg = shown ? shown.close - shown.open : 0;
  const animKey = `${candles.length}-${candles[0]?.time}-${kind}`;

  const closePath = model && main ? model.bars.map((c, i) => `${i ? 'L' : 'M'}${model.x(i).toFixed(2)},${main.y(c.close).toFixed(2)}`).join('') : '';

  return (
    <View testID={testID}>
      {shown ? (
        <View style={styles.legend} pointerEvents="none">
          {(['open', 'high', 'low', 'close'] as const).map(k => (
            <Txt key={k} variant="micro" tone="muted">
              {k[0].toUpperCase()}{' '}
              <Txt variant="micro" num color={chg >= 0 ? p.up : p.down}>
                {price(shown[k])}
              </Txt>
            </Txt>
          ))}
          <Txt variant="micro" tone="muted">
            Vol{' '}
            <Txt variant="micro" num>
              {compact(shown.volume)}
            </Txt>
          </Txt>
          {cursor !== null ? (
            <Txt variant="micro" num tone="faint">
              {dateTime(shown.time, intraday)}
            </Txt>
          ) : null}
          {overlays.map((o, i) => (
            <View key={o.id} style={styles.legendItem}>
              {o.indicator === 'supertrend' ? (
                <View style={styles.row}>
                  <View style={[styles.swatchHalf, {backgroundColor: p.up}]} />
                  <View style={[styles.swatchHalf, {backgroundColor: p.down}]} />
                </View>
              ) : (
                <View style={[styles.swatch, {backgroundColor: o.indicator === 'bbands' ? alpha(p.info, 0.7) : OVERLAY_COLORS[i % OVERLAY_COLORS.length]}]} />
              )}
              <Txt variant="micro" tone="muted">
                {o.name}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <View
        onLayout={onLayout}
        style={{height}}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={touch}
        onResponderMove={touch}
        onResponderRelease={() => setCursor(null)}
        onResponderTerminate={() => setCursor(null)}
        accessibilityLabel={shown ? `Price chart. Last close ${price(shown.close)}` : 'Price chart'}>
        {model && main ? (
          <Animated.View key={animKey} entering={reduce ? undefined : FadeIn.duration(300)} style={StyleSheet.absoluteFill}>
            <Svg width={width} height={height}>
              {ticks(main.domain, 5).map(t =>
                main.y(t) > 4 && main.y(t) < main.priceH * 0.8 ? (
                  <G key={`t${t}`}>
                    <Line x1={0} x2={plotW} y1={main.y(t)} y2={main.y(t)} stroke={alpha(p.rule, 0.9)} strokeWidth={1} />
                    <SvgText x={plotW + 6} y={main.y(t) + 3.5} fontSize={10} fill={p.muted} fontFamily={NUM_FONT}>
                      {price(t, t >= 1000 ? 0 : 2)}
                    </SvgText>
                  </G>
                ) : null,
              )}
              <Line x1={plotW} x2={plotW} y1={0} y2={main.priceH} stroke={p.line} strokeWidth={1} />
              <Line x1={0} x2={width} y1={main.priceH} y2={main.priceH} stroke={p.line} strokeWidth={1} />
              {[0.1, 0.5, 0.9].map(f => {
                const i = Math.round((model.bars.length - 1) * f);
                const c = model.bars[i];
                return c ? (
                  <SvgText key={`x${f}`} x={model.x(i)} y={height - 5} fontSize={10} fill={p.muted} textAnchor="middle" fontFamily={NUM_FONT}>
                    {timeLabel(c.time, intraday)}
                  </SvgText>
                ) : null;
              })}

              {/* volume */}
              {model.bars.map((c, i) => (
                <Rect
                  key={`v${c.time}`}
                  x={model.x(i) - model.bw / 2}
                  y={main.vy(c.volume)}
                  width={model.bw}
                  height={Math.max(0.5, main.priceH - main.vy(c.volume))}
                  fill={c.close >= c.open ? alpha(p.up, 0.35) : alpha(p.down, 0.35)}
                />
              ))}

              {/* price */}
              {kind === 'candles'
                ? model.bars.map((c, i) => {
                    const up = c.close >= c.open;
                    const col = up ? p.up : p.down;
                    const top = main.y(Math.max(c.open, c.close));
                    const bot = main.y(Math.min(c.open, c.close));
                    return (
                      <G key={`c${c.time}`}>
                        <Line x1={model.x(i)} x2={model.x(i)} y1={main.y(c.high)} y2={main.y(c.low)} stroke={col} strokeWidth={1} />
                        <Rect x={model.x(i) - model.bw / 2} y={top} width={model.bw} height={Math.max(1, bot - top)} fill={col} />
                      </G>
                    );
                  })
                : null}
              {kind === 'area' ? (
                <Path
                  d={`${closePath}L${model.x(model.bars.length - 1).toFixed(2)},${(main.priceH * 0.8).toFixed(2)}L${model.x(0).toFixed(2)},${(main.priceH * 0.8).toFixed(2)}Z`}
                  fill={alpha(p.accent, 0.14)}
                />
              ) : null}
              {kind !== 'candles' ? (
                <DrawPath d={closePath} fill="none" stroke={kind === 'area' ? p.accent : p.ink} strokeWidth={2} strokeLinejoin="round" />
              ) : null}

              {/* overlays */}
              {overlays.map((o, i) => {
                if (o.indicator === 'supertrend') {
                  // one path per uninterrupted regime: green support in uptrend, red resistance in downtrend
                  return splitSupertrend(o.lines.value, o.lines.direction).map((seg, k) => {
                    const d = seriesPath(seg.points, model, main.y);
                    return d ? (
                      <Path
                        key={`${o.id}-st${k}`}
                        testID={`supertrend-${seg.side > 0 ? 'up' : 'down'}`}
                        d={d}
                        fill="none"
                        stroke={seg.side > 0 ? p.up : p.down}
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                    ) : null;
                  });
                }
                return Object.entries(o.lines).map(([name, pts], j) => {
                  const band = o.indicator === 'bbands';
                  const d = seriesPath(pts, model, main.y);
                  return d ? (
                    <Path
                      key={`${o.id}-${name}`}
                      d={d}
                      fill="none"
                      stroke={band && name !== 'middle' ? alpha(p.info, 0.7) : OVERLAY_COLORS[(i + j) % OVERLAY_COLORS.length]}
                      strokeWidth={band && name !== 'middle' ? 1 : 1.6}
                      strokeDasharray={band && name === 'middle' ? '2,3' : undefined}
                      strokeLinejoin="round"
                    />
                  ) : null;
                });
              })}

              {cursor !== null ? (
                <G>
                  <Line x1={model.x(cursor)} x2={model.x(cursor)} y1={0} y2={main.priceH} stroke={p.faint} strokeWidth={1} strokeDasharray="3,3" />
                  <Line x1={0} x2={plotW} y1={main.y(model.bars[cursor].close)} y2={main.y(model.bars[cursor].close)} stroke={p.faint} strokeWidth={1} strokeDasharray="3,3" />
                </G>
              ) : null}
              {/* last price marker */}
              {(() => {
                const last = model.bars[model.bars.length - 1];
                const ly = main.y(last.close);
                const col = last.close >= last.open ? p.up : p.down;
                return (
                  <G>
                    <Rect x={plotW + 1} y={ly - 8} width={AXIS_W - 2} height={16} rx={3} fill={col} />
                    <SvgText x={plotW + 6} y={ly + 3.5} fontSize={10} fill={p.onFill} fontFamily={NUM_FONT}>
                      {price(last.close, last.close >= 10000 ? 0 : 2)}
                    </SvgText>
                  </G>
                );
              })()}
            </Svg>
          </Animated.View>
        ) : null}
      </View>

      {model
        ? panes.map(pane => <IndicatorPane key={pane.id} pane={pane} model={model} plotW={plotW} width={width} height={paneHeight} cursor={cursor} />)
        : null}
    </View>
  );
}

function IndicatorPane({
  pane,
  model,
  plotW,
  width,
  height,
  cursor,
}: {
  pane: IndicatorSeries;
  model: Model;
  plotW: number;
  width: number;
  height: number;
  cursor: number | null;
}) {
  const p = usePalette();
  const entries = Object.entries(pane.lines);
  const bounded = pane.indicator === 'rsi' || pane.indicator === 'stoch';
  const vals: number[] = [];
  entries.forEach(([, pts]) => vals.push(...visibleValues(pts, model)));
  if (pane.lines.histogram) {
    vals.push(0);
  }
  const domain: [number, number] = bounded ? [0, 100] : padExtent(extent(vals), 0.08);
  const y = linear(domain, [height - 6, 16]);
  let lineIdx = 0;
  const lastVal = (pts: SeriesPoint[] | undefined) => {
    const v = (pts ?? []).filter(pt => model.idx.has(pt.time));
    return v.length ? v[v.length - 1].value : null;
  };
  const first = entries.find(([n]) => n !== 'histogram');
  const fv = first ? lastVal(first[1]) : null;
  return (
    <View testID={`pane-${pane.indicator}`} style={[styles.pane, {borderTopColor: p.rule, height}]}>
      <Svg width={width} height={height}>
        {(bounded ? [30, 50, 70] : ticks(domain, 3)).map(t => (
          <G key={`g${t}`}>
            {!bounded ? <Line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={alpha(p.rule, 0.9)} strokeWidth={1} /> : null}
            <SvgText x={plotW + 6} y={y(t) + 3.5} fontSize={10} fill={p.muted} fontFamily={NUM_FONT}>
              {shortNum(t)}
            </SvgText>
          </G>
        ))}
        <Line x1={plotW} x2={plotW} y1={0} y2={height} stroke={p.line} strokeWidth={1} />
        {bounded ? (
          <>
            <Line x1={0} x2={plotW} y1={y(70)} y2={y(70)} stroke={alpha(p.down, 0.5)} strokeDasharray="4,4" strokeWidth={1} />
            <Line x1={0} x2={plotW} y1={y(30)} y2={y(30)} stroke={alpha(p.up, 0.5)} strokeDasharray="4,4" strokeWidth={1} />
          </>
        ) : null}
        {entries.map(([name, pts]) => {
          if (name === 'histogram') {
            const y0 = y(0);
            return (
              <G key={name}>
                {(pts ?? []).map(pt => {
                  const i = model.idx.get(pt.time);
                  if (i === undefined || !Number.isFinite(pt.value)) {
                    return null;
                  }
                  const yv = y(pt.value);
                  return (
                    <Rect
                      key={`h${pt.time}`}
                      x={model.x(i) - model.bw / 2}
                      y={Math.min(y0, yv)}
                      width={model.bw}
                      height={Math.max(0.5, Math.abs(yv - y0))}
                      fill={pt.value >= 0 ? alpha(p.up, 0.55) : alpha(p.down, 0.55)}
                    />
                  );
                })}
              </G>
            );
          }
          const j = lineIdx++;
          const d = seriesPath(pts, model, y);
          return d ? (
            <DrawPath
              key={name}
              d={d}
              fill="none"
              stroke={j === 0 ? alpha(p.ink, 0.9) : OVERLAY_COLORS[j % OVERLAY_COLORS.length]}
              strokeWidth={j === 0 ? 1.6 : 1}
              strokeLinejoin="round"
              duration={800}
            />
          ) : null;
        })}
        {cursor !== null ? (
          <Line x1={model.x(cursor)} x2={model.x(cursor)} y1={0} y2={height} stroke={p.faint} strokeWidth={1} strokeDasharray="3,3" />
        ) : null}
      </Svg>
      <View style={styles.paneLabel} pointerEvents="none">
        <Txt variant="micro" tone="muted">
          {pane.name}
        </Txt>
        {fv !== null ? (
          <Txt variant="micro" num>
            {pane.indicator === 'obv' ? compact(fv) : price(fv)}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
  row: {flexDirection: 'row'},
  swatch: {width: 12, height: 2, borderRadius: 1},
  swatchHalf: {width: 6, height: 2},
  pane: {borderTopWidth: 1},
  paneLabel: {position: 'absolute', left: 12, top: 3, flexDirection: 'row', gap: 6},
});
