'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OPERATORS, indicatorOperand } from './rules';
import type { IndicatorMeta, Operand, RuleCondition, RuleGroup } from '@shared/types/api';

function OperandEditor({ value, onChange, catalog, label }: { value: Operand; onChange: (o: Operand) => void; catalog: IndicatorMeta[]; label: string }) {
  const kind = value.type === 'indicator' ? `ind:${value.indicator}` : value.type === 'price' ? `price:${value.field}` : 'constant';
  const meta = value.type === 'indicator' ? catalog.find((c) => c.key === value.indicator) : undefined;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Select
        aria-label={`${label} operand`}
        value={kind}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'constant') onChange({ type: 'constant', value: 50 });
          else if (v.startsWith('price:')) onChange({ type: 'price', field: v.slice(6) as 'close' });
          else onChange(indicatorOperand(catalog.find((c) => c.key === v.slice(4))!));
        }}
        className="h-8 w-auto max-w-[180px] text-xs"
      >
        <optgroup label="Indicators">
          {catalog.map((c) => (
            <option key={c.key} value={`ind:${c.key}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Price">
          {(['close', 'open', 'high', 'low', 'volume'] as const).map((f) => (
            <option key={f} value={`price:${f}`}>
              {f[0].toUpperCase() + f.slice(1)}
            </option>
          ))}
        </optgroup>
        <option value="constant">Number</option>
      </Select>
      {value.type === 'indicator' &&
        meta?.params.map((p) => (
          <input
            key={p.name}
            type="number"
            aria-label={`${meta.name} ${p.label}`}
            title={p.label}
            min={p.min}
            max={p.max}
            step={p.step}
            value={value.params[p.name] ?? p.default}
            onChange={(e) => onChange({ ...value, params: { ...value.params, [p.name]: Number(e.target.value) } })}
            className="field num h-8 w-14 px-1.5 text-center text-xs"
          />
        ))}
      {value.type === 'indicator' && meta && meta.fields.length > 1 && (
        <Select aria-label={`${meta.name} output`} value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })} className="h-8 w-auto text-xs">
          {meta.fields.map((f) => (
            <option key={f} value={f}>
              {f.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      )}
      {value.type === 'constant' && (
        <input
          type="number"
          aria-label={`${label} value`}
          value={Number.isFinite(value.value) ? value.value : ''}
          onChange={(e) => onChange({ type: 'constant', value: e.target.value === '' ? NaN : Number(e.target.value) })}
          className="field num h-8 w-20 text-xs"
        />
      )}
    </div>
  );
}

export function RuleGroupEditor({
  title,
  group,
  onChange,
  catalog,
  tone,
}: {
  title: string;
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  catalog: IndicatorMeta[];
  tone: 'up' | 'down';
}) {
  const update = (i: number, c: RuleCondition) => onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });
  const add = () =>
    onChange({
      ...group,
      conditions: [...group.conditions, { left: indicatorOperand(catalog.find((c) => c.key === 'rsi') ?? catalog[0]), operator: '>', right: { type: 'constant', value: 50 } }],
    });
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className={cn('h-4 w-0.5 rounded', tone === 'up' ? 'bg-up' : 'bg-down')} />
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          Combine with
          <div className="flex rounded-ctl bg-raised p-0.5">
            {(['AND', 'OR'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onChange({ ...group, logic: l })}
                className={cn('h-6 rounded-[5px] px-2.5 text-[11px] font-semibold transition-colors', group.logic === l ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {group.conditions.map((c, i) => (
            <motion.li
              key={i}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {i > 0 && <div className="py-1 pl-2 text-[11px] font-semibold text-accent">{group.logic}</div>}
              <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-line bg-ground px-2.5 py-2">
                <OperandEditor label="Left" value={c.left} catalog={catalog} onChange={(left) => update(i, { ...c, left })} />
                <Select aria-label="Comparison" value={c.operator} onChange={(e) => update(i, { ...c, operator: e.target.value as RuleCondition['operator'] })} className="h-8 w-auto text-xs font-medium">
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <OperandEditor label="Right" value={c.right} catalog={catalog} onChange={(right) => update(i, { ...c, right })} />
                <button
                  type="button"
                  onClick={() => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })}
                  className="ml-auto rounded p-1.5 text-faint transition-colors hover:bg-down/10 hover:text-down"
                  aria-label={`Remove ${title.toLowerCase()} rule ${i + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Add condition
      </Button>
    </div>
  );
}
