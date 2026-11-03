import type {IndicatorMeta} from '../api/types';

/** One indicator row of the chart layout — identical to the web ChartWorkspace `IndicatorConfig`. */
export interface IndicatorConfig {
  key: string;
  params: number[];
  enabled: boolean;
}
export type ChartKind = 'candles' | 'line' | 'area';

/** What PATCH /users/me/preferences stores in `chart_config` (same JSON on web and mobile). */
export interface ChartConfigJson {
  indicators: IndicatorConfig[];
  kind: ChartKind;
}

/** Web DEFAULT_CONFIG, plus ROC and HV (disabled) so every catalog indicator is pickable. */
export const DEFAULT_CONFIG: IndicatorConfig[] = [
  {key: 'ema', params: [20], enabled: true},
  {key: 'ema', params: [50], enabled: true},
  {key: 'sma', params: [200], enabled: false},
  {key: 'bbands', params: [20, 2], enabled: false},
  {key: 'vwap', params: [], enabled: false},
  {key: 'supertrend', params: [10, 3], enabled: false},
  {key: 'rsi', params: [14], enabled: true},
  {key: 'macd', params: [12, 26, 9], enabled: true},
  {key: 'stoch', params: [14, 3], enabled: false},
  {key: 'adx', params: [14], enabled: false},
  {key: 'atr', params: [14], enabled: false},
  {key: 'obv', params: [], enabled: false},
  {key: 'volume_sma', params: [20], enabled: false},
  {key: 'roc', params: [10], enabled: false},
  {key: 'hv', params: [20], enabled: false},
];

const KINDS: ChartKind[] = ['candles', 'line', 'area'];

/** Request spec for GET /indicators: "macd:12:26:9". */
export const spec = (c: IndicatorConfig) => [c.key, ...c.params].join(':');

function isConfig(x: unknown): x is IndicatorConfig {
  if (!x || typeof x !== 'object') {
    return false;
  }
  const o = x as Record<string, unknown>;
  return (
    typeof o.key === 'string' &&
    Array.isArray(o.params) &&
    o.params.every(n => typeof n === 'number' && Number.isFinite(n)) &&
    typeof o.enabled === 'boolean'
  );
}

/** Appends (disabled) every catalog indicator the config does not mention yet. */
export function withCatalog(config: IndicatorConfig[], catalog?: IndicatorMeta[]): IndicatorConfig[] {
  if (!catalog?.length) {
    return config;
  }
  const have = new Set(config.map(c => c.key));
  const extra = catalog
    .filter(m => !have.has(m.key))
    .map(m => ({key: m.key, params: m.params.map(p => p.default), enabled: false}));
  return extra.length ? [...config, ...extra] : config;
}

/**
 * Reads `user.preferences.chart_config` the way the web does: saved indicators when present and
 * non-empty, otherwise the defaults; `kind` defaults to candles. Malformed input falls back.
 */
export function parseChartConfig(raw: unknown, catalog?: IndicatorMeta[]): ChartConfigJson {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const saved = Array.isArray(o.indicators) ? o.indicators.filter(isConfig).map(c => ({key: c.key, params: [...c.params], enabled: c.enabled})) : [];
  const kind = KINDS.includes(o.kind as ChartKind) ? (o.kind as ChartKind) : 'candles';
  const base = saved.length ? saved : DEFAULT_CONFIG.map(c => ({...c, params: [...c.params]}));
  return {indicators: withCatalog(base, catalog), kind};
}

/** Body for PATCH /users/me/preferences {chart_config}. Exactly `{indicators: [{key, params, enabled}], kind}`. */
export function toChartConfig(indicators: IndicatorConfig[], kind: ChartKind): ChartConfigJson {
  return {
    indicators: indicators.map(c => ({key: c.key, params: [...c.params], enabled: c.enabled})),
    kind,
  };
}

/** Clamps a param edit to the catalog range (web picker behaviour). */
export function clampParam(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
