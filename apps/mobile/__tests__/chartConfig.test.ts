import {DEFAULT_CONFIG, clampParam, parseChartConfig, spec, toChartConfig} from '../src/utils/chartConfig';
import type {IndicatorMeta} from '../src/api/types';

/** Exactly what the web ChartWorkspace saves: {chart_config: {indicators: config, kind}}. */
const webSaved = {
  indicators: [
    {key: 'ema', params: [20], enabled: true},
    {key: 'supertrend', params: [10, 3], enabled: true},
    {key: 'macd', params: [12, 26, 9], enabled: false},
    {key: 'obv', params: [], enabled: true},
  ],
  kind: 'area',
};

describe('chart_config', () => {
  it('round-trips a web-saved layout unchanged (same JSON shape both ways)', () => {
    const parsed = parseChartConfig(JSON.parse(JSON.stringify(webSaved)));
    const out = toChartConfig(parsed.indicators, parsed.kind);
    expect(out).toEqual(webSaved);
    expect(Object.keys(out).sort()).toEqual(['indicators', 'kind']);
    out.indicators.forEach(i => expect(Object.keys(i).sort()).toEqual(['enabled', 'key', 'params']));
  });

  it('falls back to defaults for empty or garbage input', () => {
    for (const raw of [undefined, null, {}, 'x', {indicators: 'nope', kind: 'bars'}, {indicators: [{key: 1}]}]) {
      const c = parseChartConfig(raw);
      expect(c.kind).toBe('candles');
      expect(c.indicators).toEqual(DEFAULT_CONFIG);
    }
  });

  it('appends catalog indicators missing from a saved layout, disabled', () => {
    const catalog = [
      {key: 'ema', name: 'EMA', pane: 'overlay', params: [{name: 'period', label: 'Period', default: 20, min: 2, max: 400, step: 1}], fields: ['value'], description: ''},
      {key: 'hv', name: 'Historical volatility', pane: 'separate', params: [{name: 'period', label: 'Period', default: 20, min: 5, max: 250, step: 1}], fields: ['value'], description: ''},
    ] as IndicatorMeta[];
    const c = parseChartConfig({indicators: [{key: 'ema', params: [9], enabled: true}], kind: 'line'}, catalog);
    expect(c.indicators).toEqual([
      {key: 'ema', params: [9], enabled: true},
      {key: 'hv', params: [20], enabled: false},
    ]);
    expect(c.kind).toBe('line');
  });

  it('defaults cover every backend indicator incl. supertrend, roc and hv', () => {
    const keys = new Set(DEFAULT_CONFIG.map(c => c.key));
    ['sma', 'ema', 'rsi', 'macd', 'bbands', 'vwap', 'atr', 'adx', 'stoch', 'obv', 'volume_sma', 'roc', 'hv', 'supertrend'].forEach(k =>
      expect(keys.has(k)).toBe(true),
    );
  });

  it('builds request specs and clamps params', () => {
    expect(spec({key: 'macd', params: [12, 26, 9], enabled: true})).toBe('macd:12:26:9');
    expect(spec({key: 'obv', params: [], enabled: true})).toBe('obv');
    expect(clampParam(1000, 2, 400)).toBe(400);
    expect(clampParam(-1, 2, 400)).toBe(2);
  });
});
