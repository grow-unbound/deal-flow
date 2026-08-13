import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/buyer-access', () => ({
  getVisibleBuyerCatalogs: vi.fn(),
}));

vi.mock('@/lib/server/buyer-brand-visibility', () => ({
  resolveBuyerAllowedTenantBrandIds: vi.fn(),
}));

vi.mock('@/lib/server/buyer-location-selection', () => ({
  getSelectedBuyerDeliveryFromRequest: vi.fn(),
}));

vi.mock('@/lib/server/buyer-routing', () => ({
  resolveNearestBuyerLocation: vi.fn(),
}));

vi.mock('@/lib/server/scoped-product-search', () => ({
  searchScopedProducts: vi.fn(),
}));

vi.mock('@/lib/r2-url', () => ({
  r2Url: vi.fn(() => null),
}));

import { enrichBuyerProducts } from '@/lib/server/buyer-product-data';

describe('buyer product enrichment', () => {
  it('filters inactive tenant products before exposing them to the buyer app', async () => {
    const finalEq = vi.fn(async () => ({ data: [], error: null }));
    const deletedIs = vi.fn(() => ({ eq: finalEq }));
    const idsIn = vi.fn(() => ({ is: deletedIs }));
    const tenantEq = vi.fn(() => ({ in: idsIn }));
    const select = vi.fn(() => ({ eq: tenantEq }));
    const settingsMaybeSingle = vi.fn(async () => ({ data: null }));
    const settingsEq = vi.fn(() => ({ maybeSingle: settingsMaybeSingle }));
    const settingsSelect = vi.fn(() => ({ eq: settingsEq }));
    const from = vi.fn((table: string) =>
      table === 'tenant_settings' ? { select: settingsSelect } : { select },
    );
    const schema = vi.fn(() => ({ from }));
    const db = { schema } as any;

    const result = await enrichBuyerProducts(db, {
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      tenantProductIds: ['product-1'],
    });

    expect(result.size).toBe(0);
    expect(schema).toHaveBeenCalledWith('app');
    expect(from).toHaveBeenCalledWith('tenant_products');
    expect(finalEq).toHaveBeenCalledWith('is_active', true);
  });
});
