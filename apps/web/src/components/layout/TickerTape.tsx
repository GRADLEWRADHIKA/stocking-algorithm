'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useStocks } from '@/hooks/queries';
import { useLive } from '@/stores/live';
import { pct, price } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Scrolling strip of simulated quotes; pauses on hover. Labelled as simulated at its start. */
export function TickerTape() {
  const { data } = useStocks({ limit: 40, sort: '-volume' });
  const ticks = useLive((s) => s.ticks);
  const items = useMemo(() => data?.items ?? [], [data]);
  if (!items.length) return <div className="h-8 border-b border-line" />;

  const row = items.map((s) => {
    const live = ticks[s.symbol];
    const p = live?.price ?? s.price;
    const c = live?.change_pct ?? s.change_pct;
    return { symbol: s.symbol, p, c };
  });

  return (
    <div className="group relative flex h-8 items-center overflow-hidden border-b border-line bg-ground text-xs">
      <span className="z-10 flex h-full flex-none items-center gap-1.5 border-r border-line bg-ground px-3 text-warn">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-warn" />
        Simulated feed
      </span>
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        {[0, 1].map((k) => (
          <div key={k} className="flex flex-none" aria-hidden={k === 1}>
            {row.map((r) => (
              <Link key={`${k}-${r.symbol}`} href={`/stocks/${r.symbol}`} tabIndex={k === 1 ? -1 : 0} className="flex items-center gap-2 px-4 hover:bg-raised/60">
                <span className="font-medium text-ink">{r.symbol}</span>
                <span className="num text-muted">{price(r.p)}</span>
                <span className={cn('num', r.c > 0 ? 'text-up' : r.c < 0 ? 'text-down' : 'text-muted')}>{pct(r.c)}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
