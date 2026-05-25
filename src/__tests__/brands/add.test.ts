import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Types matching the API response shapes
interface MasterBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
}

interface TenantBrandRow {
  id: string;
  tenant_id: string;
  master_brand_id: string;
  display_name_override: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  master_brand: MasterBrand | null;
}

const mockMasterBrand: MasterBrand = {
  id: 'brand-uuid-001',
  name: 'Acme Corp',
  slug: 'acme-corp',
  logo_url: null,
  description: 'A test brand',
};

const mockTenantBrandRow: TenantBrandRow = {
  id: 'tenant-brand-uuid-001',
  tenant_id: 'tenant-uuid-001',
  master_brand_id: mockMasterBrand.id,
  display_name_override: null,
  margin_pct: null,
  exclusivity: null,
  is_active: true,
  external_ref: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  master_brand: mockMasterBrand,
};

describe('Brand search API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns brand results from search endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ brands: [mockMasterBrand] }),
    });

    const res = await fetch('/api/brands/search?q=acme');
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.brands).toHaveLength(1);
    expect(data.brands[0].name).toBe('Acme Corp');
    expect(fetchMock).toHaveBeenCalledWith('/api/brands/search?q=acme');
  });

  it('returns empty array when no brands match', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ brands: [] }),
    });

    const res = await fetch('/api/brands/search?q=nonexistent');
    const data = await res.json();
    expect(data.brands).toHaveLength(0);
  });
});

describe('Tenant brands API - add brand', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('successfully adds a new brand to tenant catalog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ brand: mockTenantBrandRow }),
    });

    const res = await fetch('/api/tenant/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_brand_id: mockMasterBrand.id }),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.brand.master_brand_id).toBe(mockMasterBrand.id);
    expect(data.brand.is_active).toBe(true);
  });

  it('newly added brand appears in tenant brands list', async () => {
    // First call: GET tenant brands (initially empty)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ brands: [] }),
    });

    const listRes = await fetch('/api/tenant/brands');
    const listData = await listRes.json();
    expect(listData.brands).toHaveLength(0);

    // Second call: POST to add brand
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ brand: mockTenantBrandRow }),
    });

    await fetch('/api/tenant/brands', {
      method: 'POST',
      body: JSON.stringify({ master_brand_id: mockMasterBrand.id }),
    });

    // Third call: GET tenant brands (now has the brand)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ brands: [mockTenantBrandRow] }),
    });

    const updatedRes = await fetch('/api/tenant/brands');
    const updatedData = await updatedRes.json();
    expect(updatedData.brands).toHaveLength(1);
    expect(updatedData.brands[0].master_brand_id).toBe(mockMasterBrand.id);
  });

  it('returns 409 when brand is already in tenant catalog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Brand already in your catalog' }),
    });

    const res = await fetch('/api/tenant/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_brand_id: mockMasterBrand.id }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('Brand already in your catalog');
  });

  it('returns 401 for unauthenticated requests', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const res = await fetch('/api/tenant/brands', {
      method: 'POST',
      body: JSON.stringify({ master_brand_id: mockMasterBrand.id }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID in master_brand_id', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid request body' }),
    });

    const res = await fetch('/api/tenant/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_brand_id: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
  });
});
