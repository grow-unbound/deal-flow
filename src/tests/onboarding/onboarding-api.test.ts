import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaimsMock = vi.fn();
const signEntityVariantUploadsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: vi.fn() },
}));

vi.mock('@/lib/server/r2-presign-entity', () => ({
  signEntityVariantUploads: (...args: unknown[]) => signEntityVariantUploadsMock(...args),
}));

const loadOnboardingCatalogSummaryMock = vi.fn();

vi.mock('@/lib/server/onboarding-catalog-preview', () => ({
  loadOnboardingCatalogSummary: (...args: unknown[]) => loadOnboardingCatalogSummaryMock(...args),
  loadOnboardingPreview: vi.fn(),
}));

import { POST as batchPresign } from '../../../app/api/uploads/r2/batch/route';
import { GET as getOnboardingCatalog, PATCH as publishCatalog } from '../../../app/api/tenant/onboarding/catalog/route';

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/uploads/r2/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
  });

  it('returns 400 for an unknown entity type', async () => {
    const res = await batchPresign(jsonRequest('http://localhost/api/uploads/r2/batch', {
      items: [{
        entity_type: 'not_an_entity',
        entity_id: '11111111-1111-4111-8111-111111111111',
        original_content_type: 'image/jpeg',
      }],
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Unknown entity type/);
    expect(signEntityVariantUploadsMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty items array', async () => {
    const res = await batchPresign(jsonRequest('http://localhost/api/uploads/r2/batch', { items: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a buyer role', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'buyer_admin',
      buyer_id: 'buyer-1',
      location_ids: null,
    });
    const res = await batchPresign(jsonRequest('http://localhost/api/uploads/r2/batch', {
      items: [{
        entity_type: 'tenant_product',
        entity_id: '11111111-1111-4111-8111-111111111111',
        original_content_type: 'image/jpeg',
      }],
    }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/tenant/onboarding/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    loadOnboardingCatalogSummaryMock.mockResolvedValue({
      productCount: 17,
      slug: 'acme',
      businessName: 'Acme',
    });
  });

  it('returns the metrics snapshot summary without loading preview rows', async () => {
    const res = await getOnboardingCatalog(
      new NextRequest('http://localhost/api/tenant/onboarding/catalog?summary=1'),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      productCount: 17,
      slug: 'acme',
      businessName: 'Acme',
    });
    expect(loadOnboardingCatalogSummaryMock).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/tenant/onboarding/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for seller_assistant', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_assistant',
      buyer_id: null,
      location_ids: null,
    });
    const res = await publishCatalog(new NextRequest('http://localhost/api/tenant/onboarding/catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme',
        pricing_mode: 'hidden_until_login',
      }),
    }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when pricing_mode is missing', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      sub: 'user-1',
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });
    const res = await publishCatalog(new NextRequest('http://localhost/api/tenant/onboarding/catalog', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'acme' }),
    }));
    expect(res.status).toBe(400);
  });
});
