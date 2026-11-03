'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, IndicatorSeries } from '@shared/types/api';
import { compact, price } from '@/lib/format';
import { useUi } from '@/stores/ui';

export type ChartKind = 'candles' | 'line' | 'area';

const OVERLAY_COLORS = ['#F2A63A', '#609BE6', '#C084FC', '#2DD4BF', '#F472B6', '#A3E635'];

function cssRgb(name: string, alpha = 1): string {
  if (typeof window === 'undefined') return '#888';
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgba(${v.split(/\s+/).join(',')},${alpha})` : '#888';
}

function baseOptions(height: number, showTime: boolean) {
  return {
    height,
    layout: { background: { color: 'transparent' }, textColor: cssRgb('muted'), fontFamily: 'var(--font-num), ui-monospace, monospace', fontSize: 11 },
    grid: { vertLines: { color: cssRgb('rule', 0.6) }, horzLines: { color: cssRgb('rule', 0.9) } },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: cssRgb('faint'), width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: cssRgb('raised') },
      horzLine: { color: cssRgb('faint'), width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: cssRgb('raised') },
    },
    rightPriceScale: { borderColor: cssRgb('line'), minimumWidth: 72 },
    timeScale: { borderColor: cssRgb('line'), timeVisible: showTime, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
    localization: { priceFormatter: (p: number) => price(p) },
    handleScroll: true,
    handleScale: true,
  };
}

/** IST wall clock for axis labels: lightweight-charts renders UTC, so shift by +5:30. */
const IST = 19800;
const t = (s: number) => (s + IST) as UTCTimestamp;

interface Props {
  candles: Candle[];
  kind: ChartKind;
  overlays: IndicatorSeries[];
  panes: IndicatorSeries[];
  intraday: boolean;
  height?: number;
  live?: { price: number; time: number } | null;
}

export function PriceChart({ candles, kind, overlays, panes, intraday, height = 440, live }: Props) {
  const theme = useUi((s) => s.theme);
  const mainEl = useRef<HTMLDivElement>(null);
  const paneEls = useRef<(HTMLDivElement | null)[]>([]);
  const charts = useRef<IChartApi[]>([]);
  const mainSeries = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const lastBar = useRef<Candle | null>(null);
  const [legend, setLegend] = useState<Candle | null>(null);

  const paneKey = panes.map((p) => p.id).join('|');

  useEffect(() => {
    if (!mainEl.current || candles.length === 0) return;
    const up = cssRgb('up');
    const down = cssRgb('down');
    const main = createChart(mainEl.current, { ...baseOptions(height, intraday), width: mainEl.current.clientWidth });
    const all: IChartApi[] = [main];

    let s: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>;
    if (kind === 'candles') {
      s = main.addCandlestickSeries({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
      s.setData(candles.map((c) => ({ time: t(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    } else if (kind === 'line') {
      s = main.addLineSeries({ color: cssRgb('ink'), lineWidth: 2 });
      s.setData(candles.map((c) => ({ time: t(c.time), value: c.close })));
    } else {
      s = main.addAreaSeries({ lineColor: cssRgb('accent'), topColor: cssRgb('accent', 0.22), bottomColor: cssRgb('accent', 0), lineWidth: 2 });
      s.setData(candles.map((c) => ({ time: t(c.time), value: c.close })));
    }
    mainSeries.current = s;
    lastBar.current = candles[candles.length - 1];

    const vol = main.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(candles.map((c) => ({ time: t(c.time), value: c.volume, color: c.close >= c.open ? cssRgb('up', 0.35) : cssRgb('down', 0.35) })));

    overlays.forEach((ind, i) => {
      if (ind.indicator === 'supertrend') {
        // green while the trend is up (support), red while down (resistance). v4 line series do not break on
        // whitespace, so each uninterrupted regime gets its own series.
        const dir = new Map((ind.lines.direction ?? []).map((p) => [p.time, p.value]));
        const segments: { side: number; pts: { time: UTCTimestamp; value: number }[] }[] = [];
        (ind.lines.value ?? []).forEach((p) => {
          const side = dir.get(p.time);
          if (side === undefined) return;
          const last = segments[segments.length - 1];
          if (last && last.side === side) last.pts.push({ time: t(p.time), value: p.value });
          else segments.push({ side, pts: [{ time: t(p.time), value: p.value }] });
        });
        segments.forEach((seg) => {
          const ls = main.addLineSeries({ color: seg.side > 0 ? up : down, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          ls.setData(seg.pts);
        });
        return;
      }
      Object.entries(ind.lines).forEach(([name, pts], j) => {
        const isBand = ind.indicator === 'bbands';
        const ls = main.addLineSeries({
          color: isBand && name !== 'middle' ? cssRgb('info', 0.7) : OVERLAY_COLORS[(i + j) % OVERLAY_COLORS.length],
          lineWidth: isBand && name !== 'middle' ? 1 : 2,
          lineStyle: isBand && name === 'middle' ? LineStyle.Dotted : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: j === 0 ? ind.name : '',
        });
        ls.setData(pts.map((p) => ({ time: t(p.time), value: p.value })));
      });
    });

    panes.forEach((ind, i) => {
      const el = paneEls.current[i];
      if (!el) return;
      const pc = createChart(el, { ...baseOptions(130, intraday), width: el.clientWidth });
      Object.entries(ind.lines).forEach(([name, pts], j) => {
        if (name === 'histogram') {
          const h = pc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
          h.setData(pts.map((p) => ({ time: t(p.time), value: p.value, color: p.value >= 0 ? cssRgb('up', 0.55) : cssRgb('down', 0.55) })));
          return;
        }
        const ls = pc.addLineSeries({
          color: j === 0 ? cssRgb('ink', 0.9) : OVERLAY_COLORS[j % OVERLAY_COLORS.length],
          lineWidth: j === 0 ? 2 : 1,
          priceLineVisible: false,
          lastValueVisible: j === 0,
          crosshairMarkerVisible: false,
        });
        ls.setData(pts.map((p) => ({ time: t(p.time), value: p.value })));
        if (j === 0 && (ind.indicator === 'rsi' || ind.indicator === 'stoch')) {
          ls.createPriceLine({ price: 70, color: cssRgb('down', 0.5), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
          ls.createPriceLine({ price: 30, color: cssRgb('up', 0.5), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        }
      });
      all.push(pc);
    });

    // keep every pane on one time axis
    let syncing = false;
    all.forEach((c) =>
      c.timeScale().subscribeVisibleLogicalRangeChange((r: LogicalRange | null) => {
        if (syncing || !r) return;
        syncing = true;
        all.forEach((o) => o !== c && o.timeScale().setVisibleLogicalRange(r));
        syncing = false;
      }),
    );

    const byTime = new Map(candles.map((c) => [c.time + IST, c]));
    main.subscribeCrosshairMove((p: MouseEventParams<Time>) => {
      setLegend(p.time ? byTime.get(p.time as number) ?? null : null);
    });

    const visible = Math.min(candles.length, intraday ? 180 : 160);
    main.timeScale().setVisibleLogicalRange({ from: candles.length - visible, to: candles.length + 4 });

    const ro = new ResizeObserver(() => {
      all.forEach((c, i) => {
        const el = i === 0 ? mainEl.current : paneEls.current[i - 1];
        if (el) c.applyOptions({ width: el.clientWidth });
      });
    });
    ro.observe(mainEl.current);
    charts.current = all;

    return () => {
      ro.disconnect();
      all.forEach((c) => c.remove());
      charts.current = [];
      mainSeries.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, kind, overlays, paneKey, intraday, height, theme]);

  // live tick: move the last bar's close (and extend high/low) without rebuilding the chart
  useEffect(() => {
    const s = mainSeries.current;
    const b = lastBar.current;
    if (!s || !b || !live) return;
    const nb = { ...b, close: live.price, high: Math.max(b.high, live.price), low: Math.min(b.low, live.price) };
    lastBar.current = nb;
    if (kind === 'candles') (s as ISeriesApi<'Candlestick'>).update({ time: t(nb.time), open: nb.open, high: nb.high, low: nb.low, close: nb.close });
    else (s as ISeriesApi<'Line'>).update({ time: t(nb.time), value: nb.close });
  }, [live, kind]);

  const shown = legend ?? lastBar.current ?? candles[candles.length - 1];
  const chg = shown ? shown.close - shown.open : 0;

  return (
    <div className="relative">
      {shown && (
        <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {(['open', 'high', 'low', 'close'] as const).map((k) => (
            <span key={k} className="text-muted">
              {k[0].toUpperCase()} <span className={`num ${chg >= 0 ? 'text-up' : 'text-down'}`}>{price(shown[k])}</span>
            </span>
          ))}
          <span className="text-muted">
            Vol <span className="num text-ink">{compact(shown.volume)}</span>
          </span>
          {overlays.map((o, i) => (
            <span key={o.id} className="flex items-center gap-1 text-muted">
              {o.indicator === 'supertrend' ? (
                <span className="flex">
                  <span className="h-0.5 w-1.5 rounded-l" style={{ background: cssRgb('up') }} />
                  <span className="h-0.5 w-1.5 rounded-r" style={{ background: cssRgb('down') }} />
                </span>
              ) : (
                <span className="h-0.5 w-3 rounded" style={{ background: o.indicator === 'bbands' ? cssRgb('info', 0.7) : OVERLAY_COLORS[i % OVERLAY_COLORS.length] }} />
              )}
              {o.name}
            </span>
          ))}
        </div>
      )}
      <div ref={mainEl} style={{ height }} />
      {panes.map((p, i) => (
        <div key={p.id} className="relative border-t border-rule">
          <span className="pointer-events-none absolute left-3 top-1.5 z-10 text-xs text-muted">{p.name}</span>
          <div ref={(el) => { paneEls.current[i] = el; }} style={{ height: 130 }} />
        </div>
      ))}
    </div>
  );
}

