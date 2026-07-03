import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { assembleBuyerCatalogItemsForProductIds } from '@/lib/server/buyer-assemble-catalog-items';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile, type BuyerVisibleCatalog } from '@/lib/server/buyer-access';
import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';
import { getSelectedBuyerDeliveryFromRequest } from '@/lib/server/buyer-location-selection';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import type { BuyerCatalogResponse, BuyerCatalogSummary } from '@/types/buyer';

const PAGE_LIMIT = 40;

async function resolveMasterProductIdsForCategory(categoryId: string): Promise<string[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('products')
    .select('id')
    .eq('category_id', categoryId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function resolveTenantBrandIdsForMasterBrand(tenantId: string, masterBrandId: string): Promise<string[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('tenant_brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('master_brand_id', masterBrandId)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function getCampaignCounts(campaignIds: string[]) {
  if (!supabaseAdmin || campaignIds.length === 0) return new Map<string, number>();

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('campaign_items')
    .select('campaign_id')
    .in('campaign_id', campaignIds)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ campaign_id: string }>) {
    counts.set(row.campaign_id, (counts.get(row.campaign_id) ?? 0) + 1);
  }
  return counts;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryId = searchParams.get('category_id')?.trim() ?? '';
    const brandId = searchParams.get('brand_id')?.trim() ?? '';
    const tenantProductId = searchParams.get('tenant_product_id')?.trim() ?? '';
    const requestedCampaignId = searchParams.get('campaign_id')?.trim() ?? '';
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? PAGE_LIMIT)), 100);
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

    const tenantId = profile.context.tenant_id;
    const buyerId = profile.buyer?.id ?? null;
    // Prefer buyer's stored geography over session-selected delivery location
    let inventoryWarehouseId: string | null = null;
    if (profile.buyer?.geography) {
      const { data: defaultWarehouse } = await supabaseAdmin
        .schema('app')
        .from('warehouses')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      inventoryWarehouseId = (defaultWarehouse as { id: string } | null)?.id ?? null;
    } else {
      const selectedDelivery = getSelectedBuyerDeliveryFromRequest(req);
      const resolvedRouting = await resolveNearestBuyerLocation(supabaseAdmin as any, tenantId, selectedDelivery);
      inventoryWarehouseId = resolvedRouting?.warehouseId ?? null;
    }

    let visibleCampaigns: BuyerVisibleCatalog[] = [];
    if (profile.buyer) {
      visibleCampaigns = await getVisibleBuyerCatalogs(tenantId, profile.buyer.id);
    } else {
      const { data, error } = await supabaseAdmin
        .schema('app')
        .from('campaigns')
        .select('id, tenant_id, name, share_token, valid_to, created_at, scope_type, scope_value, hero_image_url')
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      visibleCampaigns = (data ?? []) as BuyerVisibleCatalog[];
    }

    const campaignCounts = await getCampaignCounts(visibleCampaigns.map((campaign) => campaign.id));
    const catalogs: BuyerCatalogSummary[] = visibleCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      product_count: campaignCounts.get(campaign.id) ?? 0,
      share_token: campaign.share_token,
      valid_until: campaign.valid_to,
      hero_image_url: campaign.hero_image_url ?? null,
    }));

    const allowedTenantBrandIds =
      buyerId && profile.buyer
        ? await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId)
        : null;

    if (requestedCampaignId) {
      const selectedCampaign = visibleCampaigns.find((campaign) => campaign.id === requestedCampaignId) ?? null;
      if (!selectedCampaign) {
        return NextResponse.json({ items: [], total: 0, has_more: false, catalogs }, { headers: BUYER_CACHE_CATALOG });
      }

      const { data: campaignItems, error: campaignItemsError } = await supabaseAdmin
        .schema('app')
        .from('campaign_items')
        .select('tenant_product_id, price_override')
        .eq('campaign_id', selectedCampaign.id)
        .is('deleted_at', null);
      if (campaignItemsError) throw new Error(campaignItemsError.message);

      let productIds = ((campaignItems ?? []) as Array<{ tenant_product_id: string }>).map((row) => row.tenant_product_id);

      // Push category/brand filters into a tenant_products lookup before hydration —
      // avoids assembling (image/price joins) items outside the requested filter.
      if ((categoryId || brandId) && productIds.length > 0) {
        let filterQuery = supabaseAdmin
          .schema('app')
          .from('tenant_products')
          .select('id, tenant_brand_id, master_product_id')
          .in('id', productIds);

        if (categoryId) {
          const matchingMasterProductIds = await resolveMasterProductIdsForCategory(categoryId);
          if (matchingMasterProductIds.length === 0) {
            return NextResponse.json({ items: [], total: 0, has_more: false, catalogs }, { headers: BUYER_CACHE_CATALOG });
          }
          filterQuery = filterQuery.in('master_product_id', matchingMasterProductIds);
        }
        if (brandId) {
          const matchingTenantBrandIds = await resolveTenantBrandIdsForMasterBrand(tenantId, brandId);
          if (matchingTenantBrandIds.length === 0) {
            return NextResponse.json({ items: [], total: 0, has_more: false, catalogs }, { headers: BUYER_CACHE_CATALOG });
          }
          filterQuery = filterQuery.in('tenant_brand_id', matchingTenantBrandIds);
        }

        const { data: filteredProducts, error: filterError } = await filterQuery;
        if (filterError) throw new Error(filterError.message);
        productIds = ((filteredProducts ?? []) as Array<{ id: string }>).map((row) => row.id);
      }
      if (tenantProductId) productIds = productIds.filter((id) => id === tenantProductId);

      const itemMap = await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
        buyerId,
        productIds,
        allowedTenantBrandIds,
        campaignId: selectedCampaign.id,
        campaignName: selectedCampaign.name,
        campaignValidUntil: selectedCampaign.valid_to,
        priceOverrides: new Map(
          ((campaignItems ?? []) as Array<{ tenant_product_id: string; price_override: number | null }>).map((row) => [row.tenant_product_id, row.price_override]),
        ),
        inventoryWarehouseId,
      });

      let items = Array.from(itemMap.values());
      if (search) items = items.filter((item) => item.display_name.toLowerCase().includes(search) || item.internal_sku.toLowerCase().includes(search) || (item.brand_name?.toLowerCase().includes(search) ?? false));

      const total = items.length;
      const pageItems = items.slice(offset, offset + limit);
      return NextResponse.json({
        items: pageItems,
        total,
        has_more: offset + limit < total,
        catalogs,
        selected_campaign_id: selectedCampaign.id,
        selected_campaign_name: selectedCampaign.name,
        selected_campaign_valid_until: selectedCampaign.valid_to,
      } satisfies BuyerCatalogResponse, { headers: BUYER_CACHE_CATALOG });
    }

    let productsQuery = supabaseAdmin
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, master_product_id, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    // Resolve tenant_brand_ids for the requested master brand_id (if any) and intersect
    // with the buyer's allowed-brand visibility set, so a single .in() covers both.
    let effectiveTenantBrandIds: string[] | null = Array.isArray(allowedTenantBrandIds) ? allowedTenantBrandIds : null;
    if (brandId) {
      const matchingTenantBrandIds = await resolveTenantBrandIdsForMasterBrand(tenantId, brandId);
      effectiveTenantBrandIds = effectiveTenantBrandIds
        ? effectiveTenantBrandIds.filter((id) => matchingTenantBrandIds.includes(id))
        : matchingTenantBrandIds;
    }
    if (effectiveTenantBrandIds) {
      if (effectiveTenantBrandIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, has_more: false, catalogs } satisfies BuyerCatalogResponse, { headers: BUYER_CACHE_CATALOG });
      }
      productsQuery = productsQuery.in('tenant_brand_id', effectiveTenantBrandIds);
    }

    if (categoryId) {
      const matchingMasterProductIds = await resolveMasterProductIdsForCategory(categoryId);
      if (matchingMasterProductIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, has_more: false, catalogs } satisfies BuyerCatalogResponse, { headers: BUYER_CACHE_CATALOG });
      }
      productsQuery = productsQuery.in('master_product_id', matchingMasterProductIds);
    }
    if (tenantProductId) productsQuery = productsQuery.eq('id', tenantProductId);

    const { data: tenantProducts, error: productsError } = await productsQuery;
    if (productsError) throw new Error(productsError.message);

    const productIds = ((tenantProducts ?? []) as Array<{ id: string }>).map((row) => row.id);
    const itemMap = await assembleBuyerCatalogItemsForProductIds(supabaseAdmin as any, {
      buyerId,
      productIds,
      allowedTenantBrandIds,
      campaignId: null,
      campaignName: null,
      campaignValidUntil: null,
      priceOverrides: new Map(),
      inventoryWarehouseId,
    });

    let items = Array.from(itemMap.values());
    if (search) items = items.filter((item) => item.display_name.toLowerCase().includes(search) || item.internal_sku.toLowerCase().includes(search) || (item.brand_name?.toLowerCase().includes(search) ?? false) || (item.category_name?.toLowerCase().includes(search) ?? false));

    const total = items.length;
    const pageItems = items.slice(offset, offset + limit);
    return NextResponse.json({
      items: pageItems,
      total,
      has_more: offset + limit < total,
      catalogs,
      selected_campaign_id: null,
      selected_campaign_name: null,
      selected_campaign_valid_until: null,
    } satisfies BuyerCatalogResponse, { headers: BUYER_CACHE_CATALOG });
  } catch (error) {
    console.error('[GET /api/buyer/catalog]', error);
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  }
}
