import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const loadCatalogSetupStateMock = vi.fn();
const saveCatalogSetupStateMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

vi.mock('@/lib/server/catalog-setup', () => ({
  CatalogSetupPatchSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
  CatalogSetupValidationError: class CatalogSetupValidationError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
  loadCatalogSetupState: (...args: unknown[]) => loadCatalogSetupStateMock(...args),
  saveCatalogSetupState: (...args: unknown[]) => saveCatalogSetupStateMock(...args),
}));

import { GET, PATCH } from '../../app/api/tenant/catalog/setup/route';
import { CatalogSetupValidationError } from '@/lib/server/catalog-setup';

const baseState = {
  productCount: 4,
  items: [],
  brands: [],
  categories: [],
  anomalies: [],
  slug: 'acme',
  businessName: 'Acme',
  live: false,
  pricingMode: null,
  priceListId: null,
  accessMode: 'public_link',
  collectTargetUnitPriceRange: false,
  productDisplayMode: 'sku_list',
  priceLists: [],
  photoTargets: [],
  settings: {},
};

describe('/api/tenant/catalog/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    loadCatalogSetupStateMock.mockResolvedValue(baseState);
    saveCatalogSetupStateMock.mockResolvedValue({ slug: 'acme' });
  });

  it('loads the shared catalog setup state for seller admins', async () => {
    const res = await GET(new NextRequest('https://app.yukti.so/api/tenant/catalog/setup', {
      headers: { host: 'app.yukti.so' },
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      slug: 'acme',
      storefrontHost: 'acme.useyukti.in',
    });
    expect(loadCatalogSetupStateMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', null, null);
  });

  it('rejects seller assistants', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
      location_ids: null,
    });
    const res = await GET(new NextRequest('http://localhost/api/tenant/catalog/setup'));
    expect(res.status).toBe(403);
  });

  it('saves catalog settings and returns a storefront URL', async () => {
    const res = await PATCH(new NextRequest('http://localhost/api/tenant/catalog/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pricing_mode: 'hide_price_collect_enquiry',
        collect_target_unit_price_range: true,
      }),
    }));
    expect(res.status).toBe(200);
    expect(saveCatalogSetupStateMock).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      actorId: 'user-1',
      patch: expect.objectContaining({
        pricing_mode: 'hide_price_collect_enquiry',
        collect_target_unit_price_range: true,
      }),
    });
    await expect(res.json()).resolves.toMatchObject({ storefront_url: 'http://acme.localhost' });
  });

  it('returns validation error statuses from the shared save helper', async () => {
    saveCatalogSetupStateMock.mockRejectedValueOnce(new CatalogSetupValidationError('Pick a price list', 400));
    const res = await PATCH(new NextRequest('http://localhost/api/tenant/catalog/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricing_mode: 'assigned_price_list' }),
    }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Pick a price list' });
  });
});
