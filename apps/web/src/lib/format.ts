/** Number formatting for Indian markets: lakh/crore digit grouping, fixed decimals, explicit signs. */
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const DASH = '—';

const bad = (v: number | null | undefined): v is null | undefined =>
  v === null || v === undefined || Number.isNaN(v);

export function price(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) return DASH;
  if (decimals === 2) return inr2.format(v);
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export function inr(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) return DASH;
  return `${v < 0 ? '-' : ''}₹${price(Math.abs(v), decimals)}`;
}

export function signedInr(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) return DASH;
  if (Number(Math.abs(v).toFixed(decimals)) === 0) return `₹${price(0, decimals)}`;
  return `${v > 0 ? '+' : '-'}₹${price(Math.abs(v), decimals)}`;
}

export function signed(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) return DASH;
  if (Number(Math.abs(v).toFixed(decimals)) === 0) return price(0, decimals);
  return `${v > 0 ? '+' : '-'}${price(Math.abs(v), decimals)}`;
}

export function pct(v: number | null | undefined, decimals = 2, withSign = true): string {
  if (bad(v)) return DASH;
  const body = Math.abs(v).toFixed(decimals);
  if (Number(body) === 0) return `${(0).toFixed(decimals)}%`;
  if (!withSign) return `${v < 0 ? '-' : ''}${body}%`;
  return `${v > 0 ? '+' : '-'}${body}%`;
}

export function int(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  return inr0.format(v);
}

/** Compact Indian magnitude: 1.2K, 3.40L (lakh), 5.60Cr (crore). */
export function compact(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

export type Tone = 'up' | 'down' | 'flat';

export function tone(v: number | null | undefined): Tone {
  if (bad(v) || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

export function toneClass(v: number | null | undefined): string {
  const t = tone(v);
  return t === 'up' ? 'text-up' : t === 'down' ? 'text-down' : 'text-muted';
}

/** ISO-style date (and IST time) — comparable when right-aligned in tables. */
export function dateTime(v: string | number | null | undefined, withTime = true): string {
  if (v === null || v === undefined) return DASH;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (Number.isNaN(d.getTime())) return DASH;
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (!withTime) return date;
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
