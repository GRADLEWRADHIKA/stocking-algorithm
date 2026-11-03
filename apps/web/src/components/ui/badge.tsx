import { cn } from '@/lib/utils';
import type { DataSource, SignalAction } from '@shared/types/api';

type Tone = 'neutral' | 'up' | 'down' | 'warn' | 'info' | 'accent';

const tones: Record<Tone, string> = {
  neutral: 'bg-raised text-muted',
  up: 'bg-up/12 text-up',
  down: 'bg-down/12 text-down',
  warn: 'bg-warn/12 text-warn',
  info: 'bg-info/12 text-info',
  accent: 'bg-accent/12 text-accent',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

const SOURCE_LABEL: Record<DataSource, string> = {
  HISTORICAL_DATASET: 'Historical dataset',
  SIMULATED: 'Simulated data',
  PAPER_TRADING: 'Paper trading',
  DEMO_ANALYSIS: 'Demo analysis',
};

/** Every price on screen is labelled with where it came from. Simulated data is never shown as real. */
export function SourceBadge({ source, className }: { source: DataSource | undefined; className?: string }) {
  if (!source) return null;
  const tone: Tone = source === 'HISTORICAL_DATASET' ? 'info' : source === 'PAPER_TRADING' ? 'accent' : 'warn';
  return (
    <Badge tone={tone} className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

export function ActionBadge({ action, className }: { action: SignalAction; className?: string }) {
  const tone: Tone = action === 'BUY' ? 'up' : action === 'SELL' ? 'down' : 'neutral';
  return (
    <Badge tone={tone} className={cn('w-11 justify-center font-semibold', action === 'HOLD' && 'text-ink/80', className)}>
      {action}
    </Badge>
  );
}
