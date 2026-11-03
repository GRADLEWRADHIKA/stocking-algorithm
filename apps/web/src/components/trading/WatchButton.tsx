'use client';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useWatchlistMutations, useWatchlists } from '@/hooks/queries';
import { Button } from '@/components/ui/button';

export function WatchButton({ symbol }: { symbol: string }) {
  const { data } = useWatchlists();
  const m = useWatchlistMutations();
  const inAny = (data ?? []).some((w) => w.items.some((i) => i.symbol === symbol));
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button size="sm" variant="secondary" aria-label="Add to watchlist">
          <motion.span key={String(inAny)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
            <Star className={inAny ? 'h-3.5 w-3.5 fill-accent text-accent' : 'h-3.5 w-3.5'} />
          </motion.span>
          {inAny ? 'Watching' : 'Watch'}
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-card border border-line bg-surface p-1 shadow-2xl">
          {(data ?? []).map((w) => {
            const has = w.items.some((i) => i.symbol === symbol);
            return (
              <Dropdown.Item
                key={w.id}
                onSelect={() =>
                  (has ? m.removeItem : m.addItem).mutate(
                    { id: w.id, symbol },
                    { onSuccess: () => toast.success(has ? `Removed from ${w.name}` : `Added to ${w.name}`), onError: (e) => toast.error(e.message) },
                  )
                }
                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-raised"
              >
                <span className="w-4">{has && <Check className="h-3.5 w-3.5 text-accent" />}</span>
                {w.name}
              </Dropdown.Item>
            );
          })}
          {(data ?? []).length === 0 && <div className="px-3 py-2 text-xs text-muted">No watchlists yet.</div>}
          <Dropdown.Separator className="my-1 h-px bg-rule" />
          <Dropdown.Item
            onSelect={() => m.create.mutate('My watchlist', { onSuccess: (w) => m.addItem.mutate({ id: w.id, symbol }) })}
            className="cursor-pointer rounded px-3 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink"
          >
            New watchlist with {symbol}
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
