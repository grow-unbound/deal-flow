import { describe, expect, it } from 'vitest';
import { buildBillingView, normalizePlanTier } from '@/lib/billing/build-billing-view';

describe('normalizePlanTier', () => {
  it('maps known tiers', () => {
    expect(normalizePlanTier('growth')).toBe('growth');
    expect(normalizePlanTier('scale')).toBe('scale');
  });
  it('defaults unknown to starter', () => {
    expect(normalizePlanTier('enterprise')).toBe('starter');
  });
});

describe('buildBillingView', () => {
  it('starter has no cohort/price-list/catalog limits (unlimited per plan)', () => {
    const v = buildBillingView({
      plan: 'starter',
      usage: { cohorts: 999, price_lists: 999, catalogs: 999 },
      whatsappBalance: 800,
      whatsappPurchased: 1000,
    });
    expect(v.plan).toBe('starter');
    expect(v.limits.cohorts).toBe(Number.POSITIVE_INFINITY);
    expect(v.warnings).toHaveLength(0);
  });

  it('scale has no limit warnings', () => {
    const v = buildBillingView({
      plan: 'scale',
      usage: { cohorts: 999, price_lists: 999, catalogs: 999 },
      whatsappBalance: 10,
      whatsappPurchased: 10,
    });
    expect(v.plan).toBe('scale');
    expect(v.warnings).toHaveLength(0);
  });
});
