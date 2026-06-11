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
  it('builds starter view with warnings near limit', () => {
    const v = buildBillingView({
      plan: 'starter',
      usage: { cohorts: 4, price_lists: 2, catalogs: 3 },
      whatsappBalance: 800,
      whatsappPurchased: 1000,
    });
    expect(v.plan).toBe('starter');
    expect(v.limits.cohorts).toBe(5);
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.warnings.some((w) => w.key === 'catalogs')).toBe(true);
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
