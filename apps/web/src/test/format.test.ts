import { compact, inr, pct, price, signed, signedInr, tone } from '@/lib/format';

describe('format', () => {
  it('groups digits the Indian way', () => {
    expect(price(1234567.5)).toBe('12,34,567.50');
    expect(inr(1234567.5)).toBe('₹12,34,567.50');
    expect(inr(-500)).toBe('-₹500.00');
  });

  it('puts an explicit sign on changes and prints zero without one', () => {
    expect(signed(12.345)).toBe('+12.35');
    expect(signed(-3)).toBe('-3.00');
    expect(signed(0)).toBe('0.00');
    expect(signedInr(0.001)).toBe('₹0.00');
    expect(pct(1.234)).toBe('+1.23%');
    expect(pct(-0.5, 1)).toBe('-0.5%');
    expect(pct(0.0001)).toBe('0.00%');
  });

  it('shows a dash for missing values instead of zero', () => {
    expect(price(null)).toBe('—');
    expect(pct(undefined)).toBe('—');
    expect(inr(Number.NaN)).toBe('—');
  });

  it('abbreviates in lakh and crore', () => {
    expect(compact(950)).toBe('950');
    expect(compact(12_500)).toBe('12.5K');
    expect(compact(3_40_000)).toBe('3.40L');
    expect(compact(5_60_00_000)).toBe('5.60Cr');
  });

  it('classifies tone', () => {
    expect(tone(1)).toBe('up');
    expect(tone(-1)).toBe('down');
    expect(tone(0)).toBe('flat');
    expect(tone(null)).toBe('flat');
  });
});
