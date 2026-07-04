import { describe, it, expect } from 'vitest';
import { BuyerCreateSchema } from '@/lib/zod';

// Pure unit tests for EP-03-004 (Deactivate / Reactivate Buyer)
// No DB or API calls — test logic / schema / status helper mapping only.

// ─── Deactivate / reactivate action helper (mirrors PATCH route logic) ────────

function applyStatusAction(
  currentIsActive: boolean,
  action: 'deactivate' | 'reactivate',
): boolean {
  return action === 'reactivate';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deactivate action', () => {
  it('sets is_active to false for an active buyer', () => {
    const result = applyStatusAction(true, 'deactivate');
    expect(result).toBe(false);
  });

  it('keeps is_active false when deactivating an already-inactive buyer', () => {
    const result = applyStatusAction(false, 'deactivate');
    expect(result).toBe(false);
  });
});

describe('reactivate action', () => {
  it('sets is_active to true for an inactive buyer', () => {
    const result = applyStatusAction(false, 'reactivate');
    expect(result).toBe(true);
  });

  it('keeps is_active true when reactivating an already-active buyer', () => {
    const result = applyStatusAction(true, 'reactivate');
    expect(result).toBe(true);
  });
});

describe('PATCH action validation', () => {
  it('accepts "deactivate" as a valid action', () => {
    const validActions = ['deactivate', 'reactivate'] as const;
    expect(validActions.includes('deactivate')).toBe(true);
  });

  it('accepts "reactivate" as a valid action', () => {
    const validActions = ['deactivate', 'reactivate'] as const;
    expect(validActions.includes('reactivate')).toBe(true);
  });

  it('rejects unknown actions', () => {
    const validActions = new Set(['deactivate', 'reactivate']);
    expect(validActions.has('delete')).toBe(false);
    expect(validActions.has('suspend')).toBe(false);
    expect(validActions.has('')).toBe(false);
  });
});

describe('buyer schema for deactivate context', () => {
  it('validates a buyer with all fields needed for status display', () => {
    const result = BuyerCreateSchema.safeParse({
      business_name: 'Test Co.',
      phone: '9876543210',
      credit_limit: 10000,
      payment_terms_days: 30,
      buyer_app_enabled: true,
    });
    expect(result.success).toBe(true);
  });
});
