import { describe, it, expect } from 'vitest';
import { PriceListSchema } from '@/lib/zod';

describe('PriceListSchema', () => {
  it('accepts valid price list with only valid_from', () => {
    const result = PriceListSchema.safeParse({
      name: 'Summer Pricing',
      currency: 'INR',
      valid_from: '2026-06-01T00:00:00Z',
      priority: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid price list when valid_to is after valid_from', () => {
    const result = PriceListSchema.safeParse({
      name: 'Summer Pricing',
      currency: 'INR',
      valid_from: '2026-06-01T00:00:00Z',
      valid_to: '2026-08-31T23:59:59Z',
      priority: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when valid_to is before valid_from', () => {
    const result = PriceListSchema.safeParse({
      name: 'Bad Dates',
      currency: 'INR',
      valid_from: '2026-08-01T00:00:00Z',
      valid_to: '2026-06-01T00:00:00Z',
      priority: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain('End date must be after start date.');
    }
  });

  it('requires name', () => {
    const result = PriceListSchema.safeParse({
      name: '',
      currency: 'INR',
      valid_from: '2026-06-01T00:00:00Z',
      priority: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages.some((m) => m.toLowerCase().includes('price list name'))).toBe(true);
    }
  });

  it('defaults currency to INR', () => {
    const result = PriceListSchema.safeParse({
      name: 'Default Currency Test',
      valid_from: '2026-06-01T00:00:00Z',
      priority: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('INR');
    }
  });

  it('defaults priority to 0', () => {
    const result = PriceListSchema.safeParse({
      name: 'Default Priority Test',
      currency: 'INR',
      valid_from: '2026-06-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(0);
    }
  });
});
