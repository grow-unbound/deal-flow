import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: null,
  supabase: {},
}));

import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';

function createDb(settings: Record<string, unknown>, warehouseRows: Array<Record<string, unknown>>, defaultRows: Array<Record<string, unknown>>) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === 'tenant_settings') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { settings }, error: null }),
              }),
            }),
          };
        }

        if (table === 'warehouses') {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  not: () => ({
                    not: async () => ({ data: warehouseRows, error: null }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'locations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    limit: async () => ({ data: defaultRows, error: null }),
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    }),
  };
}

describe('resolveNearestBuyerLocation', () => {
  it('falls back to the default location when no warehouse is within the 50km default threshold', async () => {
    const db = createDb(
      {},
      [
        {
          id: 'warehouse-1',
          name: 'Far Warehouse',
          lat: 0.6,
          lng: 0.6,
          is_default: false,
          location_id: 'branch-1',
        },
      ],
      [{ id: 'default-location', name: 'Default Warehouse' }],
    );

    const resolved = await resolveNearestBuyerLocation(db as never, 'tenant-1', { lat: 0, lng: 0 });

    expect(resolved).toEqual({
      warehouseId: null,
      locationId: 'default-location',
      locationName: 'Default Warehouse',
      distanceKm: null,
      fallback: true,
    });
  });

  it('uses a custom threshold when present and returns the nearest warehouse within range', async () => {
    const db = createDb(
      { delivery_routing_threshold_km: 120 },
      [
        {
          id: 'warehouse-1',
          name: 'Near Warehouse',
          lat: 0.3,
          lng: 0.3,
          is_default: false,
          location_id: 'branch-1',
        },
      ],
      [{ id: 'default-location', name: 'Default Warehouse' }],
    );

    const resolved = await resolveNearestBuyerLocation(db as never, 'tenant-1', { lat: 0, lng: 0 });

    expect(resolved?.warehouseId).toBe('warehouse-1');
    expect(resolved?.locationId).toBe('branch-1');
    expect(resolved?.locationName).toBe('Near Warehouse');
    expect(resolved?.fallback).toBe(false);
    expect(resolved?.distanceKm).toEqual(expect.any(Number));
  });
});
