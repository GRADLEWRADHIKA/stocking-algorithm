import {compact, dateTime, DASH, inr, int, pct, price, relative, signed, signedInr, tone} from '../src/utils/fmt';

/** Expected strings are what apps/web/src/lib/format.ts prints for the same inputs. */
describe('web-identical number formatting', () => {
  it('price: Indian grouping, fixed decimals', () => {
    expect(price(1234567.5)).toBe('12,34,567.50');
    expect(price(999)).toBe('999.00');
    expect(price(100000, 0)).toBe('1,00,000');
    expect(price(12.3456, 3)).toBe('12.346');
  });

  it('inr / signedInr / signed carry explicit signs', () => {
    expect(inr(1234567.5)).toBe('₹12,34,567.50');
    expect(inr(-42)).toBe('-₹42.00');
    expect(inr(1500.4, 0)).toBe('₹1,500');
    expect(signedInr(1200)).toBe('+₹1,200.00');
    expect(signedInr(-50)).toBe('-₹50.00');
    expect(signedInr(0.001)).toBe('₹0.00');
    expect(signed(12.4)).toBe('+12.40');
    expect(signed(-3.1)).toBe('-3.10');
    expect(signed(0)).toBe('0.00');
  });

  it('pct: explicit sign by default, optional unsigned', () => {
    expect(pct(1.234)).toBe('+1.23%');
    expect(pct(-0.5)).toBe('-0.50%');
    expect(pct(0)).toBe('0.00%');
    expect(pct(-0.001)).toBe('0.00%');
    expect(pct(12.345, 1, false)).toBe('12.3%');
    expect(pct(-2, 0, false)).toBe('-2%');
  });

  it('compact: K / L / Cr like the web', () => {
    expect(compact(950)).toBe('950');
    expect(compact(1234)).toBe('1.2K');
    expect(compact(340000)).toBe('3.40L');
    expect(compact(56000000)).toBe('5.60Cr');
    expect(compact(-150000)).toBe('-1.50L');
    expect(int(1234567.4)).toBe('12,34,567');
  });

  it('uses a dash for missing values everywhere', () => {
    for (const f of [price, inr, signedInr, signed, pct, compact, int]) {
      expect(f(null)).toBe(DASH);
      expect(f(undefined)).toBe(DASH);
      expect(f(NaN)).toBe(DASH);
    }
    expect(DASH).toBe('—');
    expect(dateTime(null)).toBe(DASH);
    expect(relative(null)).toBe(DASH);
  });

  it('dateTime prints IST like the web (en-CA date + 24h time)', () => {
    expect(dateTime('2026-11-03T06:49:01Z')).toBe('2026-11-03 12:19');
    expect(dateTime('2026-11-03T20:00:00Z', false)).toBe('2026-11-04');
    expect(dateTime(1762152541)).toBe(dateTime(new Date(1762152541 * 1000).toISOString()));
  });

  it('tone follows the sign', () => {
    expect(tone(2)).toBe('up');
    expect(tone(-2)).toBe('down');
    expect(tone(0)).toBe('flat');
    expect(tone(null)).toBe('flat');
  });
});
