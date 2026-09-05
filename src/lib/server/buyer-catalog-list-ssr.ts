import { supabaseAdmin } from '@/lib/supabase';
import { getBuyerServerClaims } from '@/lib/server/buyer-server-claims';
import { getSelectedBuyerDeliveryFromCookies } from '@/lib/server/buyer-location-selection';
import { getBuyerServerProductScope } from '@/lib/server/buyer-server-product-scope';
import {
  fetchBuyerCatalogPage,
  fetchCachedBuyerBrands,
  fetchCachedBuyerCategories,
  resolveBuyerCatalogSummaries,
  resolveBuyerInventoryWarehouseIdFromCookies,
} from '@/lib/server/buyer-product-data';
import type { BuyerBrand, BuyerCatalogResponse, BuyerCategory } from '@/types/buyer';

const PAGE_SIZE = 40;

export type CatalogFilteredMode = 'category' | 'brand' | 'list';

export type InitialCatalogFilteredData = {
  catalogPage: BuyerCatalogResponse | null;
  brands: BuyerBrand[] | null;
  categories: BuyerCategory[] | null;
};

const EMPTY_RESULT: InitialCatalogFilteredData = { catalogPage: null, brands: null, categories: null };

/**
 * SSR-seeds the first page of the product grid for an authenticated buyer's
 * category/brand/list page — mirrors app/(buyer)/buy/home/page.tsx's own
 * loadInitialCatalogData() pattern for its promotions/reco/brands/categories,
 * extended to the actual product listing (the expensive part the home page
 * doesn't need since it shows curated rows, not a full filtered grid).
 *
 * Returns null whenever anything needed isn't cleanly resolvable (guest, no
 * delivery cookie yet, warehouse unresolvable, or any fetch failure) — the
 * caller passes that straight through as `initialCatalogPage`, and
 * useBuyerCatalogList behaves exactly as it does today (client fetch after
 * mount). This must never throw and must never block the page render.
 */
export async function loadInitialCatalogListData(
  mode: CatalogFilteredMode,
  id: string,
): Promise<InitialCatalogFilteredData> {
  if (!supabaseAdmin) return EMPTY_RESULT;
  try {
    const claims = await getBuyerServerClaims();
    if (!claims.tenant_id || !claims.buyer_id) return EMPTY_RESULT;
    const db = supabaseAdmin;
    const tenantId = claims.tenant_id;
    const buyerId = claims.buyer_id;

    const [scope, selectedDelivery] = await Promise.all([
      getBuyerServerProductScope(db, tenantId, buyerId),
      getSelectedBuyerDeliveryFromCookies(),
    ]);
    if (!scope) return EMPTY_RESULT;

    const [inventoryWarehouseId, campaignSummary, brands, categories] = await Promise.all([
      resolveBuyerInventoryWarehouseIdFromCookies(db, tenantId, selectedDelivery),
      mode === 'list'
        ? resolveBuyerCatalogSummaries(db, tenantId, buyerId)
        : Promise.resolve({ visibleCampaigns: [], catalogs: [] }),
      fetchCachedBuyerBrands(tenantId, scope.allowedTenantBrandIds).catch((error) => {
        console.error('[loadInitialCatalogListData] brands preload failed, falling back to client fetch', error);
        return null;
      }),
      fetchCachedBuyerCategories(tenantId, scope.allowedTenantBrandIds).catch((error) => {
        console.error('[loadInitialCatalogListData] categories preload failed, falling back to client fetch', error);
        return null;
      }),
    ]);

    const catalogPage = await fetchBuyerCatalogPage({
      db,
      tenantId,
      buyerId,
      allowedTenantBrandIds: scope.allowedTenantBrandIds,
      inventoryWarehouseId,
      visibleCampaigns: campaignSummary.visibleCampaigns,
      search: '',
      categoryId: mode === 'category' ? id : '',
      brandId: mode === 'brand' ? id : '',
      tenantProductId: '',
      requestedCampaignId: mode === 'list' ? id : '',
      limit: PAGE_SIZE,
      offset: 0,
      guestPricing: null,
    });

    return { catalogPage, brands, categories };
  } catch (error) {
    console.error('[loadInitialCatalogListData] SSR preload failed, falling back to client fetch', error);
    return EMPTY_RESULT;
  }
}
