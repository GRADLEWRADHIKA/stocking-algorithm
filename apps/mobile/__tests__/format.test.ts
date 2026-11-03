import {formatCompactINR, formatINR, formatNumber, groupIndian, pct} from '../src/utils/format';

describe('formatINR (Indian digit grouping)', () => {
  it('formats lakhs and crores with Indian grouping', () => {
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
    expect(formatINR(123456789)).toBe('₹12,34,56,789.00');
    expect(formatINR(999)).toBe('₹999.00');
    expect(formatINR(1000)).toBe('₹1,000.00');
    expect(formatINR(100000)).toBe('₹1,00,000.00');
  });

  it('handles negatives, signs, decimals and empty values', () => {
    expect(formatINR(-42)).toBe('-₹42.00');
    expect(formatINR(5, {sign: true})).toBe('+₹5.00');
    expect(formatINR(0, {sign: true})).toBe('₹0.00');
    expect(formatINR(-0.001)).toBe('₹0.00');
    expect(formatINR(1234.567, {decimals: 0})).toBe('₹1,235');
    expect(formatINR(null)).toBe('—');
    expect(formatINR(NaN)).toBe('—');
  });

  it('groups raw digit strings', () => {
    expect(groupIndian('1234567')).toBe('12,34,567');
    expect(groupIndian('12')).toBe('12');
  });

  it('formats plain numbers, percents and compact INR', () => {
    expect(formatNumber(1234567.5)).toBe('12,34,567.50');
    expect(formatNumber(-1500, {decimals: 0})).toBe('-1,500');
    expect(pct(1.234)).toBe('+1.23%');
    expect(pct(-0.5)).toBe('-0.50%');
    expect(pct(0)).toBe('0.00%');
    expect(formatCompactINR(12500000)).toBe('₹1.25 Cr');
    expect(formatCompactINR(340000)).toBe('₹3.40 L');
  });
});
