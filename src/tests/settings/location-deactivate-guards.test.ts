import { describe, expect, it } from 'vitest';
import {
  hasBlockingStockAtLocation,
  normalizeLocationAddress,
  wouldRemoveLastTrackedLocation,
} from '@/lib/locations/location-deactivate-guards';

describe('hasBlockingStockAtLocation', () => {
  it('false when no row', () => {
    expect(hasBlockingStockAtLocation(undefined)).toBe(false);
    expect(hasBlockingStockAtLocation(null)).toBe(false);
  });
  it('true when qty_available > 0', () => {
    expect(hasBlockingStockAtLocation({ qty_available: 1, qty_reserved: 0 })).toBe(true);
  });
  it('true when qty_reserved > 0', () => {
    expect(hasBlockingStockAtLocation({ qty_available: 0, qty_reserved: 1 })).toBe(true);
  });
  it('false when string numerics zero', () => {
    expect(hasBlockingStockAtLocation({ qty_available: '0' as unknown as number, qty_reserved: 0 })).toBe(false);
  });
});

describe('wouldRemoveLastTrackedLocation', () => {
  const loc = (id: string, inv: boolean) => ({ id, inventory_tracking: inv, deleted_at: null as string | null });

  it('false when tenant has no inventory rows', () => {
    expect(
      wouldRemoveLastTrackedLocation({
        targetLocationId: 'a',
        targetInventoryTracking: true,
        allActiveLocations: [loc('a', true), loc('b', true)],
        tenantHasInventoryRows: false,
      }),
    ).toBe(false);
  });

  it('false when another tracked location remains', () => {
    expect(
      wouldRemoveLastTrackedLocation({
        targetLocationId: 'a',
        targetInventoryTracking: true,
        allActiveLocations: [loc('a', true), loc('b', true)],
        tenantHasInventoryRows: true,
      }),
    ).toBe(false);
  });

  it('true when last tracked would be removed and tenant has inventory', () => {
    expect(
      wouldRemoveLastTrackedLocation({
        targetLocationId: 'a',
        targetInventoryTracking: true,
        allActiveLocations: [loc('a', true)],
        tenantHasInventoryRows: true,
      }),
    ).toBe(true);
  });
});

describe('normalizeLocationAddress', () => {
  it('maps street to line1', () => {
    expect(normalizeLocationAddress({ street: 'Old St', city: 'Pune' })).toEqual({
      line1: 'Old St',
      line2: '',
      city: 'Pune',
      state: '',
      pincode: '',
    });
  });

  it('prefers line1 over street', () => {
    expect(normalizeLocationAddress({ line1: 'L1', street: 'S1' }).line1).toBe('L1');
  });
});
