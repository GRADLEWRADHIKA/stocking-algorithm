import type {IndicatorMeta, StrategyDefinition} from '../src/api/types';
import {
  DEFAULT_DEFINITION,
  OPERATORS,
  conditionText,
  definitionSentence,
  indicatorOperand,
  localErrors,
  operandLabel,
} from '../src/utils/rules';
import {defaultBacktestForm, strategyRef, toBacktestRequest, validateBacktestForm} from '../src/utils/backtestForm';

const p = (name: string, def: number, min: number, max: number) => ({name, label: name[0].toUpperCase() + name.slice(1), default: def, min, max, step: 1});

/** Subset of GET /api/indicators/catalog as returned by the running backend. */
const catalog: IndicatorMeta[] = [
  {key: 'ema', name: 'Exponential moving average', pane: 'overlay', params: [p('period', 20, 2, 400)], fields: ['value'], description: ''},
  {key: 'rsi', name: 'Relative strength index', pane: 'separate', params: [p('period', 14, 2, 100)], fields: ['value'], description: ''},
  {key: 'bbands', name: 'Bollinger bands', pane: 'overlay', params: [p('period', 20, 5, 200), p('std', 2, 1, 4)], fields: ['upper', 'middle', 'lower'], description: ''},
  {key: 'volume_sma', name: 'Volume SMA', pane: 'separate', params: [p('period', 20, 2, 200)], fields: ['value'], description: ''},
  {key: 'supertrend', name: 'Supertrend', pane: 'overlay', params: [p('period', 10, 2, 100), p('multiplier', 3, 1, 10)], fields: ['value', 'direction'], description: ''},
  {key: 'macd', name: 'MACD', pane: 'separate', params: [p('fast', 12, 2, 50), p('slow', 26, 5, 100), p('signal', 9, 2, 50)], fields: ['macd', 'signal', 'histogram'], description: ''},
];

const clone = (d: StrategyDefinition): StrategyDefinition => JSON.parse(JSON.stringify(d));

describe('operand and condition text (web rules.ts short names)', () => {
  it('uses trading-desk short names', () => {
    expect(operandLabel({type: 'indicator', indicator: 'ema', params: {period: 20}, field: 'value'}, catalog)).toBe('EMA(20)');
    expect(operandLabel({type: 'indicator', indicator: 'rsi', params: {period: 14}, field: 'value'}, catalog)).toBe('RSI(14)');
    expect(operandLabel({type: 'indicator', indicator: 'bbands', params: {period: 20, std: 2}, field: 'upper'}, catalog)).toBe('BB(20, 2) upper');
    expect(operandLabel({type: 'indicator', indicator: 'volume_sma', params: {period: 20}, field: 'value'}, catalog)).toBe('Volume SMA(20)');
    expect(operandLabel({type: 'indicator', indicator: 'supertrend', params: {period: 10, multiplier: 3}, field: 'value'}, catalog)).toBe('ST(10, 3) value');
    expect(operandLabel({type: 'price', field: 'volume'})).toBe('Volume');
    expect(operandLabel({type: 'price', field: 'close'})).toBe('Close');
    expect(operandLabel({type: 'constant', value: 50})).toBe('50');
  });

  it('has all six operators with web labels', () => {
    expect(OPERATORS.map(o => o.value)).toEqual(['>', '<', '>=', '<=', 'crosses_above', 'crosses_below']);
    expect(conditionText(DEFAULT_DEFINITION.entry.conditions[0], catalog)).toBe('EMA(20) is above EMA(50)');
    expect(
      conditionText(
        {left: {type: 'price', field: 'close'}, operator: 'crosses_below', right: {type: 'indicator', indicator: 'supertrend', params: {period: 10, multiplier: 3}, field: 'value'}},
        catalog,
      ),
    ).toBe('Close crosses below ST(10, 3) value');
  });

  it('builds the "Reads as" sentence including stop and target', () => {
    const s = definitionSentence(DEFAULT_DEFINITION, catalog);
    expect(s.buy).toBe('BUY when EMA(20) is above EMA(50) AND RSI(14) is above 50 AND Volume is above Volume SMA(20).');
    expect(s.exit).toBe('EXIT when EMA(20) is below EMA(50) OR price falls 5% below entry OR price rises 12% above entry.');
    const empty = clone(DEFAULT_DEFINITION);
    empty.entry.conditions = [];
    empty.exit.conditions = [];
    empty.risk.stop_loss_pct = null;
    empty.risk.take_profit_pct = null;
    expect(definitionSentence(empty, catalog)).toEqual({buy: 'BUY when ….', exit: 'EXIT when ….'});
  });

  it('creates default indicator operands from the catalog', () => {
    expect(indicatorOperand(catalog[2])).toEqual({type: 'indicator', indicator: 'bbands', params: {period: 20, std: 2}, field: 'upper'});
  });
});

describe('localErrors (mirrors web validation)', () => {
  it('accepts the default definition', () => {
    expect(localErrors(DEFAULT_DEFINITION, catalog)).toEqual([]);
  });

  it('requires at least one entry and one exit condition', () => {
    const d = clone(DEFAULT_DEFINITION);
    d.exit.conditions = [];
    expect(localErrors(d, catalog)).toContain('Add at least one exit condition. Stop-loss and target apply on top of it.');
    d.entry.conditions = [];
    expect(localErrors(d, catalog)).toContain('Add at least one entry condition.');
  });

  it('flags parameter ranges, unknown indicators, missing numbers and constant comparisons', () => {
    const d = clone(DEFAULT_DEFINITION);
    d.entry.conditions[0].left = {type: 'indicator', indicator: 'ema', params: {period: 1}, field: 'value'};
    d.entry.conditions[1].right = {type: 'constant', value: NaN};
    d.exit.conditions.push({left: {type: 'constant', value: 1}, operator: '>', right: {type: 'constant', value: 2}});
    d.exit.conditions.push({left: {type: 'indicator', indicator: 'nope', params: {}}, operator: '>', right: {type: 'constant', value: 2}});
    const errs = localErrors(d, catalog);
    expect(errs).toContain('entry rule 1: Exponential moving average Period must be between 2 and 400.');
    expect(errs).toContain('entry rule 2: enter a number.');
    expect(errs).toContain('exit rule 2: comparing two constants is always true or always false.');
    expect(errs).toContain('exit rule 3: unknown indicator "nope".');
  });

  it('limits position size to (0, 100]', () => {
    const d = clone(DEFAULT_DEFINITION);
    d.risk.position_size_pct = 0;
    expect(localErrors(d, catalog)).toContain('Position size must be between 0 and 100% of equity.');
    d.risk.position_size_pct = 101;
    expect(localErrors(d, catalog)).toContain('Position size must be between 0 and 100% of equity.');
  });
});

describe('backtest form (web backtestSchema)', () => {
  const today = new Date(2026, 10, 3);
  it('defaults match the web and build a valid request', () => {
    const f = defaultBacktestForm('TCS', today);
    expect(validateBacktestForm(f)).toEqual({});
    const req = toBacktestRequest(f, 'builtin:supertrend');
    expect(req).toMatchObject({
      symbol: 'TCS',
      strategy: {type: 'builtin', key: 'supertrend'},
      timeframe: '1d',
      initial_capital: 1000000,
      position_size_pct: 100,
      brokerage_pct: 0.03,
      brokerage_flat: 20,
      transaction_cost_pct: 0.1,
      slippage_bps: 5,
      stop_loss_pct: null,
      take_profit_pct: null,
      out_of_sample_pct: 30,
    });
    expect(strategyRef('saved:7')).toEqual({type: 'saved', strategy_id: 7});
  });

  it('reports the same limits', () => {
    const f = {...defaultBacktestForm('TCS', today), initial_capital: '500', position_size_pct: '0', stop_loss_pct: '95', start: '2026-01-01', end: '2025-01-01'};
    const e = validateBacktestForm(f);
    expect(e.initial_capital).toBe('Minimum ₹1,000');
    expect(e.position_size_pct).toBe('Above 0%');
    expect(e.stop_loss_pct).toBe('At most 90');
    expect(e.end).toBe('End must be after start');
  });
});
