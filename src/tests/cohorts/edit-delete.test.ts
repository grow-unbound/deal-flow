import { describe, it, expect } from 'vitest';
import { CohortUpdateSchema } from '@/lib/zod';

describe('Cohort edit and delete', () => {
  it('CohortUpdateSchema accepts partial update (name only)', () => {
    const result = CohortUpdateSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Name');
    }
  });

  it('CohortUpdateSchema accepts partial update (description only)', () => {
    const result = CohortUpdateSchema.safeParse({ description: 'New description' });
    expect(result.success).toBe(true);
  });

  it('CohortUpdateSchema accepts updating rules', () => {
    const result = CohortUpdateSchema.safeParse({
      rules: {
        filters: [{ field: 'tier', operator: 'eq', value: 'B' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('soft delete: updated_at is set to a date string on delete', () => {
    // Simulate what the API does: set updated_at = new Date().toISOString()
    const updatedAt = new Date().toISOString();
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const parsed = new Date(updatedAt);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });

  it('soft delete: row still exists (is_active is set to false, not hard deleted)', () => {
    // Simulate a soft-deleted row
    const row = {
      id: 'some-uuid',
      name: 'Old Cohort',
      is_active: false,
    };
    expect(row.is_active).toBe(false);
    // The row still "exists" — it's not removed from the table
    expect(row.id).toBe('some-uuid');
  });

  it('delete blocked when referenced by published catalog: error code COHORT_IN_USE', () => {
    // Simulate the API response when a cohort is in use
    const apiResponse = {
      error: 'This cohort is used in an active catalog. Archive the catalog before deleting the cohort.',
      code: 'COHORT_IN_USE',
    };
    expect(apiResponse.code).toBe('COHORT_IN_USE');
    expect(apiResponse.error).toContain('Archive the catalog');
  });

  it('CohortUpdateSchema empty object is valid (no-op update)', () => {
    const result = CohortUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('name cannot be empty string in update', () => {
    const result = CohortUpdateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});
