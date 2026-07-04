import type { SupabaseClient } from '@supabase/supabase-js';
import type { BuyerCatalogItem } from '@/types/buyer';

async function resolveBuyerPrice(
  db: SupabaseClient,
  tenantProductId: string,
  buyerId: string | null,
): Promise<number> {
  if (!buyerId) {
    return 0;
  }

  const { data, error } = await db.schema('app').rpc('resolve_price', {
    p_tenant_product_id: tenantProductId,
    p_buyer_id: buyerId,
    p_qty: 1,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

/**
 * Builds `BuyerCatalogItem` rows for arbitrary tenant product IDs (e.g. reorder from past orders).
 * Catalog fields are optional when the SKU is not on a published list.
 */
export async function assembleBuyerCatalogItemsForProductIds(
  db: SupabaseClient,
  params: {
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
    buyerId,
    productIds,
    allowedTenantBrandIds,
    campaignId,
    campaignName,
    campaignValidUntil,
    priceOverrides,
    inventoryWarehouseId = null,
  } = params;
  const out = new Map<string, BuyerCatalogItem>();

  if (productIds.length === 0) return out;

  let productsQuery = db
    .schema('app')
    .from('tenant_products')
    .select(
      `
        id,
        tenant_brand_id,
        master_product_id,
        internal_sku,
        name_override,
        mrp,
        base_selling_price,
        gst_rate,
        default_uom,
        pack_size,
        image_urls,
        is_active
      `,
    )
    .in('id', productIds)
    .is('deleted_at', null)
    .eq('is_active', true);

  if (Array.isArray(allowedTenantBrandIds)) {
    if (allowedTenantBrandIds.length === 0) return out;
    productsQuery = productsQuery.in('tenant_brand_id', allowedTenantBrandIds);
  }

  const { data: tenantProducts, error: productsError } = await productsQuery;

  if (productsError) {
    throw new Error(productsError.message);
  }

  const products = (tenantProducts ?? []) as Array<{
    id: string;
    tenant_brand_id: string | null;
    master_product_id: string | null;
    internal_sku: string;
    name_override: string | null;
    mrp: number | null;
    base_selling_price: number | null;
    gst_rate: number | null;
    default_uom: string | null;
    pack_size: number | null;
    image_urls: string[] | null;
    is_active: boolean;
  }>;

  const masterProductIds = products
    .map((product) => product.master_product_id)
    .filter((value): value is string => Boolean(value));
  const tenantBrandIds = Array.from(
    new Set(products.map((product) => product.tenant_brand_id).filter(Boolean) as string[]),
  );

  const [masterProductsRes, tenantBrandsRes] = await Promise.all([
    masterProductIds.length > 0
      ? db
          .schema('catalog')
          .from('products')
          .select('id, name, image_urls, category_id, brand_id, gst_rate, categories(id, name, slug, image_url)')
          .in('id', masterProductIds)
      : Promise.resolve({ data: [], error: null }),
    tenantBrandIds.length > 0
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, master_brand_id, logo_url')
          .in('id', tenantBrandIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (masterProductsRes.error || tenantBrandsRes.error) {
    throw new Error((masterProductsRes.error ?? tenantBrandsRes.error)?.message ?? 'enrichment failed');
  }

  const tenantBrandsList = (tenantBrandsRes.data ?? []) as Array<{
    id: string;
    display_name_override: string | null;
    master_brand_id: string | null;
    logo_url: string | null;
  }>;
  const tenantBrandMap = new Map(tenantBrandsList.map((brand) => [brand.id, brand]));
  const masterProductMap = new Map(
    ((masterProductsRes.data ?? []) as Array<{
      id: string;
      name: string;
      image_urls: string[] | null;
      brand_id: string;
      gst_rate: number | null;
      categories: { id: string; name: string; slug: string; image_url: string | null } | null;
    }>).map((product) => [product.id, product]),
  );

  const masterBrandIds = Array.from(
    new Set(tenantBrandsList.map((brand) => brand.master_brand_id).filter(Boolean) as string[]),
  );
  let masterBrandMap = new Map<string, { name: string; logo_url: string | null }>();
  if (masterBrandIds.length > 0) {
    const { data: masterBrands, error: masterBrandsError } = await db
      .schema('catalog')
      .from('brands')
      .select('id, name, logo_url')
      .in('id', masterBrandIds);

    if (masterBrandsError) {
      throw new Error(masterBrandsError.message);
    }

    masterBrandMap = new Map(
      ((masterBrands ?? []) as Array<{ id: string; name: string; logo_url: string | null }>).map((brand) => [
        brand.id,
        { name: brand.name, logo_url: brand.logo_url },
      ]),
    );
  }

  const inventoryMap = new Map<string, number>();
  let inventoryQuery = db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available, warehouse_id')
    .in('tenant_product_id', productIds)
    .is('deleted_at', null);

  if (inventoryWarehouseId) {
    inventoryQuery = inventoryQuery.eq('warehouse_id', inventoryWarehouseId);
  }

  const { data: inventoryRows, error: inventoryError } = await inventoryQuery;

  if (inventoryError) {
    throw new Error(inventoryError.message);
  }

  for (const row of (inventoryRows ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>) {
    inventoryMap.set(
      row.tenant_product_id,
      (inventoryMap.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
    );
  }

  for (const product of products) {
    const master = product.master_product_id
      ? masterProductMap.get(product.master_product_id) ?? null
      : null;
    const tenantBrand = product.tenant_brand_id
      ? tenantBrandMap.get(product.tenant_brand_id) ?? null
      : null;
    const brandName =
      tenantBrand?.display_name_override
      ?? (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id)?.name ?? null : null)
      ?? null;
    const brandLogoUrl =
      tenantBrand?.logo_url
      ?? (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id)?.logo_url ?? null : null)
      ?? null;
    const onHand = Math.max(0, inventoryMap.get(product.id) ?? 0);
    const stockStatus: 'available' | 'limited' | 'out_of_stock' =
      onHand === 0 ? 'out_of_stock' : onHand < 10 ? 'limited' : 'available';
    const resolvedPrice = await resolveBuyerPrice(db, product.id, buyerId);
    const campaignPrice = priceOverrides.get(product.id) ?? null;
    const effectivePrice = campaignPrice ?? (resolvedPrice || Number(product.base_selling_price ?? product.mrp ?? 0));

    const item: BuyerCatalogItem = {
      id: product.id,
      tenant_product_id: product.id,
      campaign_id: campaignId,
      campaign_name: campaignName,
      campaign_valid_until: campaignValidUntil,
      internal_sku: product.internal_sku,
      display_name: product.name_override ?? master?.name ?? product.internal_sku,
      brand_id: tenantBrand?.master_brand_id ?? null,
      brand_name: brandName,
      gst_rate: product.gst_rate ?? master?.gst_rate ?? null,
      category_id: master?.categories?.id ?? null,
      category_name: master?.categories?.name ?? null,
      mrp: Number(product.mrp ?? 0),
      price: effectivePrice,
      resolved_price: resolvedPrice || Number(product.base_selling_price ?? product.mrp ?? 0),
      campaign_price: campaignPrice,
      has_campaign_price: campaignPrice != null,
      default_uom: product.default_uom,
      pack_size: product.pack_size,
      image_urls: (product.image_urls?.length ? product.image_urls : (master?.image_urls ?? [])) as string[],
      brand_logo_url: brandLogoUrl,
      category_image_url: master?.categories?.image_url ?? null,
      stock_status: stockStatus,
      on_hand: onHand,
    };
    out.set(product.id, item);
  }

  return out;
}
