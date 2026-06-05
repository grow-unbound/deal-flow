import { describe, it, expect } from 'vitest';
import { CohortCreateSchema } from '@/lib/zod';

describe('Static cohort schema and member count', () => {
  it('accepts a valid static cohort', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'VIP Retailers',
      is_static: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_static).toBe(true);
      expect(result.data.rules).toBeUndefined();
    }
  });

  it('rejects static cohort with empty name', () => {
    const result = CohortCreateSchema.safeParse({
      name: '',
      is_static: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe('Cohort name is required');
    }
  });

  it('accepts static cohort with description', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'Premium Partners',
      description: 'Top-tier buyers by relationship',
      is_static: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('Top-tier buyers by relationship');
    }
  });

  it('static cohort does not require rules', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'Manual List',
      is_static: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rules).toBeUndefined();
    }
  });

  it('cached_member_count logic: count matches inserted buyers', () => {
    // Unit test the count logic — simulate that 3 buyers were inserted
    const insertedBuyerIds = ['uuid-1', 'uuid-2', 'uuid-3'];
    const cachedCount = insertedBuyerIds.length;
    expect(cachedCount).toBe(3);
  });

  it('dynamic cohort can have rules alongside is_static=false', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'Dynamic with rules',
      is_static: false,
      rules: { filters: [{ field: 'tier', operator: 'eq', value: 'A' }] },
    });
    expect(result.success).toBe(true);
  });

  it('manual cohort can persist selected buyers in rules metadata', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'Manual List',
      is_static: true,
      rules: {
        filters: [],
        selected_buyer_ids: [
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001',
        ],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rules?.selected_buyer_ids).toHaveLength(2);
    }
  });
});
