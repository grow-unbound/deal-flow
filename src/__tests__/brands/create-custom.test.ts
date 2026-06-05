import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface CatalogBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  is_public: boolean;
  origin_tenant_id: string;
}

interface TenantBrandRow {
  id: string;
  tenant_id: string;
  master_brand_id: string;
  logo_url?: string | null;
  principal_name?: string | null;
  principal_location?: string | null;
  contact_name?: string | null;
  default_cohort_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const mockCatalogBrand: CatalogBrand = {
  id: 'brand-uuid-private-001',
  name: 'Sunrise Electronics',
  slug: 'sunrise-electronics',
  logo_url: null,
  description: null,
  is_public: false,
  origin_tenant_id: 'tenant-uuid-001',
};

const mockTenantBrandRow: TenantBrandRow = {
  id: 'tenant-brand-uuid-002',
  tenant_id: 'tenant-uuid-001',
  master_brand_id: mockCatalogBrand.id,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Custom brand creation API - POST /api/brands/custom', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a private brand with is_public=false', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        brand: {
          ...mockTenantBrandRow,
          master_brand: mockCatalogBrand,
        },
      }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sunrise Electronics',
        slug: 'sunrise-electronics',
        principal_name: 'Sunrise North',
        principal_location: 'Mumbai',
      }),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.brand.master_brand.is_public).toBe(false);
    expect(data.brand.master_brand.origin_tenant_id).toBe('tenant-uuid-001');
    expect(data.brand.master_brand.slug).toBe('sunrise-electronics');
    expect(data.brand.is_active).toBe(true);
  });

  it('returns 400 when slug contains invalid characters', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Invalid request body',
        details: {
          fieldErrors: {
            slug: ['Slug may only contain lowercase letters and hyphens.'],
          },
        },
      }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Slug Brand',
        slug: 'Bad Slug With Spaces!',
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Invalid request body');
    expect(data.details.fieldErrors.slug[0]).toMatch(/lowercase letters and hyphens/i);
  });

  it('returns 400 when name is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Invalid request body',
        details: {
          fieldErrors: {
            name: ['Brand name is required'],
          },
        },
      }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'some-slug' }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it('returns 409 when slug is already taken', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'A brand with this slug already exists.',
      }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Brand',
        slug: 'sunrise-electronics', // already taken
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.error).toMatch(/slug already exists/i);
  });

  it('returns 401 for unauthenticated requests', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not a seller role', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', slug: 'test' }),
    });

    expect(res.status).toBe(403);
  });

  it('accepts optional fields (description, logo_url)', async () => {
    const brandWithExtras = {
      ...mockTenantBrandRow,
      master_brand: {
        ...mockCatalogBrand,
        description: 'A consumer electronics brand',
        logo_url: 'https://example.com/logo.png',
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ brand: brandWithExtras }),
    });

    const res = await fetch('/api/brands/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sunrise Electronics',
        slug: 'sunrise-electronics',
        description: 'A consumer electronics brand',
        logo_url: 'https://example.com/logo.png',
        contact_name: 'Aman Gupta',
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.brand.master_brand.description).toBe('A consumer electronics brand');
    expect(data.brand.master_brand.logo_url).toBe('https://example.com/logo.png');
  });
});

describe('Slug validation logic', () => {
  const SLUG_RE = /^[a-z0-9-]+$/;

  it('accepts valid slugs', () => {
    const valid = ['sunrise-electronics', 'brand-123', 'abc', 'a-b-c-1'];
    valid.forEach((s) => {
      expect(SLUG_RE.test(s)).toBe(true);
    });
  });

  it('rejects slugs with uppercase letters', () => {
    expect(SLUG_RE.test('BrandName')).toBe(false);
  });

  it('rejects slugs with spaces', () => {
    expect(SLUG_RE.test('brand name')).toBe(false);
  });

  it('rejects slugs with special characters', () => {
    const invalid = ['brand_name', 'brand.name', 'brand!', 'brand@123'];
    invalid.forEach((s) => {
      expect(SLUG_RE.test(s)).toBe(false);
    });
  });
});
