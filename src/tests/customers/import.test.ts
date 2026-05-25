import { describe, it, expect } from 'vitest';
import { BuyerCsvRowSchema } from '@/lib/zod';

describe('BuyerCsvRowSchema', () => {
  it('validates a valid row correctly', () => {
    const result = BuyerCsvRowSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '9876543210',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.business_name).toBe('Test Retailer');
      expect(result.data.phone).toBe('9876543210');
    }
  });

  it('rejects missing business_name', () => {
    const result = BuyerCsvRowSchema.safeParse({
      business_name: '',
      phone: '9876543210',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameError = result.error.errors.find((e) => e.path.includes('business_name'));
      expect(nameError?.message).toBe('Business name is required');
    }
  });

  it('rejects invalid phone with fewer than 10 digits', () => {
    const result = BuyerCsvRowSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '987654321',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const phoneError = result.error.errors.find((e) => e.path.includes('phone'));
      expect(phoneError?.message).toBe('Phone must be 10 digits');
    }
  });

  it('accepts optional fields as undefined', () => {
    const result = BuyerCsvRowSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '9876543210',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contact_name).toBeUndefined();
      expect(result.data.gstin).toBeUndefined();
      expect(result.data.city).toBeUndefined();
      expect(result.data.tier).toBeUndefined();
    }
  });

  it('coerces credit_limit string to number', () => {
    const result = BuyerCsvRowSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '9876543210',
      credit_limit: '50000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.credit_limit).toBe(50000);
      expect(typeof result.data.credit_limit).toBe('number');
    }
  });
});
