import { backtestSchema, orderSchema, registerSchema } from '@/lib/schemas';
import { DEFAULT_DEFINITION, conditionText, localErrors } from '@/components/strategy/rules';
import type { IndicatorMeta } from '@shared/types/api';

describe('order form validation', () => {
  const base = { symbol: 'TCS', side: 'BUY', order_type: 'MARKET', quantity: '10', limit_price: '', stop_loss: '', take_profit: '' };

  it('accepts a market order with blank optional fields (blank is not zero)', () => {
    const r = orderSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit_price).toBeUndefined();
      expect(r.data.quantity).toBe(10);
    }
  });

  it('requires a limit price for limit orders', () => {
    const r = orderSchema.safeParse({ ...base, order_type: 'LIMIT' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === 'limit_price')).toBe(true);
  });

  it('rejects fractional and non-positive quantities', () => {
    expect(orderSchema.safeParse({ ...base, quantity: '1.5' }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, quantity: '0' }).success).toBe(false);
  });

  it('rejects a buy stop-loss above the limit entry', () => {
    const r = orderSchema.safeParse({ ...base, order_type: 'LIMIT', limit_price: '100', stop_loss: '105' });
    expect(r.success).toBe(false);
  });
});

describe('register validation', () => {
  it('requires matching passwords with a letter and digit', () => {
    expect(registerSchema.safeParse({ full_name: 'A Trader', email: 'a@b.co', password: 'abcdefgh', confirm: 'abcdefgh' }).success).toBe(false);
    expect(registerSchema.safeParse({ full_name: 'A Trader', email: 'a@b.co', password: 'abcdefg1', confirm: 'abcdefg2' }).success).toBe(false);
    expect(registerSchema.safeParse({ full_name: 'A Trader', email: 'a@b.co', password: 'abcdefg1', confirm: 'abcdefg1' }).success).toBe(true);
  });
});

describe('backtest form validation', () => {
  const ok = {
    symbol: 'INFY', timeframe: '1d', start: '2024-01-01', end: '2025-01-01', initial_capital: '100000', position_size_pct: '50',
    brokerage_pct: '0.03', brokerage_flat: '20', transaction_cost_pct: '0.1', slippage_bps: '5', stop_loss_pct: '', take_profit_pct: '', out_of_sample_pct: '30',
  };
  it('treats blank stop-loss as none', () => {
    const r = backtestSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.stop_loss_pct).toBeUndefined();
  });
  it('rejects an end date before the start', () => {
    expect(backtestSchema.safeParse({ ...ok, end: '2023-01-01' }).success).toBe(false);
  });
  it('rejects position size above 100%', () => {
    expect(backtestSchema.safeParse({ ...ok, position_size_pct: '150' }).success).toBe(false);
  });
});

describe('strategy rules (client mirror of the server schema)', () => {
  const catalog: IndicatorMeta[] = [
    { key: 'ema', name: 'EMA', pane: 'overlay', params: [{ name: 'period', label: 'Period', default: 20, min: 2, max: 400, step: 1 }], fields: ['value'], description: '' },
    { key: 'rsi', name: 'RSI', pane: 'separate', params: [{ name: 'period', label: 'Period', default: 14, min: 2, max: 100, step: 1 }], fields: ['value'], description: '' },
    { key: 'volume_sma', name: 'Volume SMA', pane: 'separate', params: [{ name: 'period', label: 'Period', default: 20, min: 2, max: 200, step: 1 }], fields: ['value'], description: '' },
  ];

  it('accepts the default definition', () => {
    expect(localErrors(DEFAULT_DEFINITION, catalog)).toEqual([]);
  });

  it('reads conditions as sentences', () => {
    expect(conditionText(DEFAULT_DEFINITION.entry.conditions[0], catalog)).toBe('EMA(20) is above EMA(50)');
  });

  it('flags empty entry, unknown indicators and out-of-range params', () => {
    const bad = {
      ...DEFAULT_DEFINITION,
      entry: { logic: 'AND' as const, conditions: [] },
      exit: {
        logic: 'OR' as const,
        conditions: [{ left: { type: 'indicator' as const, indicator: 'nope', params: {} }, operator: '>' as const, right: { type: 'indicator' as const, indicator: 'rsi', params: { period: 1 } } }],
      },
    };
    const errs = localErrors(bad, catalog);
    expect(errs.some((e) => e.includes('at least one entry'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown indicator'))).toBe(true);
    expect(errs.some((e) => e.includes('between 2 and 100'))).toBe(true);
  });
});
