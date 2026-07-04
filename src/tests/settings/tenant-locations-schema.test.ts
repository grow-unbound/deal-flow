import { describe, expect, it } from 'vitest';
import {
  CreateLocationInputSchema,
  LocationAddressSchema,
  UpdateLocationInputSchema,
} from '@/types/tenant-locations';

describe('LocationAddressSchema', () => {
  it('defaults empty address', () => {
    const r = LocationAddressSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.line1).toBe('');
      expect(r.data.city).toBe('');
    }
  });
});

describe('CreateLocationInputSchema', () => {
  it('parses minimal create', () => {
    const r = CreateLocationInputSchema.safeParse({ name: 'WH1' });
    expect(r.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(CreateLocationInputSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('UpdateLocationInputSchema', () => {
  it('allows partial patch', () => {
    const r = UpdateLocationInputSchema.safeParse({ name: 'X' });
    expect(r.success).toBe(true);
  });

  it('allows reactivate flag', () => {
    const r = UpdateLocationInputSchema.safeParse({ reactivate: true });
    expect(r.success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(UpdateLocationInputSchema.safeParse({ foo: 1 }).success).toBe(false);
  });
});
