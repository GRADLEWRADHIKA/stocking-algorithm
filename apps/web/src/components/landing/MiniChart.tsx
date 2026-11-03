'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import type { Candle, IndicatorSeries } from '@shared/types/api';

/** Small SVG candlestick chart with the Supertrend drawn per regime (never joined across a flip). */
export function MiniChart({ candles, st, width = 480, height = 220 }: { candles: Candle[]; st?: IndicatorSeries; width?: number; height?: number }) {
  const reduce = useReducedMotion();
  const m = useMemo(() => {
    if (candles.length < 2) return null;
    const pad = { l: 4, r: 52, t: 8, b: 8 };
    const values = (st?.lines.value ?? []).map((p) => p.value);
    const lo = Math.min(...candles.map((c) => c.low), ...values);
    const hi = Math.max(...candles.map((c) => c.high), ...values);
    const step = (width - pad.l - pad.r) / candles.length;
    const x = (i: number) => pad.l + i * step + step / 2;
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);
    const idx = new Map(candles.map((c, i) => [c.time, i]));
    const dir = new Map((st?.lines.direction ?? []).map((p) => [p.time, p.value]));
    const segs: { side: number; d: string }[] = [];
    (st?.lines.value ?? []).forEach((p) => {
      const i = idx.get(p.time);
      const side = dir.get(p.time);
      if (i === undefined || side === undefined) return;
      const last = segs[segs.length - 1];
      const pt = `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      if (last && last.side === side) last.d += ` L${pt}`;
      else segs.push({ side, d: `M${pt}` });
    });
    const ticks = [hi, (hi + lo) / 2, lo];
    return { x, y, step, segs, ticks, pad };
  }, [candles, st, width, height]);

  if (!m) return null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="Daily candles with Supertrend">
      {m.ticks.map((t) => (
        <g key={t}>
          <line x1={m.pad.l} x2={width - m.pad.r} y1={m.y(t)} y2={m.y(t)} stroke="rgb(var(--rule))" />
          <text x={width - m.pad.r + 6} y={m.y(t) + 4} className="num fill-muted" style={{ fontSize: 10 }}>
            {t.toFixed(0)}
          </text>
        </g>
      ))}
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const col = up ? 'rgb(var(--up))' : 'rgb(var(--down))';
        return (
          <motion.g
            key={c.time}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.008, duration: 0.3 }}
          >
            <line x1={m.x(i)} x2={m.x(i)} y1={m.y(c.high)} y2={m.y(c.low)} stroke={col} strokeWidth={1} />
            <rect x={m.x(i) - m.step * 0.32} width={m.step * 0.64} y={m.y(Math.max(c.open, c.close))} height={Math.max(1, Math.abs(m.y(c.open) - m.y(c.close)))} fill={col} />
          </motion.g>
        );
      })}
      {m.segs.map((s, i) => (
        <motion.path
          key={i}
          d={s.d}
          fill="none"
          stroke={s.side > 0 ? 'rgb(var(--up))' : 'rgb(var(--down))'}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.4 + i * 0.05 }}
        />
      ))}
    </svg>
  );
}
