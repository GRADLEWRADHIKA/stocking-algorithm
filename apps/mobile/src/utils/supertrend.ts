import type {SeriesPoint} from '../api/types';

export interface SupertrendSegment {
  /** +1 uptrend (line acts as support, drawn green), -1 downtrend (resistance, drawn red). */
  side: 1 | -1;
  points: SeriesPoint[];
}

/**
 * Splits a Supertrend line into uninterrupted regimes — the same algorithm as the web PriceChart.
 * Each regime becomes its own path, so the line is never connected across a direction flip.
 * Points without a direction value are skipped (they belong to no regime).
 */
export function splitSupertrend(value: SeriesPoint[] | undefined, direction: SeriesPoint[] | undefined): SupertrendSegment[] {
  const dir = new Map((direction ?? []).map(p => [p.time, p.value]));
  const segments: SupertrendSegment[] = [];
  for (const p of value ?? []) {
    const raw = dir.get(p.time);
    if (raw === undefined || raw === null || !Number.isFinite(raw) || raw === 0 || !Number.isFinite(p.value)) {
      continue;
    }
    const side: 1 | -1 = raw > 0 ? 1 : -1;
    const last = segments[segments.length - 1];
    if (last && last.side === side) {
      last.points.push(p);
    } else {
      segments.push({side, points: [p]});
    }
  }
  return segments;
}
