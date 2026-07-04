import { describe, it, expect } from 'vitest';
import { BuyerCreateSchema } from '@/lib/zod';

describe('BuyerCreateSchema', () => {
  it('validates a 10-digit phone correctly', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '9876543210',
    });
    expect(result.success).toBe(true);
  });

  it('rejects phone with fewer than 10 digits', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '987654321',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneError = result.error.errors.find((e) => e.path.includes('phone'));
      expect(phoneError?.message).toBe('Phone must be 10 digits');
    }
  });

  it('rejects phone with more than 10 digits', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '98765432101',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneError = result.error.errors.find((e) => e.path.includes('phone'));
      expect(phoneError?.message).toBe('Phone must be 10 digits');
    }
  });

  it('rejects non-numeric phone', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Test Retailer',
      phone: 'abcdefghij',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneError = result.error.errors.find((e) => e.path.includes('phone'));
      expect(phoneError?.message).toBe('Phone must be 10 digits');
    }
  });

  it('accepts valid complete buyer data', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Mumbai Retail Co.',
      contact_name: 'Raj Sharma',
      phone: '9876543210',
      email: 'raj@mumbairetail.com',
      gstin: '27AABCU9603R1ZX',
      credit_limit: 50000,
      payment_terms_days: 30,
      default_price_list_id: '550e8400-e29b-41d4-a716-446655440000',
      geography: {
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        zone: 'West',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.business_name).toBe('Mumbai Retail Co.');
      expect(result.data.phone).toBe('9876543210');
      expect(result.data.default_price_list_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.data.credit_limit).toBe(50000);
    }
  });

  it('accepts payloads without tier and external_ref fields', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Lean Traders',
      phone: '9123456789',
      default_price_list_id: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('tier');
      expect(result.data).not.toHaveProperty('external_ref');
    }
  });
});
