/** Tiny chart math helpers shared by the hand-rolled SVG charts. */

export function extent(values: Array<number | null | undefined>): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      continue;
    }
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  if (min === Infinity) {
    return [0, 1];
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.01 || 1;
    return [min - pad, max + pad];
  }
  return [min, max];
}

export function padExtent([min, max]: [number, number], ratio = 0.06): [number, number] {
  const pad = (max - min) * ratio;
  return [min - pad, max + pad];
}

export function linear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** SVG path through points, breaking the line at null gaps. */
export function linePath(
  values: Array<number | null | undefined>,
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    pen = true;
  });
  return d;
}

/** Closed area path from the line down to `baseY` (first contiguous run only for simplicity). */
export function areaPath(
  values: Array<number | null | undefined>,
  x: (i: number) => number,
  y: (v: number) => number,
  baseY: number,
): string {
  const pts: Array<[number, number]> = [];
  values.forEach((v, i) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      pts.push([x(i), y(v)]);
    }
  });
  if (pts.length < 2) {
    return '';
  }
  let d = `M${pts[0][0].toFixed(2)},${baseY.toFixed(2)}`;
  for (const [px, py] of pts) {
    d += `L${px.toFixed(2)},${py.toFixed(2)}`;
  }
  d += `L${pts[pts.length - 1][0].toFixed(2)},${baseY.toFixed(2)}Z`;
  return d;
}

/** "Nice" tick values for an axis. */
export function ticks([min, max]: [number, number], count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** Aligns a time-keyed series onto candle times (null where missing). */
export function alignByTime(times: number[], points: {time: number; value: number}[] | undefined): (number | null)[] {
  if (!points?.length) {
    return times.map(() => null);
  }
  const m = new Map<number, number>();
  for (const pt of points) {
    m.set(pt.time, pt.value);
  }
  return times.map(t => (m.has(t) ? (m.get(t) as number) : null));
}

export function shortNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) {
    return `${(v / 1e7).toFixed(1)}Cr`;
  }
  if (a >= 1e5) {
    return `${(v / 1e5).toFixed(1)}L`;
  }
  if (a >= 1e3) {
    return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  }
  return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
}
