/** Backtest configuration form — mirrors apps/web/src/lib/schemas.ts `backtestSchema` (same limits and messages). */
import type {BacktestRequest, StrategyRef, Timeframe} from '../api/types';

export interface BacktestForm {
  symbol: string;
  timeframe: Timeframe;
  start: string;
  end: string;
  initial_capital: string;
  position_size_pct: string;
  brokerage_pct: string;
  brokerage_flat: string;
  transaction_cost_pct: string;
  slippage_bps: string;
  stop_loss_pct: string;
  take_profit_pct: string;
  out_of_sample_pct: string;
}

export function defaultBacktestForm(symbol: string, today = new Date()): BacktestForm {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const threeYears = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());
  return {
    symbol,
    timeframe: '1d',
    start: iso(threeYears),
    end: iso(today),
    initial_capital: '1000000',
    position_size_pct: '100',
    brokerage_pct: '0.03',
    brokerage_flat: '20',
    transaction_cost_pct: '0.1',
    slippage_bps: '5',
    stop_loss_pct: '',
    take_profit_pct: '',
    out_of_sample_pct: '30',
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type FormErrors = Partial<Record<keyof BacktestForm, string>>;

export function validateBacktestForm(f: BacktestForm): FormErrors {
  const e: FormErrors = {};
  const n = (k: keyof BacktestForm) => Number(f[k]);
  const req = (k: keyof BacktestForm, min: number, max: number, msgMin?: string, gt = false) => {
    const v = n(k);
    if (f[k].trim() === '' || !Number.isFinite(v)) {
      e[k] = 'Enter a number';
    } else if (gt ? v <= min : v < min) {
      e[k] = msgMin ?? `At least ${min}`;
    } else if (v > max) {
      e[k] = `At most ${max}`;
    }
  };
  if (!f.symbol) {
    e.symbol = 'Pick a stock';
  }
  req('initial_capital', 1000, 1e10, 'Minimum ₹1,000');
  req('position_size_pct', 0, 100, 'Above 0%', true);
  if (!e.position_size_pct && n('position_size_pct') > 100) {
    e.position_size_pct = 'At most 100%';
  }
  req('brokerage_pct', 0, 5);
  req('brokerage_flat', 0, 10000);
  req('transaction_cost_pct', 0, 5);
  req('slippage_bps', 0, 500);
  req('out_of_sample_pct', 0, 80);
  const opt = (k: 'stop_loss_pct' | 'take_profit_pct', max: number) => {
    if (f[k].trim() === '') {
      return;
    }
    const v = n(k);
    if (!Number.isFinite(v)) {
      e[k] = 'Enter a number';
    } else if (v <= 0) {
      e[k] = 'Above 0%';
    } else if (v > max) {
      e[k] = `At most ${max}`;
    }
  };
  opt('stop_loss_pct', 90);
  opt('take_profit_pct', 500);
  if (f.start && !DATE.test(f.start)) {
    e.start = 'Use YYYY-MM-DD';
  }
  if (f.end && !DATE.test(f.end)) {
    e.end = 'Use YYYY-MM-DD';
  }
  if (!e.start && !e.end && f.start && f.end && !(f.start < f.end)) {
    e.end = 'End must be after start';
  }
  return e;
}

/** "builtin:<key>" | "saved:<id>" → StrategyRef (same encoding as the web select). */
export function strategyRef(s: string): StrategyRef {
  return s.startsWith('saved:') ? {type: 'saved', strategy_id: Number(s.slice(6))} : {type: 'builtin', key: s.slice(8)};
}

export function toBacktestRequest(f: BacktestForm, strategy: string): BacktestRequest {
  const opt = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    symbol: f.symbol,
    strategy: strategyRef(strategy),
    timeframe: f.timeframe,
    start: f.start || null,
    end: f.end || null,
    initial_capital: Number(f.initial_capital),
    position_size_pct: Number(f.position_size_pct),
    brokerage_pct: Number(f.brokerage_pct),
    brokerage_flat: Number(f.brokerage_flat),
    transaction_cost_pct: Number(f.transaction_cost_pct),
    slippage_bps: Number(f.slippage_bps),
    stop_loss_pct: opt(f.stop_loss_pct),
    take_profit_pct: opt(f.take_profit_pct),
    out_of_sample_pct: Number(f.out_of_sample_pct),
  };
}
