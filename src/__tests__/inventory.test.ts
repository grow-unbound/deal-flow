import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeSellable, isLowStock } from '@/hooks/useInventory';

const TENANT_ID = 'tenant-uuid-001';
const PRODUCT_ID = 'product-uuid-001';
const LOCATION_ID = 'location-uuid-001';

// ---------------------------------------------------------------------------
// Pure function unit tests
// ---------------------------------------------------------------------------
describe('computeSellable', () => {
  it('returns available minus reserved', () => {
    expect(computeSellable({ qty_available: 10, qty_reserved: 3 })).toBe(7);
  });

  it('returns 0 when reserved equals available', () => {
    expect(computeSellable({ qty_available: 5, qty_reserved: 5 })).toBe(0);
  });

  it('handles zero reserved', () => {
    expect(computeSellable({ qty_available: 8, qty_reserved: 0 })).toBe(8);
  });
});

describe('isLowStock', () => {
  it('returns true when sellable is below reorder_point', () => {
    // sellable = 5 - 2 = 3, reorder = 4 → low stock
    expect(isLowStock({ qty_available: 5, qty_reserved: 2, reorder_point: 4 })).toBe(true);
  });

  it('returns false when sellable is above reorder_point', () => {
    // sellable = 10 - 2 = 8, reorder = 4 → not low
    expect(isLowStock({ qty_available: 10, qty_reserved: 2, reorder_point: 4 })).toBe(false);
  });

  it('returns false when no reorder_point is set (null)', () => {
    expect(isLowStock({ qty_available: 1, qty_reserved: 0, reorder_point: null })).toBe(false);
  });

  it('returns false when no reorder_point is set (undefined)', () => {
    expect(isLowStock({ qty_available: 1, qty_reserved: 0 })).toBe(false);
  });

  it('returns false when sellable equals reorder_point (not strictly below)', () => {
    // sellable = 4, reorder = 4 → exactly at point, not below
    expect(isLowStock({ qty_available: 4, qty_reserved: 0, reorder_point: 4 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// API route mock tests
// ---------------------------------------------------------------------------
describe('GET /api/tenant/locations', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns locations array for tenant', async () => {
    const locations = [
      { id: LOCATION_ID, name: 'Main Warehouse', is_default: true, tenant_id: TENANT_ID },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { locations }, error: null }),
    });

    const res = await fetch('/api/tenant/locations');
    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.data.locations).toHaveLength(1);
    expect(data.data.locations[0].name).toBe('Main Warehouse');
  });

  it('unauthenticated request → 401', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const res = await fetch('/api/tenant/locations');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/tenant/locations', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('seller_admin creates location → 201 with location', async () => {
    const created = {
      id: LOCATION_ID,
      name: 'Secondary Store',
      is_default: false,
      tenant_id: TENANT_ID,
      address: null,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: { location: created }, error: null }),
    });

    const res = await fetch('/api/tenant/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Secondary Store' }),
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.data.location.name).toBe('Secondary Store');
  });

  it('seller_assistant cannot create location → 403', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ data: null, error: { message: 'Forbidden: only seller_admin can create locations' } }),
    });

    const res = await fetch('/api/tenant/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Blocked Location' }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error?.message).toMatch(/seller_admin/);
  });

  it('missing name → 400', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ data: null, error: { message: 'Invalid request body' } }),
    });

    const res = await fetch('/api/tenant/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tenant/inventory', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches inventory for a product with correct product_id param', async () => {
    const inventoryRow = {
      id: 'inv-001',
      tenant_product_id: PRODUCT_ID,
      location_id: LOCATION_ID,
      qty_available: 20,
      qty_reserved: 5,
      reorder_point: 10,
      updated_at: new Date().toISOString(),
      locations: { id: LOCATION_ID, name: 'Main Warehouse', is_default: true },
    };

    fetchMock.mockImplementationOnce((url: string) => {
      expect(url).toContain(`product_id=${PRODUCT_ID}`);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ inventory: [inventoryRow] }),
      });
    });

    const res = await fetch(`/api/tenant/inventory?product_id=${PRODUCT_ID}`);
    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.inventory).toHaveLength(1);
    expect(data.inventory[0].qty_available).toBe(20);
    expect(data.inventory[0].locations.name).toBe('Main Warehouse');
  });

  it('missing product_id → 400', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'product_id query param is required' }),
    });

    const res = await fetch('/api/tenant/inventory');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tenant/inventory', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST with valid data → 200 with inventory record', async () => {
    const inventoryRecord = {
      id: 'inv-001',
      tenant_product_id: PRODUCT_ID,
      location_id: LOCATION_ID,
      qty_available: 50,
      qty_reserved: 5,
      reorder_point: 10,
      updated_at: new Date().toISOString(),
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ inventory: inventoryRecord }),
    });

    const res = await fetch('/api/tenant/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_product_id: PRODUCT_ID,
        location_id: LOCATION_ID,
        qty_available: 50,
        qty_reserved: 5,
        reorder_point: 10,
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json() as any;
    expect(data.inventory.qty_available).toBe(50);
    expect(data.inventory.qty_reserved).toBe(5);
  });

  it('invalid body → 400', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid request body' }),
    });

    const res = await fetch('/api/tenant/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_product_id: 'not-a-uuid' }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it('unauthenticated → 401', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const res = await fetch('/api/tenant/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_product_id: PRODUCT_ID,
        location_id: LOCATION_ID,
        qty_available: 10,
        qty_reserved: 0,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});
