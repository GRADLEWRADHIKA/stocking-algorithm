/**
 * Number formatting for Indian markets — a line-for-line port of apps/web/src/lib/format.ts
 * (same names, same output) so a figure reads identically on the website and the app.
 * Hand-rolled grouping instead of Intl so Hermes, Jest and every Android build agree.
 */
import {groupIndian} from './format';

export const DASH = '—';

const bad = (v: number | null | undefined): v is null | undefined =>
  v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v);

function fixedGrouped(abs: number, decimals: number): string {
  const [i, f] = abs.toFixed(decimals).split('.');
  return groupIndian(i) + (f ? `.${f}` : '');
}

/** 1234567.5 -> "12,34,567.50" (Indian grouping, fixed decimals). */
export function price(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) {
    return DASH;
  }
  const body = fixedGrouped(Math.abs(v), decimals);
  return v < 0 && Number(Math.abs(v).toFixed(decimals)) !== 0 ? `-${body}` : body;
}

/** "₹12,34,567.50" / "-₹42.00". */
export function inr(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) {
    return DASH;
  }
  return `${v < 0 && Number(Math.abs(v).toFixed(decimals)) !== 0 ? '-' : ''}₹${price(Math.abs(v), decimals)}`;
}

/** Explicit sign: "+₹1,200.00" / "-₹50.00" / "₹0.00". */
export function signedInr(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) {
    return DASH;
  }
  if (Number(Math.abs(v).toFixed(decimals)) === 0) {
    return `₹${price(0, decimals)}`;
  }
  return `${v > 0 ? '+' : '-'}₹${price(Math.abs(v), decimals)}`;
}

/** Explicit sign: "+12.40" / "-3.10" / "0.00". */
export function signed(v: number | null | undefined, decimals = 2): string {
  if (bad(v)) {
    return DASH;
  }
  if (Number(Math.abs(v).toFixed(decimals)) === 0) {
    return price(0, decimals);
  }
  return `${v > 0 ? '+' : '-'}${price(Math.abs(v), decimals)}`;
}

/** Percent with explicit sign by default: "+1.23%", "-0.50%", "0.00%". */
export function pct(v: number | null | undefined, decimals = 2, withSign = true): string {
  if (bad(v)) {
    return DASH;
  }
  const body = Math.abs(v).toFixed(decimals);
  if (Number(body) === 0) {
    return `${(0).toFixed(decimals)}%`;
  }
  if (!withSign) {
    return `${v < 0 ? '-' : ''}${body}%`;
  }
  return `${v > 0 ? '+' : '-'}${body}%`;
}

export function int(v: number | null | undefined): string {
  if (bad(v)) {
    return DASH;
  }
  return price(Math.round(v), 0);
}

/** Compact Indian magnitude: 1.2K, 3.40L (lakh), 5.60Cr (crore). */
export function compact(v: number | null | undefined): string {
  if (bad(v)) {
    return DASH;
  }
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e7) {
    return `${s}${(a / 1e7).toFixed(2)}Cr`;
  }
  if (a >= 1e5) {
    return `${s}${(a / 1e5).toFixed(2)}L`;
  }
  if (a >= 1e3) {
    return `${s}${(a / 1e3).toFixed(1)}K`;
  }
  return `${s}${a.toFixed(0)}`;
}

export type Tone = 'up' | 'down' | 'flat';
export function tone(v: number | null | undefined): Tone {
  if (bad(v) || v === 0) {
    return 'flat';
  }
  return v > 0 ? 'up' : 'down';
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const IST_OFFSET_MS = 330 * 60 * 1000;

/** ISO-style date (and IST time) like web: "2026-11-03" / "2026-11-03 12:19". Numbers are UNIX seconds. */
export function dateTime(v: string | number | null | undefined, withTime = true): string {
  if (v === null || v === undefined) {
    return DASH;
  }
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (Number.isNaN(d.getTime())) {
    return DASH;
  }
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const date = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
  if (!withTime) {
    return date;
  }
  return `${date} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

export function relative(iso: string | null | undefined): string {
  if (!iso) {
    return DASH;
  }
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) {
    return 'just now';
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  }
  return `${Math.floor(diff / 86400)}d ago`;
}

/** "2026-11-03" for today in IST (date inputs / replay max). */
export function todayIst(): string {
  return dateTime(new Date().toISOString(), false);
}
