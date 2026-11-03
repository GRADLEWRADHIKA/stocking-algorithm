'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

/** Tiny trend line; draws itself in once. Colour follows the sign of first→last. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  strokeWidth = 1.5,
  tone,
}: {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  tone?: 'up' | 'down' | 'flat';
}) {
  const reduce = useReducedMotion();
  const d = useMemo(() => {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const step = width / (data.length - 1);
    return data
      .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(2)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(2)}`)
      .join(' ');
  }, [data, width, height]);

  if (!d) return <svg width={width} height={height} aria-hidden />;
  const t = tone ?? (data[data.length - 1] >= data[0] ? 'up' : 'down');
  const color = t === 'up' ? 'rgb(var(--up))' : t === 'down' ? 'rgb(var(--down))' : 'rgb(var(--muted))';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
