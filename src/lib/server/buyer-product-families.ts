import type { SupabaseClient } from '@supabase/supabase-js';
import { r2Url } from '@/lib/r2-url';
import { enrichBuyerProducts } from '@/lib/server/buyer-product-data';
import type { GuestPricingContext, PublicCatalogRecord } from '@/lib/server/public-catalog';
import type {
  BuyerCatalogItem,
  BuyerCatalogResponse,
  BuyerFamilyPriceSummary,
  BuyerFamilySkuOption,
  BuyerFamilyVariantAxis,
  BuyerProductFamilyDetail,
} from '@/types/buyer';

type FamilyRow = {
  id: string;
  tenant_id: string;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  name: string;
  description: string | null;
  variant_axes: unknown;
  image_urls: string[] | null;
  r2_small_key: string | null;
  r2_medium_key: string | null;
  r2_large_key: string | null;
  display_order: number | null;
};

type FamilyChildRow = {
  id: string;
  product_family_id: string | null;
  attributes_override: Record<string, string> | null;
};

type NameRow = { id: string; name?: string | null; display_name_override?: string | null; slug?: string | null; logo_url?: string | null; r2_logo_medium_key?: string | null; r2_image_thumb_key?: string | null; r2_image_medium_key?: string | null };

function normalizeAxes(raw: unknown, children: Array<{ attributes: Record<string, string> }>): BuyerFamilyVariantAxis[] {
  const declared = Array.isArray(raw)
    ? raw
        .filter((axis): axis is { key: string; label?: string; sort?: string[] } => Boolean(axis && typeof axis === 'object' && typeof (axis as { key?: unknown }).key === 'string'))
        .map((axis) => ({ key: axis.key, label: axis.label || axis.key, sort: Array.isArray(axis.sort) ? axis.sort : [] }))
    : [];
  const byKey = new Map(declared.map((axis) => [axis.key, { key: axis.key, label: axis.label, values: [...axis.sort] }]));
  for (const child of children) {
    for (const [key, value] of Object.entries(child.attributes)) {
      if (!value) continue;
      const axis = byKey.get(key) ?? { key, label: key, values: [] };
      if (!axis.values.includes(value)) axis.values.push(value);
      byKey.set(key, axis);
    }
  }
  return [...byKey.values()].filter((axis) => axis.values.length > 0);
}

function priceSummary(items: BuyerCatalogItem[], hidden: boolean): BuyerFamilyPriceSummary {
  if (hidden) return { min_price: null, max_price: null, display: 'hidden' };
  const prices = items.map((item) => item.price).filter((price): price is number => typeof price === 'number');
  if (prices.length === 0) return { min_price: null, max_price: null, display: 'hidden' };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    min_price: min,
    max_price: max,
    display: min === max ? 'single' : 'from',
  };
}

function familyImageUrls(family: FamilyRow): { image_urls: string[]; small: string | null; medium: string | null; large: string | null } {
  const small = r2Url(family.r2_small_key) ?? r2Url(family.r2_medium_key) ?? r2Url(family.r2_large_key);
  const medium = r2Url(family.r2_medium_key) ?? r2Url(family.r2_large_key) ?? r2Url(family.r2_small_key);
  const large = r2Url(family.r2_large_key) ?? r2Url(family.r2_medium_key) ?? r2Url(family.r2_small_key);
  const legacy = (family.image_urls ?? []).filter(Boolean);
  return { image_urls: legacy, small: small ?? legacy[0] ?? null, medium: medium ?? legacy[0] ?? null, large: large ?? legacy[0] ?? null };
}

async function loadNames(db: SupabaseClient, brandIds: string[], categoryIds: string[]) {
  const [{ data: brands }, { data: categories }] = await Promise.all([
    brandIds.length
      ? db.schema('app').from('tenant_brands').select('id, display_name_override, slug, logo_url, r2_logo_medium_key').in('id', brandIds)
      : Promise.resolve({ data: [] as NameRow[] }),
    categoryIds.length
      ? db.schema('app').from('tenant_categories').select('id, name, slug, r2_image_thumb_key, r2_image_medium_key').in('id', categoryIds)
      : Promise.resolve({ data: [] as NameRow[] }),
  ]);
  return {
    brands: new Map(((brands ?? []) as NameRow[]).map((row) => [row.id, row])),
    categories: new Map(((categories ?? []) as NameRow[]).map((row) => [row.id, row])),
  };
}

export async function fetchBuyerFamilyCatalogPage(params: {
  db: SupabaseClient;
  tenantId: string;
  buyerId: string | null;
  allowedTenantBrandIds?: string[] | null;
  inventoryWarehouseId?: string | null;
  search?: string;
  categoryId?: string;
  brandId?: string;
  familyId?: string;
  limit: number;
  offset: number;
  guestPricing?: GuestPricingContext | null;
  publicCatalog?: PublicCatalogRecord | null;
}): Promise<BuyerCatalogResponse> {
  const hidden = params.publicCatalog?.pricingMode === 'hide_price_collect_enquiry' || params.guestPricing?.mode === 'hidden_until_login';
  let query = params.db
    .schema('app')
    .from('tenant_product_families')
    .select('id, tenant_id, tenant_brand_id, tenant_category_id, name, description, variant_axes, image_urls, r2_small_key, r2_medium_key, r2_large_key, display_order', { count: 'exact' })
    .eq('tenant_id', params.tenantId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (params.allowedTenantBrandIds) {
    if (params.allowedTenantBrandIds.length === 0) {
      return { items: [], total: 0, has_more: false, catalog_id: params.publicCatalog?.id ?? null, pricing_mode: params.publicCatalog?.pricingMode ?? params.guestPricing?.mode ?? null, collect_target_unit_price_range: params.publicCatalog?.collectTargetUnitPriceRange ?? false };
    }
    query = query.in('tenant_brand_id', params.allowedTenantBrandIds);
  }
  if (params.brandId) query = query.eq('tenant_brand_id', params.brandId);
  if (params.categoryId) query = query.eq('tenant_category_id', params.categoryId);
  if (params.familyId) query = query.eq('id', params.familyId);
  if (params.search?.trim()) query = query.ilike('name', `%${params.search.trim()}%`);

  const { data: familyData, error, count } = await query
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .range(params.offset, params.offset + params.limit - 1);
  if (error) throw new Error(error.message);

  const families = (familyData ?? []) as FamilyRow[];
  if (families.length === 0) {
    return { items: [], total: count ?? 0, has_more: false, catalog_id: params.publicCatalog?.id ?? null, pricing_mode: params.publicCatalog?.pricingMode ?? params.guestPricing?.mode ?? null, collect_target_unit_price_range: params.publicCatalog?.collectTargetUnitPriceRange ?? false };
  }

  const familyIds = families.map((family) => family.id);
  const { data: childData, error: childError } = await params.db
    .schema('app')
    .from('tenant_products')
    .select('id, product_family_id, attributes_override')
    .eq('tenant_id', params.tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('product_family_id', familyIds)
    .limit(5000);
  if (childError) throw new Error(childError.message);

  const excluded = new Set(params.guestPricing?.excludedProductIds ?? []);
  const children = ((childData ?? []) as FamilyChildRow[]).filter((child) => !excluded.has(child.id));
  const childIds = children.map((child) => child.id);
  const enriched = await enrichBuyerProducts(params.db, {
    tenantId: params.tenantId,
    buyerId: params.buyerId,
    tenantProductIds: childIds,
    inventoryWarehouseId: params.inventoryWarehouseId ?? null,
    guestPricing: params.guestPricing ?? null,
    publicCatalog: params.publicCatalog ?? null,
  });
  const childrenByFamily = new Map<string, Array<{ row: FamilyChildRow; item: BuyerCatalogItem }>>();
  for (const child of children) {
    if (!child.product_family_id) continue;
    const item = enriched.get(child.id);
    if (!item) continue;
    const bucket = childrenByFamily.get(child.product_family_id) ?? [];
    bucket.push({ row: child, item });
    childrenByFamily.set(child.product_family_id, bucket);
  }

  const { brands, categories } = await loadNames(
    params.db,
    [...new Set(families.map((family) => family.tenant_brand_id).filter((id): id is string => Boolean(id)))],
    [...new Set(families.map((family) => family.tenant_category_id).filter((id): id is string => Boolean(id)))],
  );

  const items: BuyerCatalogItem[] = families.flatMap((family) => {
    const childEntries = childrenByFamily.get(family.id) ?? [];
    if (childEntries.length === 0) return [];
    const representative = childEntries[0]!.item;
    const brand = family.tenant_brand_id ? brands.get(family.tenant_brand_id) : null;
    const category = family.tenant_category_id ? categories.get(family.tenant_category_id) : null;
    const image = familyImageUrls(family);
    const summary = priceSummary(childEntries.map((entry) => entry.item), hidden);
    const axes = normalizeAxes(family.variant_axes, childEntries.map((entry) => ({ attributes: entry.row.attributes_override ?? {} })));
    return [{
      ...representative,
      id: family.id,
      item_type: 'family',
      product_family_id: family.id,
      tenant_product_id: representative.tenant_product_id,
      display_name: family.name,
      brand_id: family.tenant_brand_id,
      brand_name: brand?.display_name_override ?? brand?.slug ?? representative.brand_name,
      category_id: family.tenant_category_id,
      category_name: category?.name ?? representative.category_name,
      price: summary.min_price,
      price_summary: summary,
      child_sku_count: childEntries.length,
      variant_axes: axes,
      image_urls: image.image_urls,
      image_url_small: image.small ?? representative.image_url_small,
      image_url_medium: image.medium ?? representative.image_url_medium,
      image_url_large: image.large ?? representative.image_url_large,
      brand_logo_url: brand ? (r2Url(brand.r2_logo_medium_key) ?? brand.logo_url ?? null) : representative.brand_logo_url,
      category_image_url: category ? (r2Url(category.r2_image_thumb_key) ?? r2Url(category.r2_image_medium_key)) : representative.category_image_url,
    }];
  });

  const total = count ?? items.length;
  return {
    items,
    total,
    has_more: params.offset + params.limit < total,
    catalog_id: params.publicCatalog?.id ?? null,
    pricing_mode: params.publicCatalog?.pricingMode ?? params.guestPricing?.mode ?? null,
    collect_target_unit_price_range: params.publicCatalog?.collectTargetUnitPriceRange ?? false,
  };
}

export async function loadBuyerProductFamilyDetail(params: {
  db: SupabaseClient;
  tenantId: string;
  buyerId: string | null;
  familyId: string;
  allowedTenantBrandIds?: string[] | null;
  inventoryWarehouseId?: string | null;
  guestPricing?: GuestPricingContext | null;
  publicCatalog?: PublicCatalogRecord | null;
}): Promise<BuyerProductFamilyDetail | null> {
  const page = await fetchBuyerFamilyCatalogPage({
    db: params.db,
    tenantId: params.tenantId,
    buyerId: params.buyerId,
    allowedTenantBrandIds: params.allowedTenantBrandIds,
    inventoryWarehouseId: params.inventoryWarehouseId,
    limit: 1,
    offset: 0,
    guestPricing: params.guestPricing,
    publicCatalog: params.publicCatalog,
    familyId: params.familyId,
  });
  const family = page.items.find((item) => item.product_family_id === params.familyId);

  const { data: children, error } = await params.db
    .schema('app')
    .from('tenant_products')
    .select('id, attributes_override')
    .eq('tenant_id', params.tenantId)
    .eq('product_family_id', params.familyId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(500);
  if (error) throw new Error(error.message);
  const excluded = new Set(params.guestPricing?.excludedProductIds ?? []);
  const childRows = ((children ?? []) as Array<{ id: string; attributes_override: Record<string, string> | null }>)
    .filter((row) => !excluded.has(row.id));
  if (!family || childRows.length === 0) return null;

  const enriched = await enrichBuyerProducts(params.db, {
    tenantId: params.tenantId,
    buyerId: params.buyerId,
    tenantProductIds: childRows.map((row) => row.id),
    inventoryWarehouseId: params.inventoryWarehouseId ?? null,
    guestPricing: params.guestPricing ?? null,
    publicCatalog: params.publicCatalog ?? null,
  });

  const skus: BuyerFamilySkuOption[] = childRows.flatMap((row) => {
    const item = enriched.get(row.id);
    if (!item) return [];
    return [{
      tenant_product_id: row.id,
      internal_sku: item.internal_sku,
      display_name: item.display_name,
      attributes: row.attributes_override ?? {},
      price: item.price,
      resolved_price: item.resolved_price,
      campaign_price: item.campaign_price,
      has_campaign_price: item.has_campaign_price,
      gst_rate: item.gst_rate,
      default_uom: item.default_uom,
      pack_size: item.pack_size,
      stock_status: item.stock_status,
      on_hand: item.on_hand,
    }];
  });

  return {
    family,
    variant_axes: normalizeAxes(family.variant_axes, skus.map((sku) => ({ attributes: sku.attributes }))),
    skus,
  };
}
