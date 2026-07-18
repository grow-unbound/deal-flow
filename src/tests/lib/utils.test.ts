import { describe, expect, it } from 'vitest';

import { formatCurrency, formatMetricValue, formatNumber } from '@/lib/utils';

describe('number formatters', () => {
  it('formats compact INR values with trimmed decimals', () => {
    expect(formatCurrency(52300000, { compactFractionDigits: 2 })).toBe('₹5.23Cr');
    expect(formatCurrency(236000, { compactFractionDigits: 2 })).toBe('₹2.36L');
    expect(formatCurrency(15430, { compactFractionDigits: 2 })).toBe('₹15.43K');
  });

  it('keeps small values in standard INR format', () => {
    expect(formatCurrency(9999, { compactFractionDigits: 2 })).toBe('₹9,999');
  });

  it('formats counts with Indian grouping and no currency symbol', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
  });

  it('routes metric labels through the right formatter', () => {
    expect(formatMetricValue('Sold Products Out of Stock', 12)).toBe('12');
    expect(formatMetricValue('Invoiced sales · This month', 52300000)).toBe('₹5.23Cr');
  });
});
