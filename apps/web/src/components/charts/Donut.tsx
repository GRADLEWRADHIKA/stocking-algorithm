'use client';
import { motion, useReducedMotion } from 'framer-motion';

const PALETTE = ['rgb(var(--ink))', 'rgb(var(--accent))', 'rgb(var(--info))', 'rgb(var(--up))', 'rgb(var(--muted))', 'rgb(var(--faint))'];

/** Thin ring for 3–6 parts of a whole; the remainder past five is grouped as "Other". */
export function Donut({ parts, size = 132, stroke = 10, center }: { parts: { label: string; value: number }[]; size?: number; stroke?: number; center?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const sorted = [...parts].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, p) => s + p.value, 0);
  const data = rest > 0 ? [...top, { label: 'Other', value: rest }] : top;
  const total = data.reduce((s, p) => s + p.value, 0) || 1;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--raised))" strokeWidth={stroke} />
          {data.map((p, i) => {
            const len = (p.value / total) * C;
            const gap = data.length > 1 ? 2 : 0;
            const el = (
              <motion.circle
                key={p.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={stroke}
                strokeDashoffset={-acc}
                initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
                animate={{ strokeDasharray: `${Math.max(0, len - gap)} ${C}` }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            );
            acc += len;
            return el;
          })}
        </svg>
        {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate text-muted">{p.label}</span>
            <span className="num ml-auto text-ink">{((p.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
