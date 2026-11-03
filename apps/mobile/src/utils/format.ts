/**
 * Number formatting for the Indian market. Hand-rolled (no Intl dependency) so the output is
 * identical on Hermes/Android/iOS/Jest: Indian digit grouping => 12,34,567.50
 */

/** Groups an integer digit string the Indian way: last 3 digits, then pairs. "1234567" -> "12,34,567" */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) {
    return intDigits;
  }
  const last3 = intDigits.slice(-3);
  let rest = intDigits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length) {
    parts.unshift(rest);
  }
  return `${parts.join(',')},${last3}`;
}

export interface NumberFormatOptions {
  decimals?: number;
  /** Prefix '+' for positive values. */
  sign?: boolean;
}

/** 1234567.5 -> "12,34,567.50" */
export function formatNumber(value: number | null | undefined, opts: NumberFormatOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const decimals = opts.decimals ?? 2;
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, frac] = fixed.split('.');
  const body = groupIndian(intPart) + (frac ? `.${frac}` : '');
  const isZero = Number(fixed) === 0;
  if (negative && !isZero) {
    return `-${body}`;
  }
  return opts.sign && !isZero ? `+${body}` : body;
}

/** 1234567.5 -> "₹12,34,567.50"; -42 -> "-₹42.00"; sign:true 5 -> "+₹5.00" */
export function formatINR(value: number | null | undefined, opts: NumberFormatOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const decimals = opts.decimals ?? 2;
  const fixed = Math.abs(value).toFixed(decimals);
  const isZero = Number(fixed) === 0;
  const [intPart, frac] = fixed.split('.');
  const body = `₹${groupIndian(intPart)}${frac ? `.${frac}` : ''}`;
  if (value < 0 && !isZero) {
    return `-${body}`;
  }
  return opts.sign && !isZero ? `+${body}` : body;
}

/** Compact Indian units: 1.25 Cr, 3.4 L, 12.5K. */
export function formatCompactINR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e7) {
    return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  }
  if (abs >= 1e5) {
    return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  }
  return formatINR(value, {decimals: abs >= 1000 ? 0 : 2});
}

/** Volume: 12.3M style is western; for India use L / Cr. */
export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  if (abs >= 1e7) {
    return `${(value / 1e7).toFixed(2)} Cr`;
  }
  if (abs >= 1e5) {
    return `${(value / 1e5).toFixed(2)} L`;
  }
  if (abs >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

/** Market cap given in INR crore (contract). */
export function formatMcapCrore(crore: number | null | undefined): string {
  if (crore === null || crore === undefined || !Number.isFinite(crore)) {
    return '—';
  }
  return `₹${formatNumber(crore, {decimals: 0})} Cr`;
}

/** 1.234 -> "+1.23%" ; -0.5 -> "-0.50%" (input already in percent units). */
export function pct(value: number | null | undefined, opts: {decimals?: number; sign?: boolean} = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const decimals = opts.decimals ?? 2;
  const sign = opts.sign ?? true;
  const fixed = value.toFixed(decimals);
  const isZero = Number(fixed) === 0;
  const prefix = sign && value > 0 && !isZero ? '+' : '';
  return `${prefix}${isZero ? Math.abs(Number(fixed)).toFixed(decimals) : fixed}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(typeof d === 'number' ? d : d);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** UNIX seconds -> short label depending on timeframe granularity. */
export function formatUnix(sec: number, intraday = false): string {
  const d = new Date(sec * 1000);
  if (intraday) {
    return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) {
    return '';
  }
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ago`;
  }
  if (s < 86400) {
    return `${Math.floor(s / 3600)}h ago`;
  }
  return `${Math.floor(s / 86400)}d ago`;
}

export function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}
