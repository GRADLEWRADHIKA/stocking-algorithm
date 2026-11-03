'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useStocks } from '@/hooks/queries';
import { pct, price, toneClass } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Global symbol search, focus with "/" or Ctrl/⌘+K. Arrow keys + Enter to open. */
export function SymbolSearch({ onPick, placeholder = 'Search symbol or company', autoFocus }: { onPick?: (symbol: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { data, isFetching } = useStocks({ q, limit: 8 });
  const results = q.trim() ? data?.items ?? [] : [];

  useEffect(() => {
    if (onPick) return;
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPick]);

  const pick = (symbol: string) => {
    setQ('');
    setOpen(false);
    input.current?.blur();
    if (onPick) onPick(symbol);
    else router.push(`/stocks/${symbol}`);
  };

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={input}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && results[idx]) pick(results[idx].symbol);
          else if (e.key === 'Escape') input.current?.blur();
        }}
        placeholder={placeholder}
        aria-label="Search stocks"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open && results.length > 0}
        className="field h-8 pl-8 pr-10"
      />
      {!onPick && (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-faint">/</kbd>
      )}
      <AnimatePresence>
        {open && q.trim() && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-2xl"
          >
            {results.length === 0 && <li className="px-3 py-3 text-xs text-muted">{isFetching ? 'Searching…' : `No instrument matches “${q}”`}</li>}
            {results.map((s, i) => (
              <li
                key={s.symbol}
                role="option"
                aria-selected={i === idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s.symbol);
                }}
                onMouseEnter={() => setIdx(i)}
                className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', i === idx && 'bg-raised')}
              >
                <span className="w-24 font-medium">{s.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{s.name}</span>
                <span className="num text-xs">{price(s.price)}</span>
                <span className={cn('num w-16 text-right text-xs', toneClass(s.change_pct))}>{pct(s.change_pct)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
