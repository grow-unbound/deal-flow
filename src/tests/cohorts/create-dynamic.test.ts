import { describe, it, expect } from 'vitest';
import { CohortCreateSchema, CohortRuleFilterSchema, CohortRulesSchema } from '@/lib/zod';

describe('CohortCreateSchema — dynamic cohort', () => {
  it('accepts valid dynamic cohort with tier rule', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'North Delhi A-class',
      is_static: false,
      rules: {
        filters: [{ field: 'tier', operator: 'eq', value: 'A' }],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_static).toBe(false);
      expect(result.data.rules?.filters).toHaveLength(1);
    }
  });

  it('accepts rules with state + tier combined', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'KA Tier A',
      is_static: false,
      rules: {
        filters: [
          { field: 'geography.state', operator: 'eq', value: 'Karnataka' },
          { field: 'tier', operator: 'eq', value: 'A' },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rules?.filters).toHaveLength(2);
      expect(result.data.rules?.filters[0].field).toBe('geography.state');
    }
  });

  it('rejects cohort with empty name', () => {
    const result = CohortCreateSchema.safeParse({
      name: '',
      is_static: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe('Cohort name is required');
    }
  });

  it('rejects invalid rule field', () => {
    const result = CohortRuleFilterSchema.safeParse({
      field: 'email',
      operator: 'eq',
      value: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('defaults is_static to false', () => {
    const result = CohortCreateSchema.safeParse({ name: 'Test Cohort' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_static).toBe(false);
    }
  });

  it('accepts state filter with "in" operator', () => {
    const result = CohortRuleFilterSchema.safeParse({
      field: 'geography.state',
      operator: 'in',
      value: ['Karnataka', 'Tamil Nadu'],
    });
    expect(result.success).toBe(true);
  });

  it('empty rules filters defaults to empty array', () => {
    const result = CohortRulesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toEqual([]);
      expect(result.data.selected_buyer_ids).toEqual([]);
      expect(result.data.excluded_buyer_ids).toEqual([]);
    }
  });

  it('accepts last-order and GMV bucket filters with exclusions', () => {
    const result = CohortCreateSchema.safeParse({
      name: 'Dormant buyers with low spend',
      is_static: false,
      rules: {
        filters: [
          { field: 'last_order_bucket', operator: 'eq', value: 'dormant_90_plus_days' },
          { field: 'gmv_90d_bucket', operator: 'in', value: ['gmv_0', 'gmv_1_50000'] },
        ],
        excluded_buyer_ids: ['550e8400-e29b-41d4-a716-446655440000'],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rules?.excluded_buyer_ids).toHaveLength(1);
      expect(result.data.rules?.filters[0]?.field).toBe('last_order_bucket');
    }
  });
});
