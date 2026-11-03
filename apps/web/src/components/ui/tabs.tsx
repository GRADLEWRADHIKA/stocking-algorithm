'use client';
import { motion, LayoutGroup } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<V extends string> {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
}

/**
 * The product's one selection mark: a 1px saffron line exactly as wide as the
 * label, sliding between options on a shared layout id.
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
  ruled = true,
}: {
  items: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  className?: string;
  size?: 'sm' | 'md';
  ruled?: boolean;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div role="tablist" className={cn('flex items-end gap-5 overflow-x-auto', ruled && 'border-b border-rule', className)}>
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={it.disabled}
              onClick={() => onChange(it.value)}
              className={cn(
                'relative whitespace-nowrap pb-2 transition-colors disabled:opacity-35',
                size === 'sm' ? 'pt-1 text-xs' : 'pt-2 text-[13px]',
                active ? 'text-ink font-medium' : 'text-muted hover:text-ink',
              )}
            >
              {it.label}
              {active && (
                <motion.span
                  layoutId="tab-line"
                  className="absolute inset-x-0 -bottom-px h-px bg-accent"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** Compact text range selector (1D 1W 1M …) with the same sliding line, no rule underneath. */
export function Segmented<V extends string>(props: {
  items: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  className?: string;
}) {
  return <Tabs {...props} size="sm" ruled={false} className={cn('gap-3', props.className)} />;
}
