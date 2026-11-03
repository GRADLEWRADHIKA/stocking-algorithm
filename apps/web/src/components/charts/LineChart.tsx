'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { dateTime } from '@/lib/format';
import { useElementWidth } from '@/hooks/useElementWidth';

export interface LineSeries {
  name: string;
  color: string; // css colour
  points: { time: number; value: number }[];
  dashed?: boolean;
  fill?: boolean;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Dependency-free SVG time-series chart: y scale with round ticks, 4–6 dated
 * x labels, straight segments, hover crosshair with a plain tooltip.
 */
export function LineChart({
  series,
  height = 220,
  format = (v) => v.toFixed(2),
  zeroLine = false,
  dateOnly = true,
}: {
  series: LineSeries[];
  height?: number;
  format?: (v: number) => string;
  zeroLine?: boolean;
  dateOnly?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [box, W] = useElementWidth<HTMLDivElement>(800);
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const pad = { l: 64, r: 12, t: 10, b: 24 };

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length < 2) return null;
    const times = series[0].points.map((p) => p.time);
    const t0 = Math.min(...all.map((p) => p.time));
    const t1 = Math.max(...all.map((p) => p.time));
    let vmin = Math.min(...all.map((p) => p.value));
    let vmax = Math.max(...all.map((p) => p.value));
    if (zeroLine) {
      vmin = Math.min(vmin, 0);
      vmax = Math.max(vmax, 0);
    }
    const ticks = niceTicks(vmin, vmax);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
    const paths = series.map((s) => {
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
      const area = s.fill && s.points.length ? `${d} L${x(s.points[s.points.length - 1].time).toFixed(1)},${y(Math.max(lo, 0 > lo && zeroLine ? 0 : lo)).toFixed(1)} L${x(s.points[0].time).toFixed(1)},${y(Math.max(lo, 0 > lo && zeroLine ? 0 : lo)).toFixed(1)} Z` : null;
      return { d, area };
    });
    const nx = 5;
    const xLabels = Array.from({ length: nx }, (_, i) => times[Math.round((i * (times.length - 1)) / (nx - 1))]).filter((t) => t !== undefined);
    return { x, y, ticks, paths, xLabels, times };
  }, [series, H, W, zeroLine, pad.l, pad.r, pad.t, pad.b]);

  if (!model)
    return (
      <div ref={box} className="flex items-center justify-center text-xs text-muted" style={{ height }}>
        Not enough data to draw
      </div>
    );

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    model.times.forEach((t, i) => {
      const dd = Math.abs(model.x(t) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };

  const ht = hover !== null ? model.times[hover] : null;

  return (
    <div ref={box} className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={series.map((s) => s.name).join(', ')}
      >
        {model.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={model.y(t)} y2={model.y(t)} stroke="rgb(var(--rule))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 8} y={model.y(t) + 4} textAnchor="end" className="fill-muted num" style={{ fontSize: 11 }}>
              {format(t)}
            </text>
          </g>
        ))}
        {zeroLine && <line x1={pad.l} x2={W - pad.r} y1={model.y(0)} y2={model.y(0)} stroke="rgb(var(--faint))" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {model.xLabels.map((t, i) => (
          <text
            key={`${t}-${i}`}
            x={model.x(t)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === model.xLabels.length - 1 ? 'end' : 'middle'}
            className="fill-muted num"
            style={{ fontSize: 11 }}
          >
            {dateTime(t, !dateOnly)}
          </text>
        ))}
        {series.map((s, i) => (
          <g key={s.name}>
            {model.paths[i].area && <path d={model.paths[i].area!} fill={s.color} opacity={0.08} />}
            <motion.path
              d={model.paths[i].d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 1.25 : 1.75}
              strokeDasharray={s.dashed ? '4 4' : undefined}
              vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: i * 0.15 }}
            />
          </g>
        ))}
        {ht !== null && (
          <line x1={model.x(ht)} x2={model.x(ht)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--faint))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {ht !== null && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded border border-line bg-surface px-2 py-1.5 text-xs shadow-lg"
          style={{ left: `clamp(8px, calc(${(model.x(ht) / W) * 100}% + 10px), calc(100% - 180px))` }}
        >
          <div className="num text-muted">{dateTime(ht, !dateOnly)}</div>
          {series.map((s) => {
            const p = s.points[hover] ?? s.points.find((q) => q.time === ht);
            return (
              <div key={s.name} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-muted">{s.name}</span>
                <span className="num ml-auto text-ink">{p ? format(p.value) : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-0 w-3 border-t-2" style={{ borderColor: i.color, borderStyle: i.dashed ? 'dashed' : 'solid' }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
