import { getSelectedBuyerDeliveryFromCookies } from '@/lib/server/buyer-location-selection';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BuyerServerProductScope {
  tenantId: string;
  buyerId: string;
  allowedTenantBrandIds: string[] | null;
  /** Same shape useBuyerBrands/useBuyerCategories hash into their query key client-side. */
  stockSignature: string;
}

function stockSignature(selected: {
  nearest_warehouse_id?: string | null;
  routed_location_id?: string | null;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
} | null): string {
  if (!selected) return 'no-delivery';
  return [
    selected.nearest_warehouse_id ?? 'no-warehouse',
    selected.routed_location_id ?? 'no-location',
    selected.place_id,
    selected.lat,
    selected.lng,
  ].join(':');
}

/**
 * Cookie-based scope resolver for Server Components (page.tsx doesn't have
 * a NextRequest, only next/headers cookies()). fetchBuyerBrands/
 * fetchBuyerCategories don't actually need a warehouse id, only
 * allowedTenantBrandIds -- the stockSignature is computed purely so the
 * SSR'd initialData can be seeded under the exact React Query key the
 * client hook (useBuyerBrands/useBuyerCategories) will use on mount, since
 * that key includes a hash of the buyer's delivery selection.
 *
 * Returns null when there's no delivery selection cookie yet -- callers
 * should skip SSR and let the client fetch, same as loadInitialPromotions.
 */
export async function getBuyerServerProductScope(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string,
): Promise<BuyerServerProductScope | null> {
  const selectedDelivery = await getSelectedBuyerDeliveryFromCookies();
  if (!selectedDelivery) return null;

  const allowedTenantBrandIds = await resolveBuyerAllowedTenantBrandIds(db, tenantId, buyerId);

  return {
    tenantId,
    buyerId,
    allowedTenantBrandIds,
    stockSignature: stockSignature(selectedDelivery),
  };
}
