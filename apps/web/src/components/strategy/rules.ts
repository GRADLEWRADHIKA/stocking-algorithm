import type { IndicatorMeta, Operand, RuleCondition, StrategyDefinition } from '@shared/types/api';

export const OPERATORS: { value: RuleCondition['operator']; label: string }[] = [
  { value: '>', label: 'is above' },
  { value: '<', label: 'is below' },
  { value: '>=', label: 'is at or above' },
  { value: '<=', label: 'is at or below' },
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'crosses_below', label: 'crosses below' },
];

export function operandLabel(o: Operand, catalog?: IndicatorMeta[]): string {
  if (o.type === 'constant') return String(o.value);
  if (o.type === 'price') return o.field === 'volume' ? 'Volume' : o.field[0].toUpperCase() + o.field.slice(1);
  const m = catalog?.find((c) => c.key === o.indicator);
  // short trading-desk names ("EMA(20)") rather than the catalog's long titles
  const name = o.indicator === 'bbands' ? 'BB' : o.indicator === 'volume_sma' ? 'Volume SMA' : o.indicator.toUpperCase();
  const params = Object.values(o.params).join(', ');
  const field = o.field && m && m.fields.length > 1 ? ` ${o.field}` : '';
  return `${name}${params ? `(${params})` : ''}${field}`;
}

export function conditionText(c: RuleCondition, catalog?: IndicatorMeta[]): string {
  const op = OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
  return `${operandLabel(c.left, catalog)} ${op} ${operandLabel(c.right, catalog)}`;
}

export function indicatorOperand(meta: IndicatorMeta): Operand {
  return {
    type: 'indicator',
    indicator: meta.key,
    params: Object.fromEntries(meta.params.map((p) => [p.name, p.default])),
    field: meta.fields[0],
  };
}

export const DEFAULT_DEFINITION: StrategyDefinition = {
  timeframe: '1d',
  entry: {
    logic: 'AND',
    conditions: [
      { left: { type: 'indicator', indicator: 'ema', params: { period: 20 }, field: 'value' }, operator: '>', right: { type: 'indicator', indicator: 'ema', params: { period: 50 }, field: 'value' } },
      { left: { type: 'indicator', indicator: 'rsi', params: { period: 14 }, field: 'value' }, operator: '>', right: { type: 'constant', value: 50 } },
      { left: { type: 'price', field: 'volume' }, operator: '>', right: { type: 'indicator', indicator: 'volume_sma', params: { period: 20 }, field: 'value' } },
    ],
  },
  exit: {
    logic: 'OR',
    conditions: [
      { left: { type: 'indicator', indicator: 'ema', params: { period: 20 }, field: 'value' }, operator: '<', right: { type: 'indicator', indicator: 'ema', params: { period: 50 }, field: 'value' } },
    ],
  },
  risk: { stop_loss_pct: 5, take_profit_pct: 12, position_size_pct: 20 },
};

/** Client-side checks that mirror the server schema; the server remains authoritative. */
export function localErrors(d: StrategyDefinition, catalog: IndicatorMeta[]): string[] {
  const errs: string[] = [];
  if (!d.entry.conditions.length) errs.push('Add at least one entry condition.');
  if (!d.exit.conditions.length) errs.push('Add at least one exit condition. Stop-loss and target apply on top of it.');
  const check = (o: Operand, where: string) => {
    if (o.type === 'indicator') {
      const m = catalog.find((c) => c.key === o.indicator);
      if (!m) return errs.push(`${where}: unknown indicator "${o.indicator}".`);
      m.params.forEach((p) => {
        const v = o.params[p.name];
        if (v === undefined || Number.isNaN(v) || v < p.min || v > p.max) errs.push(`${where}: ${m.name} ${p.label} must be between ${p.min} and ${p.max}.`);
      });
    }
    if (o.type === 'constant' && !Number.isFinite(o.value)) errs.push(`${where}: enter a number.`);
  };
  (['entry', 'exit'] as const).forEach((g) =>
    d[g].conditions.forEach((c, i) => {
      check(c.left, `${g} rule ${i + 1}`);
      check(c.right, `${g} rule ${i + 1}`);
      if (c.left.type === 'constant' && c.right.type === 'constant') errs.push(`${g} rule ${i + 1}: comparing two constants is always true or always false.`);
    }),
  );
  if (d.risk.position_size_pct <= 0 || d.risk.position_size_pct > 100) errs.push('Position size must be between 0 and 100% of equity.');
  return errs;
}
