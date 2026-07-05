import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuyerCatalogItem } from '@/types/buyer';
import { enrichBuyerProducts } from '@/lib/server/buyer-product-data';

/**
 * Builds `BuyerCatalogItem` rows for arbitrary tenant product IDs (e.g. reorder from past orders).
 * Catalog fields are optional when the SKU is not on a published list.
 */
export async function assembleBuyerCatalogItemsForProductIds(
  db: SupabaseClient,
  params: {
    tenantId?: string | null;
    buyerId: string | null;
    productIds: string[];
    allowedTenantBrandIds?: string[] | null;
    campaignId: string | null;
    campaignName: string | null;
    campaignValidUntil: string | null;
    priceOverrides: Map<string, number | null>;
    inventoryWarehouseId?: string | null;
  },
): Promise<Map<string, BuyerCatalogItem>> {
  const {
    tenantId = null,
    buyerId,
    productIds,
    allowedTenantBrandIds,
    campaignId,
    campaignName,
    campaignValidUntil,
    priceOverrides,
    inventoryWarehouseId = null,
  } = params;
  if (productIds.length === 0) return new Map<string, BuyerCatalogItem>();

  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const { data: productTenantRows, error } = await db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_id')
      .in('id', productIds)
      .limit(1);
    if (error) throw new Error(error.message);
    resolvedTenantId = ((productTenantRows ?? [])[0] as { tenant_id?: string } | undefined)?.tenant_id ?? null;
  }

  if (!resolvedTenantId) {
    return new Map<string, BuyerCatalogItem>();
  }

  return enrichBuyerProducts(db, {
    tenantId: resolvedTenantId,
    buyerId,
    tenantProductIds: productIds,
    allowedTenantBrandIds,
    inventoryWarehouseId,
    campaignByProductId: new Map(
      productIds.map((productId) => [productId, {
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_valid_until: campaignValidUntil,
        campaign_price: priceOverrides.get(productId) ?? null,
      }]),
    ),
  });
}
