export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Mirrors a typical backend rule: >= 8 chars, a letter and a digit. */
export function passwordProblem(v: string): string | null {
  if (v.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) {
    return 'Include at least one letter and one number.';
  }
  return null;
}

export function parsePositiveNumber(v: string): number | null {
  if (!v.trim()) {
    return null;
  }
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
