import { describe, expect, it } from 'vitest';

import {
  formatNumberInput,
  formatNumberValue,
  parseNumberInput,
} from '@/lib/number-format';

describe('formatNumberValue', () => {
  describe('CURRENCY_EXACT', () => {
    it('omits decimals for whole numbers', () => {
      expect(formatNumberValue(1180, 'CURRENCY_EXACT')).toBe('₹1,180');
      expect(formatNumberValue(8500, 'CURRENCY_EXACT')).toBe('₹8,500');
    });

    it('shows two decimals for fractional amounts', () => {
      expect(formatNumberValue(10.5, 'CURRENCY_EXACT')).toBe('₹10.50');
      expect(formatNumberValue(83.5235, 'CURRENCY_EXACT')).toBe('₹83.52');
      expect(formatNumberValue(12500.4, 'CURRENCY_EXACT')).toBe('₹12,500.40');
    });

    it('returns fallback for invalid values', () => {
      expect(formatNumberValue(null, 'CURRENCY_EXACT')).toBe('—');
      expect(formatNumberValue(undefined, 'CURRENCY_EXACT')).toBe('—');
      expect(formatNumberValue(Number.NaN, 'CURRENCY_EXACT')).toBe('—');
      expect(formatNumberValue(null, 'CURRENCY_EXACT', { fallback: '' })).toBe('');
    });
  });

  describe('CURRENCY_THRESHOLD', () => {
    it('formats below threshold with Indian grouping and no decimals', () => {
      expect(formatNumberValue(8500, 'CURRENCY_THRESHOLD')).toBe('₹8,500');
      expect(formatNumberValue(9999, 'CURRENCY_THRESHOLD')).toBe('₹9,999');
    });

    it('formats at/above threshold with K/L/Cr and two decimals', () => {
      expect(formatNumberValue(12250, 'CURRENCY_THRESHOLD')).toBe('₹12.25K');
      expect(formatNumberValue(236000, 'CURRENCY_THRESHOLD')).toBe('₹2.36L');
      expect(formatNumberValue(52300000, 'CURRENCY_THRESHOLD')).toBe('₹5.23Cr');
    });

    it('respects custom threshold', () => {
      expect(formatNumberValue(5000, 'CURRENCY_THRESHOLD', { threshold: 5000 })).toBe('₹5.00K');
    });
  });

  describe('PERCENTAGE', () => {
    it('rounds to two decimals with percent suffix', () => {
      expect(formatNumberValue(2.345, 'PERCENTAGE')).toBe('2.35%');
      expect(formatNumberValue(12.3, 'PERCENTAGE')).toBe('12.30%');
    });
  });

  describe('COUNT', () => {
    it('formats integers with Indian grouping and no symbol', () => {
      expect(formatNumberValue(1234567, 'COUNT')).toBe('12,34,567');
      expect(formatNumberValue(1234.9, 'COUNT')).toBe('1,234');
    });
  });
});

describe('formatNumberInput / parseNumberInput', () => {
  it('formats and parses CURRENCY_EXACT input', () => {
    expect(formatNumberInput('12500.4', 'CURRENCY_EXACT')).toBe('12,500.4');
    expect(parseNumberInput('12,500.40', 'CURRENCY_EXACT')).toBe(12500.4);
  });

  it('formats and parses COUNT input', () => {
    expect(formatNumberInput(1234, 'COUNT')).toBe('1,234');
    expect(parseNumberInput('1,234', 'COUNT')).toBe(1234);
  });

  it('formats and parses PERCENTAGE input', () => {
    expect(formatNumberInput('12.345', 'PERCENTAGE')).toBe('12.34');
    expect(parseNumberInput('12.34', 'PERCENTAGE')).toBe(12.34);
  });

  it('rejects CURRENCY_THRESHOLD for inputs', () => {
    expect(() => formatNumberInput('100', 'CURRENCY_THRESHOLD')).toThrow();
    expect(() => parseNumberInput('100', 'CURRENCY_THRESHOLD')).toThrow();
  });
});
