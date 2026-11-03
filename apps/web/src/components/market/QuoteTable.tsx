'use client';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLive } from '@/stores/live';
import { compact, pct, toneClass } from '@/lib/format';
import { FlashPrice } from '@/components/ui/numbers';
import { cn } from '@/lib/utils';
import type { Quote } from '@shared/types/api';

/** Compact quote list that merges the live simulated tick over the REST snapshot. */
export function QuoteTable({ rows, metric = 'change', limit = 5 }: { rows: Quote[]; metric?: 'change' | 'volume' | 'value'; limit?: number }) {
  const router = useRouter();
  const ticks = useLive((s) => s.ticks);
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Symbol</th>
          <th className="r">Price</th>
          <th className="r">{metric === 'change' ? 'Change' : metric === 'volume' ? 'Volume' : 'Traded value'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((q, i) => {
          const live = ticks[q.symbol];
          const p = live?.price ?? q.price;
          const c = live?.change_pct ?? q.change_pct;
          const v = live?.volume ?? q.volume;
          return (
            <motion.tr
              key={q.symbol}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.04 }}
              className="row-link cursor-pointer"
              onClick={() => router.push(`/stocks/${q.symbol}`)}
            >
              <td>
                <div className="font-medium">{q.symbol}</div>
              </td>
              <td className="r">
                <FlashPrice value={p} dir={live?.dir} />
              </td>
              <td className={cn('r num', metric === 'change' ? toneClass(c) : 'text-ink')}>
                {metric === 'change' ? pct(c) : metric === 'volume' ? compact(v) : `₹${compact(v * p)}`}
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}
