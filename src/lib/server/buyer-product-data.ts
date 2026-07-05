import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuyerAccessProfile, BuyerVisibleCatalog } from '@/lib/server/buyer-access';
import { getVisibleBuyerCatalogs } from '@/lib/server/buyer-access';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { getSelectedBuyerDeliveryFromRequest } from '@/lib/server/buyer-location-selection';
import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';
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

type InventoryRow = {
  tenant_product_id: string;
  qty_available: number | null;
};

type PriceRow = {
  tenant_product_id: string;
  unit_price: number | null;
};

type SearchContext = {
  tenantBrandIds: string[];
  masterProductIds: string[];
  tenantCategoryIds: string[];
};

type CategoryProductFilter =
  | { kind: 'tenant_category'; tenantCategoryIds: string[] }
  | { kind: 'master_product'; masterProductIds: string[] };

type FacetProductRow = {
  tenant_brand_id: string | null;
  master_product_id: string | null;
  tenant_category_id: string | null;
};

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

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, '\\$&');
}

async function resolveMasterProductIdsForCategory(
  db: SupabaseClient,
  categoryId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema('catalog')
    .from('products')
    .select('id')
    .eq('category_id', categoryId);

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function resolveCategoryProductFilter(
  db: SupabaseClient,
  tenantId: string,
  categoryId: string,
): Promise<CategoryProductFilter | null> {
  const { data: tenantCategoryById, error: tenantCategoryByIdError } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', categoryId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tenantCategoryByIdError) throw new Error(tenantCategoryByIdError.message);
  if (tenantCategoryById) {
    return { kind: 'tenant_category', tenantCategoryIds: [(tenantCategoryById as { id: string }).id] };
  }

  const { data: tenantCategoriesByMaster, error: tenantCategoriesByMasterError } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('master_category_id', categoryId)
    .is('deleted_at', null);
  if (tenantCategoriesByMasterError) throw new Error(tenantCategoriesByMasterError.message);
  const tenantCategoryIds = ((tenantCategoriesByMaster ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (tenantCategoryIds.length > 0) {
    return { kind: 'tenant_category', tenantCategoryIds };
  }

  const masterProductIds = await resolveMasterProductIdsForCategory(db, categoryId);
  if (masterProductIds.length > 0) {
    return { kind: 'master_product', masterProductIds };
  }

  return null;
}

function applyCategoryProductFilter<TQuery extends { eq: (column: string, value: string) => TQuery; in: (column: string, values: string[]) => TQuery }>(
  query: TQuery,
  filter: CategoryProductFilter,
): TQuery {
  if (filter.kind === 'tenant_category') {
    if (filter.tenantCategoryIds.length === 1) {
      return query.eq('tenant_category_id', filter.tenantCategoryIds[0]!);
    }
    return query.in('tenant_category_id', filter.tenantCategoryIds);
  }
  return query.in('master_product_id', filter.masterProductIds);
}

function appendSearchOrParts(orParts: string[], searchContext: SearchContext): void {
  if (searchContext.tenantBrandIds.length > 0) {
    orParts.push(`tenant_brand_id.in.(${searchContext.tenantBrandIds.join(',')})`);
  }
  if (searchContext.tenantCategoryIds.length > 0) {
    orParts.push(`tenant_category_id.in.(${searchContext.tenantCategoryIds.join(',')})`);
  }
  if (searchContext.masterProductIds.length > 0) {
    orParts.push(`master_product_id.in.(${searchContext.masterProductIds.join(',')})`);
  }
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

async function resolveSearchContext(
  db: SupabaseClient,
  tenantId: string,
  search: string,
): Promise<SearchContext> {
  const term = search.trim();
  if (!term) return { tenantBrandIds: [], masterProductIds: [], tenantCategoryIds: [] };

  const like = `%${escapeLike(term)}%`;
  const [masterBrandsRes, categoriesRes, tenantCategoriesRes, tenantBrandsRes, masterProductsRes] = await Promise.all([
    db.schema('catalog').from('brands').select('id').ilike('name', like),
    db.schema('catalog').from('categories').select('id').ilike('name', like),
    db
      .schema('app')
      .from('tenant_categories')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('name', like)
      .is('deleted_at', null),
    db
      .schema('app')
      .from('tenant_brands')
      .select('id, master_brand_id, display_name_override')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    db
      .schema('catalog')
      .from('products')
      .select('id, category_id')
      .ilike('name', like),
  ]);

  const firstError =
    masterBrandsRes.error
    ?? categoriesRes.error
    ?? tenantCategoriesRes.error
    ?? tenantBrandsRes.error
    ?? masterProductsRes.error;
  if (firstError) throw new Error(firstError.message);

  const matchingMasterBrandIds = new Set(
    ((masterBrandsRes.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  );
  const matchingCategoryIds = new Set(
    ((categoriesRes.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  );
  const tenantCategoryIds = ((tenantCategoriesRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const tenantBrandIds = ((tenantBrandsRes.data ?? []) as TenantBrandRow[])
    .filter((brand) =>
      (brand.display_name_override?.toLowerCase().includes(term.toLowerCase()) ?? false)
      || (brand.master_brand_id ? matchingMasterBrandIds.has(brand.master_brand_id) : false),
    )
    .map((brand) => brand.id);

  const masterProductIds = ((masterProductsRes.data ?? []) as Array<{ id: string; category_id: string | null }>)
    .filter((row) => row.category_id == null || matchingCategoryIds.size === 0 || matchingCategoryIds.has(row.category_id))
    .map((row) => row.id);

  if (matchingCategoryIds.size > 0) {
    const { data: categoryProducts, error: categoryProductsError } = await db
      .schema('catalog')
      .from('products')
      .select('id')
      .in('category_id', Array.from(matchingCategoryIds));
    if (categoryProductsError) throw new Error(categoryProductsError.message);
    for (const row of (categoryProducts ?? []) as Array<{ id: string }>) {
      masterProductIds.push(row.id);
    }
  }

  return {
    tenantBrandIds: uniq(tenantBrandIds),
    masterProductIds: uniq(masterProductIds),
    tenantCategoryIds: uniq(tenantCategoryIds),
  };
}

export async function resolveBuyerInventoryWarehouseId(
  db: SupabaseClient,
  request: NextRequest,
  profile: BuyerAccessProfile,
): Promise<string | null> {
  const tenantId = profile.context.tenant_id;
  if (!tenantId) return null;

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

  const selectedDelivery = getSelectedBuyerDeliveryFromRequest(request);
  const resolvedRouting = await resolveNearestBuyerLocation(db as any, tenantId, selectedDelivery);
  return resolvedRouting?.warehouseId ?? resolvedRouting?.locationId ?? null;
}

export async function resolveBuyerCatalogSummaries(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string | null,
): Promise<{ visibleCampaigns: BuyerVisibleCatalog[]; catalogs: BuyerCatalogSummary[] }> {
  let visibleCampaigns: BuyerVisibleCatalog[] = [];
  if (buyerId) {
    visibleCampaigns = await getVisibleBuyerCatalogs(tenantId, buyerId);
  } else {
    const { data, error } = await db
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

  const campaignIds = visibleCampaigns.map((campaign) => campaign.id);
  const counts = new Map<string, number>();
  if (campaignIds.length > 0) {
    const { data, error } = await db
      .schema('app')
      .from('campaign_items')
      .select('campaign_id')
      .in('campaign_id', campaignIds)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ campaign_id: string }>) {
      counts.set(row.campaign_id, (counts.get(row.campaign_id) ?? 0) + 1);
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
    .select('id, internal_sku, name_override, tenant_brand_id, master_product_id, mrp, base_selling_price, gst_rate, default_uom, pack_size, image_urls')
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
  const masterProductIds = uniq(
    tenantProducts.map((product) => product.master_product_id).filter((value): value is string => Boolean(value)),
  );

  const [tenantBrandsRes, masterProductsRes, inventoryRes] = await Promise.all([
    tenantBrandIds.length > 0
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, master_brand_id, logo_url')
          .in('id', tenantBrandIds)
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

  const secondError = tenantBrandsRes.error ?? masterProductsRes.error ?? inventoryRes.error;
  if (secondError) throw new Error(secondError.message);

  const tenantBrands = (tenantBrandsRes.data ?? []) as TenantBrandRow[];
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
      category_id: category?.id ?? null,
      category_name: category?.name ?? null,
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
      category_image_url: category?.image_url ?? null,
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
  const searchContext = trimmedSearch
    ? await resolveSearchContext(db, tenantId, trimmedSearch)
    : { tenantBrandIds: [], masterProductIds: [], tenantCategoryIds: [] };

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

    const { data: campaignItemsData, error: campaignItemsError } = await db
      .schema('app')
      .from('campaign_items')
      .select('tenant_product_id, price_override, display_order, is_featured')
      .eq('campaign_id', selectedCampaign.id)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });
    if (campaignItemsError) throw new Error(campaignItemsError.message);

    const campaignItems = (campaignItemsData ?? []) as CampaignItemRow[];
    let orderedRows = campaignItems;
    let candidateIds = uniq(campaignItems.map((row) => row.tenant_product_id));
    if (candidateIds.length === 0) {
      return { orderedProductIds: [], total: 0, selectedCampaign, campaignByProductId: new Map() };
    }

    let tenantProductsQuery = db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, master_product_id, name_override, internal_sku')
      .eq('tenant_id', tenantId)
      .in('id', candidateIds)
      .eq('is_active', true)
      .is('deleted_at', null);

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
      tenantProductsQuery = tenantProductsQuery.in('tenant_brand_id', effectiveTenantBrandIds);
    }

    if (categoryId) {
      const categoryFilter = await resolveCategoryProductFilter(db, tenantId, categoryId);
      if (!categoryFilter) {
        return { orderedProductIds: [], total: 0, selectedCampaign, campaignByProductId: new Map() };
      }
      tenantProductsQuery = applyCategoryProductFilter(tenantProductsQuery, categoryFilter);
    }
    if (tenantProductId) tenantProductsQuery = tenantProductsQuery.eq('id', tenantProductId);

    if (trimmedSearch) {
      const orParts = [
        `name_override.ilike.%${escapeLike(trimmedSearch)}%`,
        `internal_sku.ilike.%${escapeLike(trimmedSearch)}%`,
      ];
      appendSearchOrParts(orParts, searchContext);
      tenantProductsQuery = tenantProductsQuery.or(orParts.join(','));
    }

    const { data: filteredProducts, error: filteredProductsError } = await tenantProductsQuery;
    if (filteredProductsError) throw new Error(filteredProductsError.message);

    const allowedIds = new Set(((filteredProducts ?? []) as Array<{ id: string }>).map((row) => row.id));
    orderedRows = campaignItems.filter((row) => allowedIds.has(row.tenant_product_id));

    const pageRows = orderedRows.slice(offset, offset + limit);
    const campaignByProductId = new Map(
      pageRows.map((row) => [row.tenant_product_id, {
        campaign_id: selectedCampaign.id,
        campaign_name: selectedCampaign.name,
        campaign_valid_until: selectedCampaign.valid_to,
        campaign_price: row.price_override,
        is_featured: Boolean(row.is_featured),
      }]),
    );

    return {
      orderedProductIds: pageRows.map((row) => row.tenant_product_id),
      total: orderedRows.length,
      selectedCampaign,
      campaignByProductId,
    };
  }

  let productsBaseQuery = db
    .schema('app')
    .from('tenant_products')
    .select('id', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null);

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
    productsBaseQuery = productsBaseQuery.in('tenant_brand_id', effectiveTenantBrandIds);
  }

  let categoryFilter: CategoryProductFilter | null = null;
  if (categoryId) {
    categoryFilter = await resolveCategoryProductFilter(db, tenantId, categoryId);
    if (!categoryFilter) {
      return { orderedProductIds: [], total: 0, selectedCampaign: null, campaignByProductId: new Map() };
    }
    productsBaseQuery = applyCategoryProductFilter(productsBaseQuery, categoryFilter);
  }

  if (tenantProductId) {
    productsBaseQuery = productsBaseQuery.eq('id', tenantProductId);
  }

  if (trimmedSearch) {
    const orParts = [
      `name_override.ilike.%${escapeLike(trimmedSearch)}%`,
      `internal_sku.ilike.%${escapeLike(trimmedSearch)}%`,
    ];
    appendSearchOrParts(orParts, searchContext);
    productsBaseQuery = productsBaseQuery.or(orParts.join(','));
  }

  const countQuery = productsBaseQuery;
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  let pageQuery = db
    .schema('app')
    .from('tenant_products')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (effectiveTenantBrandIds) {
    pageQuery = pageQuery.in('tenant_brand_id', effectiveTenantBrandIds);
  }
  if (categoryFilter) {
    pageQuery = applyCategoryProductFilter(pageQuery, categoryFilter);
  }
  if (tenantProductId) pageQuery = pageQuery.eq('id', tenantProductId);
  if (trimmedSearch) {
    const orParts = [
      `name_override.ilike.%${escapeLike(trimmedSearch)}%`,
      `internal_sku.ilike.%${escapeLike(trimmedSearch)}%`,
    ];
    appendSearchOrParts(orParts, searchContext);
    pageQuery = pageQuery.or(orParts.join(','));
  }

  const { data: pageRows, error: pageError } = await pageQuery;
  if (pageError) throw new Error(pageError.message);

  return {
    orderedProductIds: ((pageRows ?? []) as Array<{ id: string }>).map((row) => row.id),
    total: count ?? 0,
    selectedCampaign: null,
    campaignByProductId: new Map(),
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

async function resolveFacetScopeProductRows(params: FacetScopeParams): Promise<FacetProductRow[]> {
  const { db, tenantId, allowedTenantBrandIds = null, categoryId = '', brandId = '', requestedCampaignId = '', shareToken = '' } = params;

  let candidateIds: string[] | null = null;
  if (requestedCampaignId || shareToken) {
    let campaignId = requestedCampaignId;
    if (!campaignId && shareToken) {
      const { data: campaign, error } = await db
        .schema('app')
        .from('campaigns')
        .select('id')
        .eq('share_token', shareToken)
        .eq('status', 'published')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      campaignId = (campaign as { id?: string } | null)?.id ?? '';
    }
    if (campaignId) {
      const { data: rows, error } = await db
        .schema('app')
        .from('campaign_items')
        .select('tenant_product_id')
        .eq('campaign_id', campaignId)
        .is('deleted_at', null);
      if (error) throw new Error(error.message);
      candidateIds = ((rows ?? []) as Array<{ tenant_product_id: string }>).map((row) => row.tenant_product_id);
      if (candidateIds.length === 0) return [];
    }
  }

  let query = db
    .schema('app')
    .from('tenant_products')
    .select('tenant_brand_id, master_product_id, tenant_category_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (candidateIds) query = query.in('id', candidateIds);
  if (Array.isArray(allowedTenantBrandIds)) {
    if (allowedTenantBrandIds.length === 0) return [];
    query = query.in('tenant_brand_id', allowedTenantBrandIds);
  }
  if (brandId) {
    const matchingTenantBrandIds = await resolveTenantBrandIdsForBuyerBrand(db, tenantId, brandId);
    if (matchingTenantBrandIds.length === 0) return [];
    query = query.in('tenant_brand_id', matchingTenantBrandIds);
  }
  if (categoryId) {
    const categoryFilter = await resolveCategoryProductFilter(db, tenantId, categoryId);
    if (!categoryFilter) return [];
    query = applyCategoryProductFilter(query, categoryFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as FacetProductRow[];
}

export async function fetchBuyerCategories(
  params: FacetScopeParams,
): Promise<BuyerCategory[]> {
  const rows = await resolveFacetScopeProductRows(params);
  if (rows.length === 0) return [];

  const tenantCategoryCounts = new Map<string, number>();
  const masterProductIdsForCatalog = new Set<string>();

  for (const row of rows) {
    if (row.tenant_category_id) {
      tenantCategoryCounts.set(
        row.tenant_category_id,
        (tenantCategoryCounts.get(row.tenant_category_id) ?? 0) + 1,
      );
      continue;
    }
    if (row.master_product_id) {
      masterProductIdsForCatalog.add(row.master_product_id);
    }
  }

  const categories: BuyerCategory[] = [];

  if (tenantCategoryCounts.size > 0) {
    const tenantCategoryIds = Array.from(tenantCategoryCounts.keys());
    const { data: tenantCategories, error: tenantCategoriesError } = await params.db
      .schema('app')
      .from('tenant_categories')
      .select('id, name, slug, r2_image_thumb_key, r2_image_medium_key')
      .eq('tenant_id', params.tenantId)
      .in('id', tenantCategoryIds)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (tenantCategoriesError) throw new Error(tenantCategoriesError.message);

    for (const category of (tenantCategories ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      r2_image_thumb_key: string | null;
      r2_image_medium_key: string | null;
    }>) {
      categories.push({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image_url: tenantCategoryImageUrl(category.r2_image_thumb_key, category.r2_image_medium_key),
        product_count: tenantCategoryCounts.get(category.id) ?? 0,
      });
    }
  }

  if (masterProductIdsForCatalog.size > 0) {
    const { data: catalogProducts, error: catalogProductsError } = await params.db
      .schema('catalog')
      .from('products')
      .select('category_id, categories(id, name, slug, image_url)')
      .in('id', Array.from(masterProductIdsForCatalog))
      .not('category_id', 'is', null);
    if (catalogProductsError) throw new Error(catalogProductsError.message);

    const countMap = new Map<string, number>();
    const categoryMap = new Map<string, { id: string; name: string; slug: string; image_url: string | null }>();
    for (const row of (catalogProducts ?? []) as unknown as Array<{ categories: { id: string; name: string; slug: string; image_url: string | null }[] | null }>) {
      const category = Array.isArray(row.categories) ? row.categories[0] ?? null : row.categories;
      if (!category) continue;
      countMap.set(category.id, (countMap.get(category.id) ?? 0) + 1);
      categoryMap.set(category.id, category);
    }

    for (const category of categoryMap.values()) {
      categories.push({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image_url: category.image_url,
        product_count: countMap.get(category.id) ?? 0,
      });
    }
  }

  return categories.sort((a, b) => b.product_count - a.product_count);
}

export async function fetchBuyerBrands(
  params: FacetScopeParams,
): Promise<BuyerBrand[]> {
  const rows = await resolveFacetScopeProductRows(params);
  const countByTenantBrand = new Map<string, number>();
  for (const row of rows) {
    if (!row.tenant_brand_id) continue;
    countByTenantBrand.set(row.tenant_brand_id, (countByTenantBrand.get(row.tenant_brand_id) ?? 0) + 1);
  }

  const tenantBrandIds = Array.from(countByTenantBrand.keys());
  if (tenantBrandIds.length === 0) return [];

  const { data: tenantBrands, error: tenantBrandsError } = await params.db
    .schema('app')
    .from('tenant_brands')
    .select('id, display_name_override, master_brand_id, logo_url')
    .in('id', tenantBrandIds)
    .is('deleted_at', null);
  if (tenantBrandsError) throw new Error(tenantBrandsError.message);

  const masterBrandIds = uniq(
    ((tenantBrands ?? []) as Array<{ master_brand_id: string | null }>)
      .map((brand) => brand.master_brand_id)
      .filter((value): value is string => Boolean(value)),
  );
  const { data: masterBrands, error: masterBrandsError } = masterBrandIds.length > 0
    ? await params.db.schema('catalog').from('brands').select('id, name, logo_url').in('id', masterBrandIds)
    : { data: [], error: null };
  if (masterBrandsError) throw new Error(masterBrandsError.message);

  const masterBrandMap = new Map(
    ((masterBrands ?? []) as MasterBrandRow[]).map((brand) => [brand.id, brand]),
  );

  return ((tenantBrands ?? []) as Array<{ id: string; display_name_override: string | null; master_brand_id: string | null; logo_url: string | null }>)
    .map((brand) => ({
      id: brand.master_brand_id ?? brand.id,
      name: brand.display_name_override ?? (brand.master_brand_id ? masterBrandMap.get(brand.master_brand_id)?.name ?? 'Brand' : 'Brand'),
      product_count: countByTenantBrand.get(brand.id) ?? 0,
      logo_url: brand.logo_url ?? (brand.master_brand_id ? masterBrandMap.get(brand.master_brand_id)?.logo_url ?? null : null),
    }))
    .sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
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
