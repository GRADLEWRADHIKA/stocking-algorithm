'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { get } from '@/lib/api';
import { pct, price, toneClass } from '@/lib/format';
import { Logo } from '@/components/layout/Logo';
import { SourceBadge } from '@/components/ui/badge';
import type { IndexQuote } from '@shared/types/api';

function IndexLine({ q, i }: { q: IndexQuote; i: number }) {
  const reduce = useReducedMotion();
  const d = useMemo(() => {
    const s = q.sparkline;
    if (s.length < 2) return '';
    const min = Math.min(...s);
    const max = Math.max(...s);
    return s.map((v, k) => `${k ? 'L' : 'M'}${((k / (s.length - 1)) * 300).toFixed(1)},${(56 - ((v - min) / (max - min || 1)) * 52).toFixed(1)}`).join(' ');
  }, [q.sparkline]);
  const up = q.change_pct >= 0;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + i * 0.09, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="grid grid-cols-[140px_1fr_auto] items-center gap-6 border-t border-rule py-4"
    >
      <div>
        <div className="text-[13px] font-medium">{q.name}</div>
        <div className="num text-lg">{price(q.value)}</div>
      </div>
      <svg viewBox="0 0 300 60" className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
        <motion.path
          d={d}
          fill="none"
          stroke={up ? 'rgb(var(--up))' : 'rgb(var(--down))'}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.4 + i * 0.09, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className={`num w-20 text-right text-[13px] ${toneClass(q.change_pct)}`}>{pct(q.change_pct)}</div>
    </motion.div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({ queryKey: ['market', 'indices'], queryFn: () => get<IndexQuote[]>('/market/indices'), retry: 0 });
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-12 lg:flex">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-base font-semibold tracking-tight">QuantDesk</span>
        </div>
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-xl text-[44px] font-semibold leading-[1.05] tracking-[-0.03em]"
          >
            Signals that show their working.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted"
          >
            Quantitative analysis, rule-based strategies, honest backtests and paper trading for NSE and BSE equities. Every signal lists the conditions it
            checked, the levels it set and the risk it carries.
          </motion.p>
          <div className="mt-10">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted">Indices, last 60 sessions</span>
              <SourceBadge source={data?.[0]?.data_source ?? 'SIMULATED'} />
            </div>
            {(data ?? []).slice(0, 5).map((q, i) => (
              <IndexLine key={q.symbol} q={q} i={i} />
            ))}
            {!data && (
              <div className="space-y-3 border-t border-rule pt-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12" />
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="max-w-lg text-xs leading-relaxed text-faint">
          Runs entirely on your machine. Prices are simulated or from imported historical datasets and are never real-time NSE/BSE quotes. Paper trading
          only — no real money moves. Nothing here is investment advice.
        </p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo size={26} />
            <span className="text-base font-semibold tracking-tight">QuantDesk</span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
