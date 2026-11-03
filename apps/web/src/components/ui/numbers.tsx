'use client';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { pct, price, signed, toneClass } from '@/lib/format';

/** Counts from the previous value to the new one; formatting applied every frame. */
export function AnimatedNumber({
  value,
  format = (v) => price(v),
  className,
  duration = 0.9,
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value ?? 0);
  const [text, setText] = useState(() => (value === null || value === undefined ? '—' : format(value)));
  const first = useRef(true);

  useEffect(() => {
    if (value === null || value === undefined) {
      setText('—');
      return;
    }
    if (reduce) {
      setText(format(value));
      return;
    }
    const from = first.current ? value * 0.96 : mv.get();
    first.current = false;
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        mv.set(v);
        setText(format(v));
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return <span className={cn('num', className)}>{text}</span>;
}

/** A price that briefly washes green or red when it ticks. */
export function FlashPrice({
  value,
  dir,
  className,
  decimals = 2,
}: {
  value: number | null | undefined;
  dir?: 'up' | 'down' | 'flat';
  className?: string;
  decimals?: number;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (value !== null && value !== undefined && prev.current !== null && prev.current !== undefined && value !== prev.current) {
      setFlash(dir && dir !== 'flat' ? dir : value > prev.current ? 'up' : 'down');
      setKey((k) => k + 1);
    }
    prev.current = value;
  }, [value, dir]);

  return (
    <span
      key={key}
      className={cn(
        'num -mx-1 rounded px-1',
        flash === 'up' && 'animate-flash-up',
        flash === 'down' && 'animate-flash-down',
        className,
      )}
    >
      {price(value, decimals)}
    </span>
  );
}

export function Change({ value, pctValue, className }: { value?: number | null; pctValue: number | null | undefined; className?: string }) {
  return (
    <span className={cn('num', toneClass(pctValue), className)}>
      {value !== undefined && <>{signed(value)} </>}
      {value !== undefined ? `(${pct(pctValue)})` : pct(pctValue)}
    </span>
  );
}
