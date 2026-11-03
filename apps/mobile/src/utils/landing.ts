import type {BuiltinStrategy, Signal} from '../api/types';

/** Same six stocks as the web landing demo. */
export const DEMO_SYMBOLS = ['INFY', 'RELIANCE', 'TCS', 'HDFCBANK', 'ITC', 'SBIN'] as const;

/**
 * Web SignalFragment: an actionable signal is judged on its own side's rules ("[BUY] …" / "[SELL] …");
 * HOLD shows the entry ([BUY]) rules it is waiting on. Falls back to every condition if none are tagged.
 */
export function sideConditions(s: Signal): {conditions: Signal['conditions']; label: 'entry' | 'exit'} {
  const side = s.action === 'SELL' ? '[SELL]' : '[BUY]';
  const own = s.conditions.filter(c => c.description.startsWith(side));
  return {conditions: own.length ? own : s.conditions, label: s.action === 'SELL' ? 'exit' : 'entry'};
}

/** Web Cta: blank -> RELIANCE, upper-cased, only A-Z 0-9 & - kept. */
export function ctaSymbol(input: string): string {
  return (input.trim() || 'RELIANCE').toUpperCase().replace(/[^A-Z0-9&-]/g, '') || 'RELIANCE';
}

/** Web LiveDemo: up to four sliders per strategy, skipping 0/1 integer flags. */
export function sliderParams(strat: BuiltinStrategy | undefined): BuiltinStrategy['params'] {
  return (strat?.params ?? []).filter(p => !(p.type === 'int' && p.min === 0 && p.max === 1)).slice(0, 4);
}

/** Snaps a slider value to the parameter's step (ints: 1, floats: range / 50), clamped. */
export function snapParam(p: BuiltinStrategy['params'][number], v: number): number {
  const step = p.type === 'int' ? 1 : (p.max - p.min) / 50;
  const snapped = p.min + Math.round((v - p.min) / step) * step;
  const clamped = Math.min(p.max, Math.max(p.min, snapped));
  return p.type === 'int' ? Math.round(clamped) : Number(clamped.toFixed(4));
}

/** First actionable signal of the latest scan, else the INFY Supertrend fallback (web Landing). */
export function heroSignal(latest: Signal[] | undefined, fallback: Signal | undefined): Signal | undefined {
  return latest?.find(s => s.action !== 'HOLD') ?? fallback;
}

/** "HH:MM:SS" in IST (web footer clock, en-GB 24h). */
export function istClock(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
}
