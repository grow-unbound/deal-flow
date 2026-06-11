import type { LocationType } from '@/types/tenant-locations';

export interface LocationRowLike {
  id: string;
  inventory_tracking: boolean;
  deleted_at: string | null;
}

export interface InventoryAtLocation {
  qty_available: number;
  qty_reserved: number;
}

/** Block deactivate when this location still holds or reserves stock. */
export function hasBlockingStockAtLocation(inv: InventoryAtLocation | null | undefined): boolean {
  if (!inv) return false;
  const a = Number(inv.qty_available);
  const r = Number(inv.qty_reserved);
  return a > 0 || r > 0;
}

/**
 * Block soft-delete when this would remove the last active inventory-tracking location
 * while the tenant still has inventory rows (any location).
 */
export function wouldRemoveLastTrackedLocation(args: {
  targetLocationId: string;
  targetInventoryTracking: boolean;
  allActiveLocations: LocationRowLike[];
  tenantHasInventoryRows: boolean;
}): boolean {
  if (!args.targetInventoryTracking) return false;
  if (!args.tenantHasInventoryRows) return false;

  const otherTracked = args.allActiveLocations.filter(
    (l) => l.id !== args.targetLocationId && !l.deleted_at && l.inventory_tracking,
  );
  return otherTracked.length === 0;
}

export function normalizeLocationAddress(raw: unknown): {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { line1: '', line2: '', city: '', state: '', pincode: '' };
  }
  const o = raw as Record<string, unknown>;
  const street = typeof o.street === 'string' ? o.street : '';
  const line1 = typeof o.line1 === 'string' ? o.line1 : street;
  return {
    line1,
    line2: typeof o.line2 === 'string' ? o.line2 : '',
    city: typeof o.city === 'string' ? o.city : '',
    state: typeof o.state === 'string' ? o.state : '',
    pincode: typeof o.pincode === 'string' ? o.pincode : '',
  };
}

export function locationTypeLabel(type: LocationType): string {
  switch (type) {
    case 'warehouse':
      return 'Warehouse';
    case 'dispatch_point':
      return 'Dispatch Point';
    case 'branch':
      return 'Branch';
    default:
      return type;
  }
}
