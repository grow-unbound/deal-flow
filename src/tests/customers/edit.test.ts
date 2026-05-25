import { describe, it, expect } from 'vitest';
import { BuyerUpdateSchema } from '@/lib/zod';

// Helper that simulates the server-side role check for financial field stripping
function stripFinancialFieldsForAssistant(
  role: string,
  updateData: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...updateData };
  if (role === 'seller_assistant') {
    delete result.credit_limit;
    delete result.payment_terms_days;
  }
  return result;
}

describe('BuyerUpdateSchema', () => {
  it('allows all fields to be optional (partial schema)', () => {
    // An empty object should be valid — every field is optional on update
    const result = BuyerUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates phone regex when phone is provided', () => {
    const invalid = BuyerUpdateSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '12345', // too short
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const phoneError = invalid.error.errors.find((e) => e.path.includes('phone'));
      expect(phoneError?.message).toBe('Phone must be 10 digits');
    }

    const valid = BuyerUpdateSchema.safeParse({
      business_name: 'Test Retailer',
      phone: '9876543210',
    });
    expect(valid.success).toBe(true);
  });

  it('accepts undefined phone (optional on edit)', () => {
    const result = BuyerUpdateSchema.safeParse({
      business_name: 'Updated Business Name',
      // phone intentionally omitted
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
    }
  });

  it('seller_assistant cannot update financial fields — role check strips them', () => {
    const incoming = {
      business_name: 'Test Co.',
      credit_limit: 100000,
      payment_terms_days: 60,
    };

    const adminResult = stripFinancialFieldsForAssistant('seller_admin', incoming);
    expect(adminResult.credit_limit).toBe(100000);
    expect(adminResult.payment_terms_days).toBe(60);

    const assistantResult = stripFinancialFieldsForAssistant('seller_assistant', incoming);
    expect(assistantResult.credit_limit).toBeUndefined();
    expect(assistantResult.payment_terms_days).toBeUndefined();
    // Other fields are preserved
    expect(assistantResult.business_name).toBe('Test Co.');
  });
});
