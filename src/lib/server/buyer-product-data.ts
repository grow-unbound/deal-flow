import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuyerAccessProfile, BuyerVisibleCatalog } from '@/lib/server/buyer-access';
import { getVisibleBuyerCatalogs } from '@/lib/server/buyer-access';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { getSelectedBuyerDeliveryFromRequest } from '@/lib/server/buyer-location-selection';
import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';
import { searchScopedProducts } from '@/lib/server/scoped-product-search';
import { r2Url } from '@/lib/r2-url';
import type {
  BuyerBrand,
  BuyerCatalogItem,
  BuyerCatalogResponse,
  BuyerCatalogSummary,
  BuyerCategory,
} from '@/types/buyer';

type CampaignItemRow = {
  tenant_product_id: string;
  price_override: number | null;
  display_order: number | null;
  is_featured?: boolean | null;
};

type TenantProductRow = {
  id: string;
  internal_sku: string | null;
  name_override: string | null;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  master_product_id: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  gst_rate: number | null;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[] | null;
  is_active?: boolean | null;
};

type TenantBrandRow = {
  id: string;
  display_name_override: string | null;
  master_brand_id: string | null;
  logo_url: string | null;
};

type MasterBrandRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

type MasterProductRow = {
  id: string;
  name: string;
  image_urls: string[] | null;
  gst_rate: number | null;
  category_id: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug?: string | null;
  image_url: string | null;
};

type TenantCategoryRow = {
  id: string;
  name: string;
  slug: string | null;
  r2_image_thumb_key: string | null;
  r2_image_medium_key: string | null;
};

type InventoryRow = {
  tenant_product_id: string;
  qty_available: number | null;
};

type PriceRow = {
  tenant_product_id: string;
  unit_price: number | null;
};

type BuyerFacetRpcRow = {
  facet_type: 'brand' | 'category';
  facet_id: string;
  facet_label: string;
  facet_slug: string | null;
  image_url: string | null;
  image_thumb_key: string | null;
  image_medium_key: string | null;
  product_count: number;
};

type CampaignCountRow = {
  id: string;
  campaign_items: Array<{ count: number }> | null;
};

const BUYER_CATALOG_SUMMARY_LIMIT = 100;

export type BuyerProductEnrichmentParams = {
  tenantId: string;
  buyerId: string | null;
  tenantProductIds: string[];
  allowedTenantBrandIds?: string[] | null;
  inventoryWarehouseId?: string | null;
  campaignByProductId?: Map<string, {
    campaign_id: string | null;
    campaign_name: string | null;
    campaign_valid_until: string | null;
    campaign_price: number | null;
    is_featured?: boolean;
  }>;
  qtyByProductId?: Map<string, number>;
};

type CatalogPageParams = {
  db: SupabaseClient;
  tenantId: string;
  buyerId: string | null;
  allowedTenantBrandIds?: string[] | null;
  inventoryWarehouseId?: string | null;
  visibleCampaigns: BuyerVisibleCatalog[];
  search?: string;
  categoryId?: string;
  brandId?: string;
  tenantProductId?: string;
  requestedCampaignId?: string;
  limit: number;
  offset: number;
};

type CatalogScopeResult = {
  orderedProductIds: string[];
  total: number;
  selectedCampaign: BuyerVisibleCatalog | null;
  campaignByProductId: Map<string, {
    campaign_id: string | null;
    campaign_name: string | null;
    campaign_valid_until: string | null;
    campaign_price: number | null;
    is_featured?: boolean;
  }>;
};

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function resolveVisibleCampaignMap(
  db: SupabaseClient,
  params: {
    tenantId: string;
    buyerId: string | null;
    productIds: string[];
    visibleCampaigns?: BuyerVisibleCatalog[];
  },
): Promise<Map<string, {
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_valid_until: string | null;
  campaign_price: number | null;
  is_featured?: boolean;
}>> {
  const { tenantId, buyerId, productIds } = params;
  if (!buyerId || productIds.length === 0) return new Map();

  const visibleCampaigns = params.visibleCampaigns ?? await getVisibleBuyerCatalogs(tenantId, buyerId);
  if (visibleCampaigns.length === 0) return new Map();

  const visibleCampaignIds = visibleCampaigns.map((campaign) => campaign.id);
  const campaignPriority = new Map(visibleCampaignIds.map((id, index) => [id, index]));

  const { data, error } = await db
    .schema('app')
    .from('campaign_items')
    .select('campaign_id, tenant_product_id, price_override, display_order, is_featured')
    .in('campaign_id', visibleCampaignIds)
    .in('tenant_product_id', productIds)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const campaignsById = new Map(visibleCampaigns.map((campaign) => [campaign.id, campaign]));
  const rows = (data ?? []) as Array<CampaignItemRow & { campaign_id: string }>;
  rows.sort((a, b) => {
    const aHasOverride = a.price_override != null ? 0 : 1;
    const bHasOverride = b.price_override != null ? 0 : 1;
    if (aHasOverride !== bHasOverride) return aHasOverride - bHasOverride;

    const campaignRank = (campaignPriority.get(a.campaign_id) ?? Number.MAX_SAFE_INTEGER)
      - (campaignPriority.get(b.campaign_id) ?? Number.MAX_SAFE_INTEGER);
    if (campaignRank !== 0) return campaignRank;
    return (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER);
  });

  const campaignByProductId = new Map<string, {
    campaign_id: string | null;
    campaign_name: string | null;
    campaign_valid_until: string | null;
    campaign_price: number | null;
    is_featured?: boolean;
  }>();

  for (const row of rows) {
    if (campaignByProductId.has(row.tenant_product_id)) continue;
    const campaign = campaignsById.get(row.campaign_id);
    if (!campaign) continue;
    campaignByProductId.set(row.tenant_product_id, {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      campaign_valid_until: campaign.valid_to,
      campaign_price: row.price_override,
      is_featured: Boolean(row.is_featured),
    });
  }

  return campaignByProductId;
}

function tenantCategoryImageUrl(
  thumbKey: string | null | undefined,
  mediumKey?: string | null,
): string | null {
  return r2Url(thumbKey ?? mediumKey);
}

async function resolveTenantBrandIdsForMasterBrand(
  db: SupabaseClient,
  tenantId: string,
  masterBrandId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('master_brand_id', masterBrandId)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function resolveTenantBrandIdsForBuyerBrand(
  db: SupabaseClient,
  tenantId: string,
  brandId: string,
): Promise<string[]> {
  const { data: tenantBrandById, error: tenantBrandByIdError } = await db
    .schema('app')
    .from('tenant_brands')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tenantBrandByIdError) throw new Error(tenantBrandByIdError.message);
  if (tenantBrandById) return [(tenantBrandById as { id: string }).id];

  return resolveTenantBrandIdsForMasterBrand(db, tenantId, brandId);
}

export async function resolveBuyerInventoryWarehouseId(
  db: SupabaseClient,
  request: NextRequest,
  profile: BuyerAccessProfile,
): Promise<string | null> {
  const tenantId = profile.context.tenant_id;
  if (!tenantId) return null;

  const selectedDelivery = getSelectedBuyerDeliveryFromRequest(request);
  if (selectedDelivery?.nearest_warehouse_id) {
    return selectedDelivery.nearest_warehouse_id;
  }

  const resolvedRouting = await resolveNearestBuyerLocation(db as any, tenantId, selectedDelivery);
  if (resolvedRouting?.warehouseId) return resolvedRouting.warehouseId;

  if (profile.buyer?.geography) {
    const { data: defaultWarehouse, error } = await db
      .schema('app')
      .from('warehouses')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (defaultWarehouse as { id: string } | null)?.id ?? null;
  }

  return null;
}

export async function resolveBuyerCatalogSummaries(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string | null,
): Promise<{ visibleCampaigns: BuyerVisibleCatalog[]; catalogs: BuyerCatalogSummary[] }> {
  let visibleCampaigns: BuyerVisibleCatalog[] = [];
  if (buyerId) {
    visibleCampaigns = (await getVisibleBuyerCatalogs(tenantId, buyerId)).slice(0, BUYER_CATALOG_SUMMARY_LIMIT);
  } else {
    const { data, error } = await db
      .schema('app')
      .from('campaigns')
      .select('id, tenant_id, name, share_token, valid_to, created_at, scope_type, scope_value, hero_image_url')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .is('deleted_at', null)
      .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(BUYER_CATALOG_SUMMARY_LIMIT);
    if (error) throw new Error(error.message);
    visibleCampaigns = (data ?? []) as BuyerVisibleCatalog[];
  }

  const campaignIds = visibleCampaigns.map((campaign) => campaign.id);
  const counts = new Map<string, number>();
  if (campaignIds.length > 0) {
    const { data, error } = await db
      .schema('app')
      .from('campaigns')
      .select('id, campaign_items(count)')
      .eq('tenant_id', tenantId)
      .in('id', campaignIds)
      .is('deleted_at', null)
      .is('campaign_items.deleted_at', null)
      .limit(BUYER_CATALOG_SUMMARY_LIMIT);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as CampaignCountRow[]) {
      counts.set(row.id, Number(row.campaign_items?.[0]?.count ?? 0));
    }
  }

  const catalogs = visibleCampaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    product_count: counts.get(campaign.id) ?? 0,
    share_token: campaign.share_token,
    valid_until: campaign.valid_to,
    hero_image_url: campaign.hero_image_url ?? null,
  }));

  return { visibleCampaigns, catalogs };
}

export async function enrichBuyerProducts(
  db: SupabaseClient,
  params: BuyerProductEnrichmentParams,
): Promise<Map<string, BuyerCatalogItem>> {
  const {
    tenantId,
    buyerId,
    tenantProductIds,
    allowedTenantBrandIds = null,
    inventoryWarehouseId = null,
    campaignByProductId = new Map(),
    qtyByProductId = new Map(),
  } = params;

  const orderedIds = tenantProductIds.filter(Boolean);
  if (orderedIds.length === 0) return new Map();

  let tenantProductsQuery = db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, tenant_brand_id, tenant_category_id, master_product_id, mrp, base_selling_price, gst_rate, default_uom, pack_size, image_urls')
    .eq('tenant_id', tenantId)
    .in('id', orderedIds)
    .is('deleted_at', null)
    .eq('is_active', true);

  if (Array.isArray(allowedTenantBrandIds)) {
    if (allowedTenantBrandIds.length === 0) return new Map();
    tenantProductsQuery = tenantProductsQuery.in('tenant_brand_id', allowedTenantBrandIds);
  }

  const { data: tenantProductsData, error: tenantProductsError } = await tenantProductsQuery;
  if (tenantProductsError) throw new Error(tenantProductsError.message);

  const tenantProducts = (tenantProductsData ?? []) as TenantProductRow[];
  if (tenantProducts.length === 0) return new Map();

  const productIds = tenantProducts.map((product) => product.id);
  const tenantBrandIds = uniq(
    tenantProducts.map((product) => product.tenant_brand_id).filter((value): value is string => Boolean(value)),
  );
  const tenantCategoryIds = uniq(
    tenantProducts.map((product) => product.tenant_category_id).filter((value): value is string => Boolean(value)),
  );
  const masterProductIds = uniq(
    tenantProducts.map((product) => product.master_product_id).filter((value): value is string => Boolean(value)),
  );

  const [tenantBrandsRes, tenantCategoriesRes, masterProductsRes, inventoryRes] = await Promise.all([
    tenantBrandIds.length > 0
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, master_brand_id, logo_url')
          .in('id', tenantBrandIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    tenantCategoryIds.length > 0
      ? db
          .schema('app')
          .from('tenant_categories')
          .select('id, name, slug, r2_image_thumb_key, r2_image_medium_key')
          .in('id', tenantCategoryIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    masterProductIds.length > 0
      ? db
          .schema('catalog')
          .from('products')
          .select('id, name, image_urls, gst_rate, category_id')
          .in('id', masterProductIds)
      : Promise.resolve({ data: [], error: null }),
    (() => {
      let inventoryQuery = db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available')
        .in('tenant_product_id', productIds)
        .is('deleted_at', null);
      if (inventoryWarehouseId) {
        inventoryQuery = inventoryQuery.eq('warehouse_id', inventoryWarehouseId);
      }
      return inventoryQuery;
    })(),
  ]);

  const secondError = tenantBrandsRes.error ?? tenantCategoriesRes.error ?? masterProductsRes.error ?? inventoryRes.error;
  if (secondError) throw new Error(secondError.message);

  const tenantBrands = (tenantBrandsRes.data ?? []) as TenantBrandRow[];
  const tenantCategories = (tenantCategoriesRes.data ?? []) as TenantCategoryRow[];
  const masterProducts = (masterProductsRes.data ?? []) as MasterProductRow[];
  const inventoryRows = (inventoryRes.data ?? []) as InventoryRow[];

  const masterBrandIds = uniq(
    tenantBrands.map((brand) => brand.master_brand_id).filter((value): value is string => Boolean(value)),
  );
  const categoryIds = uniq(
    masterProducts.map((product) => product.category_id).filter((value): value is string => Boolean(value)),
  );

  const [masterBrandsRes, categoriesRes] = await Promise.all([
    masterBrandIds.length > 0
      ? db
          .schema('catalog')
          .from('brands')
          .select('id, name, logo_url')
          .in('id', masterBrandIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length > 0
      ? db
          .schema('catalog')
          .from('categories')
          .select('id, name, slug, image_url')
          .in('id', categoryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const thirdError = masterBrandsRes.error ?? categoriesRes.error;
  if (thirdError) throw new Error(thirdError.message);

  const tenantBrandMap = new Map(tenantBrands.map((brand) => [brand.id, brand]));
  const tenantCategoryMap = new Map(tenantCategories.map((category) => [category.id, category]));
  const masterProductMap = new Map(masterProducts.map((product) => [product.id, product]));
  const masterBrandMap = new Map(
    ((masterBrandsRes.data ?? []) as MasterBrandRow[]).map((brand) => [brand.id, brand]),
  );
  const categoryMap = new Map(
    ((categoriesRes.data ?? []) as CategoryRow[]).map((category) => [category.id, category]),
  );

  const inventoryMap = new Map<string, number>();
  for (const row of inventoryRows) {
    inventoryMap.set(
      row.tenant_product_id,
      (inventoryMap.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
    );
  }

  const priceMap = new Map<string, number>();
  if (buyerId && productIds.length > 0) {
    const grouped = new Map<number, string[]>();
    for (const productId of productIds) {
      const qty = Math.max(1, Number(qtyByProductId.get(productId) ?? 1));
      const bucket = grouped.get(qty) ?? [];
      bucket.push(productId);
      grouped.set(qty, bucket);
    }

    const priceResponses = await Promise.all(
      Array.from(grouped.entries()).map(async ([qty, ids]) => {
        const { data, error } = await db.schema('app').rpc('resolve_prices_batch', {
          p_tenant_product_ids: ids,
          p_buyer_id: buyerId,
          p_qty: qty,
        });
        if (error) throw new Error(error.message);
        return (data ?? []) as PriceRow[];
      }),
    );

    for (const rows of priceResponses) {
      for (const row of rows) {
        priceMap.set(row.tenant_product_id, Number(row.unit_price ?? 0));
      }
    }
  }

  const out = new Map<string, BuyerCatalogItem>();
  for (const productId of orderedIds) {
    const product = tenantProducts.find((entry) => entry.id === productId);
    if (!product) continue;

    const tenantBrand = product.tenant_brand_id ? tenantBrandMap.get(product.tenant_brand_id) ?? null : null;
    const tenantCategory = product.tenant_category_id ? tenantCategoryMap.get(product.tenant_category_id) ?? null : null;
    const masterBrand = tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id) ?? null : null;
    const masterProduct = product.master_product_id ? masterProductMap.get(product.master_product_id) ?? null : null;
    const category = masterProduct?.category_id ? categoryMap.get(masterProduct.category_id) ?? null : null;
    const campaign = campaignByProductId.get(product.id) ?? null;
    const resolvedPrice = priceMap.get(product.id) ?? Number(product.base_selling_price ?? product.mrp ?? 0);
    const campaignPrice = campaign?.campaign_price ?? null;
    const onHand = Math.max(0, inventoryMap.get(product.id) ?? 0);

    out.set(product.id, {
      id: product.id,
      tenant_product_id: product.id,
      campaign_id: campaign?.campaign_id ?? null,
      campaign_name: campaign?.campaign_name ?? null,
      campaign_valid_until: campaign?.campaign_valid_until ?? null,
      internal_sku: product.internal_sku ?? product.id,
      display_name: product.name_override ?? masterProduct?.name ?? product.internal_sku ?? product.id,
      brand_id: tenantBrand?.master_brand_id ?? null,
      brand_name: tenantBrand?.display_name_override ?? masterBrand?.name ?? null,
      category_id: tenantCategory?.id ?? category?.id ?? null,
      category_name: tenantCategory?.name ?? category?.name ?? null,
      mrp: Number(product.mrp ?? 0),
      price: campaignPrice ?? resolvedPrice,
      resolved_price: resolvedPrice,
      campaign_price: campaignPrice,
      has_campaign_price: campaignPrice != null,
      gst_rate: product.gst_rate ?? masterProduct?.gst_rate ?? null,
      default_uom: product.default_uom,
      pack_size: product.pack_size,
      image_urls: (product.image_urls?.length ? product.image_urls : (masterProduct?.image_urls ?? [])) as string[],
      brand_logo_url: tenantBrand?.logo_url ?? masterBrand?.logo_url ?? null,
      category_image_url: r2Url(tenantCategory?.r2_image_thumb_key ?? tenantCategory?.r2_image_medium_key) ?? category?.image_url ?? null,
      stock_status: onHand === 0 ? 'out_of_stock' : onHand < 10 ? 'limited' : 'available',
      on_hand: onHand,
      is_featured: campaign?.is_featured ?? false,
    });
  }

  return out;
}

async function resolveCatalogScope(params: CatalogPageParams): Promise<CatalogScopeResult> {
  const {
    db,
    tenantId,
    allowedTenantBrandIds = null,
    visibleCampaigns,
    search = '',
    categoryId = '',
    brandId = '',
    tenantProductId = '',
    requestedCampaignId = '',
    limit,
    offset,
  } = params;

  const trimmedSearch = search.trim();
  if (requestedCampaignId) {
    const selectedCampaign = visibleCampaigns.find((campaign) => campaign.id === requestedCampaignId) ?? null;
    if (!selectedCampaign) {
      return {
        orderedProductIds: [],
        total: 0,
        selectedCampaign: null,
        campaignByProductId: new Map(),
      };
    }

    let effectiveTenantBrandIds = Array.isArray(allowedTenantBrandIds) ? [...allowedTenantBrandIds] : null;
    if (brandId) {
      const matchingTenantBrandIds = await resolveTenantBrandIdsForBuyerBrand(db, tenantId, brandId);
      effectiveTenantBrandIds = effectiveTenantBrandIds
        ? effectiveTenantBrandIds.filter((id) => matchingTenantBrandIds.includes(id))
        : matchingTenantBrandIds;
    }
    if (effectiveTenantBrandIds) {
      if (effectiveTenantBrandIds.length === 0) {
        return { orderedProductIds: [], total: 0, selectedCampaign, campaignByProductId: new Map() };
      }
    }

    const { rows, total } = await searchScopedProducts({
      db,
      tenantId,
      buyerId: params.buyerId,
      campaignId: selectedCampaign.id,
      query: trimmedSearch,
      limit,
      offset,
      ids: tenantProductId ? [tenantProductId] : null,
      brandIds: effectiveTenantBrandIds,
      categoryScopeId: categoryId || null,
      allowedBrandIds: effectiveTenantBrandIds,
      warehouseIds: params.inventoryWarehouseId ? [params.inventoryWarehouseId] : null,
      availability: 'show_all',
      sort: trimmedSearch ? 'relevance' : 'created_desc',
    });
    const orderedProductIds = rows.map((row) => row.tenant_product_id);
    if (orderedProductIds.length === 0) {
      return { orderedProductIds: [], total, selectedCampaign, campaignByProductId: new Map() };
    }

    const { data: pageCampaignItemsData, error: pageCampaignItemsError } = await db
      .schema('app')
      .from('campaign_items')
      .select('tenant_product_id, price_override, display_order, is_featured')
      .eq('campaign_id', selectedCampaign.id)
      .in('tenant_product_id', orderedProductIds)
      .is('deleted_at', null)
      .limit(orderedProductIds.length);
    if (pageCampaignItemsError) throw new Error(pageCampaignItemsError.message);

    const itemByProductId = new Map(
      ((pageCampaignItemsData ?? []) as CampaignItemRow[]).map((row) => [row.tenant_product_id, row]),
    );
    const campaignByProductId = new Map(
      orderedProductIds.flatMap((productId) => {
        const row = itemByProductId.get(productId);
        return row ? [[productId, {
          campaign_id: selectedCampaign.id,
          campaign_name: selectedCampaign.name,
          campaign_valid_until: selectedCampaign.valid_to,
          campaign_price: row.price_override,
          is_featured: Boolean(row.is_featured),
        }] as const] : [];
      }),
    );

    return {
      orderedProductIds,
      total,
      selectedCampaign,
      campaignByProductId,
    };
  }

  let effectiveTenantBrandIds = Array.isArray(allowedTenantBrandIds) ? [...allowedTenantBrandIds] : null;
  if (brandId) {
    const matchingTenantBrandIds = await resolveTenantBrandIdsForBuyerBrand(db, tenantId, brandId);
    effectiveTenantBrandIds = effectiveTenantBrandIds
      ? effectiveTenantBrandIds.filter((id) => matchingTenantBrandIds.includes(id))
      : matchingTenantBrandIds;
  }
  if (effectiveTenantBrandIds) {
    if (effectiveTenantBrandIds.length === 0) {
      return { orderedProductIds: [], total: 0, selectedCampaign: null, campaignByProductId: new Map() };
    }
  }

  const { rows, total } = await searchScopedProducts({
    db,
    tenantId,
    buyerId: params.buyerId,
    query: trimmedSearch,
    limit,
    offset,
    ids: tenantProductId ? [tenantProductId] : null,
    brandIds: effectiveTenantBrandIds,
    categoryScopeId: categoryId || null,
    allowedBrandIds: effectiveTenantBrandIds,
    warehouseIds: params.inventoryWarehouseId ? [params.inventoryWarehouseId] : null,
    availability: 'show_all',
    sort: trimmedSearch ? 'relevance' : 'created_desc',
  });

  const orderedProductIds = rows.map((row) => row.tenant_product_id);
  const campaignByProductId = await resolveVisibleCampaignMap(db, {
    tenantId,
    buyerId: params.buyerId,
    productIds: orderedProductIds,
    visibleCampaigns,
  });

  return {
    orderedProductIds,
    total,
    selectedCampaign: null,
    campaignByProductId,
  };
}

export async function fetchBuyerCatalogPage(
  params: CatalogPageParams,
): Promise<BuyerCatalogResponse> {
  const scope = await resolveCatalogScope(params);
  const itemsMap = await enrichBuyerProducts(params.db, {
    tenantId: params.tenantId,
    buyerId: params.buyerId,
    tenantProductIds: scope.orderedProductIds,
    allowedTenantBrandIds: params.allowedTenantBrandIds,
    inventoryWarehouseId: params.inventoryWarehouseId,
    campaignByProductId: scope.campaignByProductId,
  });

  return {
    items: scope.orderedProductIds
      .map((id) => itemsMap.get(id))
      .filter((item): item is BuyerCatalogItem => Boolean(item)),
    total: scope.total,
    has_more: params.offset + params.limit < scope.total,
    selected_campaign_id: scope.selectedCampaign?.id ?? null,
    selected_campaign_name: scope.selectedCampaign?.name ?? null,
    selected_campaign_valid_until: scope.selectedCampaign?.valid_to ?? null,
    selected_campaign_message: scope.selectedCampaign?.message ?? null,
  };
}

type FacetScopeParams = {
  db: SupabaseClient;
  tenantId: string;
  allowedTenantBrandIds?: string[] | null;
  categoryId?: string;
  brandId?: string;
  requestedCampaignId?: string;
  shareToken?: string;
};

async function resolveFacetScopeRows(params: FacetScopeParams): Promise<BuyerFacetRpcRow[]> {
  const {
    db,
    tenantId,
    allowedTenantBrandIds = null,
    categoryId = '',
    brandId = '',
    requestedCampaignId = '',
    shareToken = '',
  } = params;

  if (Array.isArray(allowedTenantBrandIds) && allowedTenantBrandIds.length === 0) return [];

  let campaignId = requestedCampaignId || null;
  if (!campaignId && shareToken) {
    const { data: campaign, error } = await db
      .schema('app')
      .from('campaigns')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('share_token', shareToken)
      .eq('status', 'published')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    campaignId = (campaign as { id?: string } | null)?.id ?? null;
    if (!campaignId) return [];
  }

  const rpcDb = db as any;
  const { data, error } = await rpcDb.schema('app').rpc('get_buyer_product_facets_scoped', {
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
    p_allowed_brand_ids: allowedTenantBrandIds,
    p_brand_scope_id: brandId || null,
    p_category_scope_id: categoryId || null,
    p_limit: 100,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BuyerFacetRpcRow[];
}

export async function fetchBuyerCategories(
  params: FacetScopeParams,
): Promise<BuyerCategory[]> {
  const rows = await resolveFacetScopeRows(params);
  return rows
    .filter((row) => row.facet_type === 'category')
    .map((row) => ({
      id: row.facet_id,
      name: row.facet_label,
      slug: row.facet_slug ?? row.facet_id,
      image_url: tenantCategoryImageUrl(row.image_thumb_key, row.image_medium_key) ?? row.image_url,
      product_count: Number(row.product_count),
    }));
}

export async function fetchBuyerBrands(
  params: FacetScopeParams,
): Promise<BuyerBrand[]> {
  const rows = await resolveFacetScopeRows(params);
  return rows
    .filter((row) => row.facet_type === 'brand')
    .map((row) => ({
      id: row.facet_id,
      name: row.facet_label,
      product_count: Number(row.product_count),
      logo_url: row.image_url,
    }));
}

export async function resolveBuyerCatalogContext(
  db: SupabaseClient,
  request: NextRequest,
  profile: BuyerAccessProfile,
): Promise<{
  tenantId: string;
  buyerId: string | null;
  inventoryWarehouseId: string | null;
  allowedTenantBrandIds: string[] | null;
  visibleCampaigns: BuyerVisibleCatalog[];
  catalogs: BuyerCatalogSummary[];
}> {
  const tenantId = profile.context.tenant_id!;
  const buyerId = profile.buyer?.id ?? null;
  const [scopeContext, catalogSummary] = await Promise.all([
    resolveBuyerProductScopeContext(db, request, profile),
    resolveBuyerCatalogSummaries(db, tenantId, buyerId),
  ]);

  return {
    tenantId: scopeContext.tenantId,
    buyerId: scopeContext.buyerId,
    inventoryWarehouseId: scopeContext.inventoryWarehouseId,
    allowedTenantBrandIds: scopeContext.allowedTenantBrandIds,
    visibleCampaigns: catalogSummary.visibleCampaigns,
    catalogs: catalogSummary.catalogs,
  };
}

export async function resolveBuyerProductScopeContext(
  db: SupabaseClient,
  request: NextRequest,
  profile: BuyerAccessProfile,
): Promise<{
  tenantId: string;
  buyerId: string | null;
  inventoryWarehouseId: string | null;
  allowedTenantBrandIds: string[] | null;
}> {
  const tenantId = profile.context.tenant_id!;
  const buyerId = profile.buyer?.id ?? null;
  const [inventoryWarehouseId, allowedTenantBrandIds] = await Promise.all([
    resolveBuyerInventoryWarehouseId(db, request, profile),
    buyerId ? resolveBuyerAllowedTenantBrandIds(db as any, tenantId, buyerId) : Promise.resolve(null),
  ]);

  return {
    tenantId,
    buyerId,
    inventoryWarehouseId,
    allowedTenantBrandIds,
  };
}
