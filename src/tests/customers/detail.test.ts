import { describe, it, expect } from 'vitest';
import { BuyerCreateSchema, BuyerUpdateSchema, BuyerGeographySchema } from '@/lib/zod';

// Pure unit tests for EP-03-005 (Buyer Detail View)
// Validates Zod schemas used by the detail page and underlying API routes.

// ─── BuyerCreateSchema ───────────────────────────────────────────────────────

describe('BuyerCreateSchema — detail page context', () => {
  it('validates a complete buyer record used in the detail view', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'WineYard Distributors',
      contact_name: 'Arun Kumar',
      phone: '9876543210',
      email: 'arun@wineyard.in',
      gstin: '29AABCW1234A1ZX',
      credit_limit: 200000,
      payment_terms_days: 45,
      default_price_list_id: '550e8400-e29b-41d4-a716-446655440000',
      geography: {
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        zone: 'South',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.business_name).toBe('WineYard Distributors');
      expect(result.data.default_price_list_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    }
  });

  it('rejects a buyer missing business_name', () => {
    const result = BuyerCreateSchema.safeParse({ phone: '9876543210' });
    expect(result.success).toBe(false);
  });
});

// ─── Phone validation ────────────────────────────────────────────────────────

describe('phone format validation', () => {
  const PHONE_REGEX = /^[0-9]{10}$/;

  it('validates a valid 10-digit phone number', () => {
    expect(PHONE_REGEX.test('9876543210')).toBe(true);
  });

  it('rejects a 9-digit phone number', () => {
    expect(PHONE_REGEX.test('987654321')).toBe(false);
  });

  it('rejects an 11-digit phone number', () => {
    expect(PHONE_REGEX.test('98765432101')).toBe(false);
  });

  it('rejects a phone with non-numeric characters', () => {
    expect(PHONE_REGEX.test('98765A3210')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(PHONE_REGEX.test('')).toBe(false);
  });
});

// ─── BuyerGeographySchema ─────────────────────────────────────────────────────

describe('BuyerGeographySchema', () => {
  it('accepts partial data — only city provided', () => {
    const result = BuyerGeographySchema.safeParse({ city: 'Mumbai' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.city).toBe('Mumbai');
      expect(result.data.state).toBeUndefined();
    }
  });

  it('accepts an empty object (all fields optional)', () => {
    const result = BuyerGeographySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full geography data', () => {
    const result = BuyerGeographySchema.safeParse({
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      zone: 'North',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pincode).toBe('110001');
    }
  });
});

// ─── BuyerUpdateSchema ────────────────────────────────────────────────────────

describe('BuyerUpdateSchema', () => {
  it('allows an all-optional update — empty object is valid', () => {
    const result = BuyerUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates a partial update with only contact_name', () => {
    const result = BuyerUpdateSchema.safeParse({ contact_name: 'New Contact' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contact_name).toBe('New Contact');
    }
  });

  it('rejects an invalid phone in a partial update', () => {
    const result = BuyerUpdateSchema.safeParse({ phone: '12345' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneErr = result.error.errors.find((e) => e.path.includes('phone'));
      expect(phoneErr).toBeDefined();
    }
  });

  it('accepts default pricelist update alone', () => {
    const result = BuyerUpdateSchema.safeParse({ default_price_list_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.default_price_list_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    }
  });
});
