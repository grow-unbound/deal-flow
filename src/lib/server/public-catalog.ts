import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import type { StorefrontTenantRecord } from '@/lib/server/resolve-storefront-tenant';

export type CatalogPricingMode = 'hidden_until_login' | 'base_selling_rate' | 'assigned_price_list';

export interface PublicCatalogRecord {
  id: string;
  tenantId: string;
  includeAll: boolean;
  pricingMode: CatalogPricingMode | null;
  priceListId: string | null;
  liveAt: string | null;
}

export interface GuestPricingContext {
  mode: CatalogPricingMode;
  priceListId: string | null;
  excludedProductIds: string[];
}

/** Columns any public/guest product hydrate may select. Never include cost_price. */
export const TENANT_PRODUCT_PUBLIC_SELECT =
  'id, internal_sku, name_override, tenant_brand_id, tenant_category_id, master_product_id, mrp, base_selling_price, gst_rate, default_uom, pack_size, image_urls, r2_small_key, r2_medium_key, r2_large_key';

export function isStorefrontGuestRequest(request: NextRequest): boolean {
  return request.headers.get('x-verified-storefront-live') === '1'
    && Boolean(request.headers.get('x-verified-tenant-id'))
    && !request.headers.get('x-verified-buyer-id');
}

export async function loadLivePublicCatalog(
  db: SupabaseClient,
  tenantId: string,
): Promise<PublicCatalogRecord | null> {
  const { data, error } = await db
    .schema('app')
    .from('catalogs')
    .select('id, tenant_id, include_all, pricing_mode, price_list_id, live_at')
    .eq('tenant_id', tenantId)
    .eq('kind', 'public')
    .is('deleted_at', null)
    .not('live_at', 'is', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id || !data.live_at) return null;

  return {
    id: data.id as string,
    tenantId: data.tenant_id as string,
    includeAll: data.include_all !== false,
    pricingMode: (data.pricing_mode as CatalogPricingMode | null) ?? null,
    priceListId: (data.price_list_id as string | null) ?? null,
    liveAt: data.live_at as string,
  };
}

export async function loadCatalogExclusionIds(
  db: SupabaseClient,
  catalogId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema('app')
    .from('catalog_exclusions')
    .select('tenant_product_id')
    .eq('catalog_id', catalogId)
    .is('deleted_at', null)
    .limit(10_000);

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ tenant_product_id: string }>).map((row) => row.tenant_product_id);
}

export async function resolveGuestPricingContext(
  db: SupabaseClient,
  tenantId: string,
): Promise<GuestPricingContext | null> {
  const catalog = await loadLivePublicCatalog(db, tenantId);
  if (!catalog?.pricingMode) return null;

  const excludedProductIds = catalog.includeAll
    ? await loadCatalogExclusionIds(db, catalog.id)
    : await loadCatalogExclusionIds(db, catalog.id);

  return {
    mode: catalog.pricingMode,
    priceListId: catalog.priceListId,
    excludedProductIds,
  };
}

/**
 * Cached wrapper around resolveGuestPricingContext — catalog pricing mode/
 * price-list assignment/exclusions have zero per-visitor variance (tenant+
 * catalog-config scoped, never per-buyer) and rarely change, so this is safe
 * to cache across requests. Uses supabaseAdmin directly (not the caller's db)
 * so the cache key stays serializable — mirrors seller-dashboard.ts's pattern.
 * Invalidated via revalidatePublicCatalogCache() on catalog/price-list writes.
 */
export function getCachedGuestPricingContext(tenantId: string): Promise<GuestPricingContext | null> {
  return unstable_cache(
    async () => {
      if (!supabaseAdmin) return null;
      return resolveGuestPricingContext(supabaseAdmin as unknown as SupabaseClient, tenantId);
    },
    ['guest-pricing-context', tenantId],
    { revalidate: 120, tags: [`public-catalog:${tenantId}`] },
  )();
}

export async function loadAssignedPriceListPrices(
  db: SupabaseClient,
  params: { tenantId: string; priceListId: string; productIds: string[] },
): Promise<Map<string, number>> {
  const { tenantId, priceListId, productIds } = params;
  const out = new Map<string, number>();
  if (productIds.length === 0) return out;

  const { data: owned, error: ownedError } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', priceListId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (ownedError) throw new Error(ownedError.message);
  if (!owned) return out;

  const { data, error } = await db
    .schema('app')
    .from('price_list_items')
    .select('tenant_product_id, price')
    .eq('price_list_id', priceListId)
    .in('tenant_product_id', productIds)
    .is('deleted_at', null)
    .limit(productIds.length);

  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ tenant_product_id: string; price: number | null }>) {
    if (row.price == null) continue;
    out.set(row.tenant_product_id, Number(row.price));
  }
  return out;
}

export function guestUnitPrice(params: {
  mode: CatalogPricingMode;
  assignedPrice: number | null | undefined;
  baseSellingPrice: number | null | undefined;
}): number | null {
  if (params.mode === 'hidden_until_login') return null;
  if (params.mode === 'assigned_price_list') {
    return params.assignedPrice != null ? Number(params.assignedPrice) : null;
  }
  return params.baseSellingPrice != null ? Number(params.baseSellingPrice) : null;
}

export function publicCatalogLiveFromRecord(record: StorefrontTenantRecord | null): boolean {
  return Boolean(record?.liveAt);
}
