import { describe, it, expect } from 'vitest';
import { PriceListAssignmentSchema } from '@/lib/zod';

describe('PriceListAssignmentSchema', () => {
  it('accepts all_buyers without target_id', () => {
    expect(PriceListAssignmentSchema.safeParse({ target_type: 'all_buyers' }).success).toBe(true);
  });
  it('accepts cohort with valid target_id', () => {
    expect(PriceListAssignmentSchema.safeParse({ target_type: 'cohort', target_id: '123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
  });
  it('accepts buyer with valid target_id', () => {
    expect(PriceListAssignmentSchema.safeParse({ target_type: 'buyer', target_id: '123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
  });
  it('rejects cohort without target_id', () => {
    const result = PriceListAssignmentSchema.safeParse({ target_type: 'cohort' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Target is required for buyer or cohort assignments.');
    }
  });
  it('rejects buyer without target_id', () => {
    const result = PriceListAssignmentSchema.safeParse({ target_type: 'buyer' });
    expect(result.success).toBe(false);
  });
  it('rejects invalid target_type', () => {
    expect(PriceListAssignmentSchema.safeParse({ target_type: 'unknown' }).success).toBe(false);
  });
});
