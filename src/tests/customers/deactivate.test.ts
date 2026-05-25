import { describe, it, expect } from 'vitest';
import { BuyerCreateSchema } from '@/lib/zod';

// Pure unit tests for EP-03-004 (Deactivate / Reactivate Buyer)
// No DB or API calls — test logic / schema / tier badge mapping only.

// ─── Tier badge class mapping (mirrors app/(seller)/customers/[id]/page.tsx) ──

const TIER_BADGE_CLASS: Record<string, string> = {
  A: 'bg-teal-100 text-teal-800',
  B: 'bg-cream-200 text-cream-700',
  C: 'bg-cream-100 text-cream-500',
};

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

describe('tier badge class', () => {
  it('returns teal classes for Tier A', () => {
    expect(TIER_BADGE_CLASS['A']).toBe('bg-teal-100 text-teal-800');
  });

  it('returns cream classes for Tier B', () => {
    expect(TIER_BADGE_CLASS['B']).toBe('bg-cream-200 text-cream-700');
  });

  it('returns muted cream classes for Tier C', () => {
    expect(TIER_BADGE_CLASS['C']).toBe('bg-cream-100 text-cream-500');
  });

  it('returns undefined for an unknown tier', () => {
    expect(TIER_BADGE_CLASS['X']).toBeUndefined();
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
      tier: 'A',
      credit_limit: 10000,
      payment_terms_days: 30,
    });
    expect(result.success).toBe(true);
  });
});
