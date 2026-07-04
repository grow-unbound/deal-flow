import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerCatalogItem } from '@/types/buyer';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { getSelectedBuyerDeliveryFromRequest } from '@/lib/server/buyer-location-selection';
import { resolveNearestBuyerLocation } from '@/lib/server/buyer-routing';

interface GuestCatalogItem {
  id: string;
  tenant_product_id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_valid_until: string | null;
  internal_sku: string | null;
  display_name: string;
  brand_id: string | null;
  brand_name: string;
  category_id: string | null;
  category_name: string | null;
  gst_rate: number | null;
  price: number;
  resolved_price: number;
  campaign_price: number | null;
  has_campaign_price: boolean;
  mrp: number;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[];
  brand_logo_url: string | null;
  category_image_url: string | null;
  stock_status: 'available' | 'limited' | 'out_of_stock';
  on_hand: number;
  is_featured: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ share_token: string }> }
) {
  const { share_token } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin;
  const profile = await requireBuyerAccessProfile(request).catch(() => null);

  // Resolve catalog by share_token — must be published and not deleted
  const { data: catalog, error: catalogError } = await db
    .schema('app')
    .from('campaigns')
    .select('id, name, tenant_id, status, valid_to')
    .eq('share_token', share_token)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle();

  if (catalogError) {
    console.error('[GET /api/buyer/catalog/:share_token] catalog lookup error:', catalogError);
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
  }

  if (!catalog) {
    return NextResponse.json({ error: 'Catalog not found or not active' }, { status: 404 });
  }

  // Check if catalog is still valid (not expired)
  if (catalog.valid_to && new Date(catalog.valid_to).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Catalog has expired' }, { status: 404 });
  }

  // Fetch catalog items
  const { data: catalogItems, error: itemsError } = await db
    .schema('app')
    .from('campaign_items')
    .select('tenant_product_id, price_override, display_order, is_featured')
    .eq('campaign_id', catalog.id)
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('[GET /api/buyer/catalog/:share_token] items error:', itemsError);
    return NextResponse.json({ error: 'Failed to load catalog items' }, { status: 500 });
  }

  const items = (catalogItems ?? []) as Array<{
    tenant_product_id: string;
    price_override: number | null;
    display_order: number | null;
    is_featured: boolean | null;
  }>;
  const tenantProductIds = items.map((item) => item.tenant_product_id);

  const featuredByProductId = new Map(
    items.map((row) => [row.tenant_product_id, Boolean(row.is_featured)]),
  );

  if (tenantProductIds.length === 0) {
    return NextResponse.json({
      campaign_id: catalog.id,
      name: catalog.name,
      products_count: 0,
      items: [],
    });
  }

  const selectedDelivery = getSelectedBuyerDeliveryFromRequest(request);
  const resolvedRouting = await resolveNearestBuyerLocation(
    db as any,
    catalog.tenant_id,
    selectedDelivery,
  );
  const inventoryWarehouseId = resolvedRouting?.warehouseId ?? null;

  // Fetch tenant products
  const { data: tenantProducts, error: productsError } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, tenant_brand_id, master_product_id, mrp, base_selling_price, gst_rate, default_uom, pack_size, image_urls')
    .in('id', tenantProductIds)
    .is('deleted_at', null);

  if (productsError) {
    console.error('[GET /api/buyer/catalog/:share_token] products error:', productsError);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const products = (tenantProducts ?? []) as Array<{
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
  }>;

  // Fetch tenant brands
  const tenantBrandIds = Array.from(new Set(products.map((p) => p.tenant_brand_id).filter(Boolean))) as string[];

  let brandNameById = new Map<string, string>();
  let brandLogoById = new Map<string, string | null>();
  let brandIdByTenantBrandId = new Map<string, string | null>();

  if (tenantBrandIds.length > 0) {
    const { data: tenantBrands, error: brandsError } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id, logo_url')
      .in('id', tenantBrandIds)
      .is('deleted_at', null);

    if (brandsError) {
      console.error('[GET /api/buyer/catalog/:share_token] brands error:', brandsError);
    } else {
      const tenantBrandRows = (tenantBrands ?? []) as Array<{
        id: string;
        display_name_override: string | null;
        master_brand_id: string;
        logo_url: string | null;
      }>;

      const masterBrandIds = Array.from(new Set(tenantBrandRows.map((b) => b.master_brand_id)));
      let masterBrandById = new Map<string, { name: string; logo_url: string | null }>();

      if (masterBrandIds.length > 0) {
        const { data: masterBrands } = await db
          .schema('catalog')
          .from('brands')
          .select('id, name, logo_url')
          .in('id', masterBrandIds)
          .is('deleted_at', null);

        masterBrandById = new Map(
          ((masterBrands ?? []) as Array<{ id: string; name: string; logo_url: string | null }>).map((b) => [b.id, { name: b.name, logo_url: b.logo_url }])
        );
      }

      brandNameById = new Map(
        tenantBrandRows.map((b) => [
          b.id,
          b.display_name_override ?? masterBrandById.get(b.master_brand_id)?.name ?? 'Unknown brand',
        ])
      );
      brandLogoById = new Map(
        tenantBrandRows.map((b) => [
          b.id,
          b.logo_url ?? masterBrandById.get(b.master_brand_id)?.logo_url ?? null,
        ])
      );
      brandIdByTenantBrandId = new Map(tenantBrandRows.map((b) => [b.id, b.master_brand_id ?? null]));
    }
  }

  const masterProductIds = Array.from(new Set(products.map((p) => p.master_product_id).filter(Boolean))) as string[];
  let masterProductById = new Map<string, { category_id: string | null; category_name: string | null; category_image_url: string | null; image_urls: string[] | null }>();

  if (masterProductIds.length > 0) {
    const { data: masterProducts } = await db
      .schema('catalog')
      .from('products')
      .select('id, category_id, image_urls, gst_rate')
      .in('id', masterProductIds)
      .is('deleted_at', null);

    const categoryIds = Array.from(
      new Set(((masterProducts ?? []) as Array<{ category_id: string | null }>).map((product) => product.category_id).filter(Boolean))
    ) as string[];

    let categoryInfoById = new Map<string, { name: string; image_url: string | null }>();
    if (categoryIds.length > 0) {
      const { data: categories } = await db
        .schema('catalog')
        .from('categories')
        .select('id, name, image_url')
        .in('id', categoryIds)
        .is('deleted_at', null);

      categoryInfoById = new Map(((categories ?? []) as Array<{ id: string; name: string; image_url: string | null }>).map((category) => [category.id, { name: category.name, image_url: category.image_url }]));
    }

    masterProductById = new Map(
      ((masterProducts ?? []) as Array<{ id: string; category_id: string | null; image_urls: string[] | null }>).map((product) => [
        product.id,
        {
          category_id: product.category_id,
          category_name: product.category_id ? (categoryInfoById.get(product.category_id)?.name ?? null) : null,
          category_image_url: product.category_id ? (categoryInfoById.get(product.category_id)?.image_url ?? null) : null,
          image_urls: product.image_urls ?? [],
        },
      ])
    );
  }

  // Fetch inventory for in-stock status
  let inventoryQuery = db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available, warehouse_id')
    .in('tenant_product_id', tenantProductIds)
    .is('deleted_at', null);

  if (inventoryWarehouseId) {
    inventoryQuery = inventoryQuery.eq('warehouse_id', inventoryWarehouseId);
  }

  const { data: inventoryData } = await inventoryQuery;

  const inventoryByProductId = new Map<string, number>();
  for (const inv of ((inventoryData ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>)) {
    inventoryByProductId.set(
      inv.tenant_product_id,
      (inventoryByProductId.get(inv.tenant_product_id) ?? 0) + Number(inv.qty_available ?? 0),
    );
  }

  // Build price override map
  const priceOverrideByProductId = new Map(
    items
      .filter((item) => item.price_override != null)
      .map((item) => [item.tenant_product_id, item.price_override as number])
  );

  const productById = new Map(products.map((p) => [p.id, p]));

  const guestItems = (await Promise.all(items.map(async (item) => {
      const product = productById.get(item.tenant_product_id);
      if (!product) return null;

      const brandName = product.tenant_brand_id
        ? (brandNameById.get(product.tenant_brand_id) ?? 'Unknown brand')
        : 'Unknown brand';
      const brandLogoUrl = product.tenant_brand_id ? (brandLogoById.get(product.tenant_brand_id) ?? null) : null;
      const brandId = product.tenant_brand_id ? (brandIdByTenantBrandId.get(product.tenant_brand_id) ?? null) : null;
      const masterProduct = product.master_product_id ? (masterProductById.get(product.master_product_id) ?? null) : null;

      const onHand = Math.max(0, Number(inventoryByProductId.get(item.tenant_product_id) ?? 0));
      let resolvedPrice = Number(product.base_selling_price ?? 0);
      if (profile?.buyer?.id) {
        const { data: resolvedPriceData } = await db.schema('app').rpc('resolve_price', {
          p_tenant_product_id: item.tenant_product_id,
          p_buyer_id: profile.buyer.id,
          p_qty: 1,
        });
        resolvedPrice = Number(resolvedPriceData ?? resolvedPrice);
      }
      const campaignPrice = priceOverrideByProductId.get(item.tenant_product_id) ?? null;
      const price = campaignPrice ?? resolvedPrice;
      const stockStatus: BuyerCatalogItem['stock_status'] =
        onHand === 0 ? 'out_of_stock' : onHand < 10 ? 'limited' : 'available';

      return {
        id: product.id,
        tenant_product_id: product.id,
        campaign_id: catalog.id,
        campaign_name: catalog.name,
        campaign_valid_until: catalog.valid_to,
        internal_sku: product.internal_sku,
        display_name: product.name_override ?? product.internal_sku ?? 'Unknown product',
        brand_id: brandId,
        brand_name: brandName,
        category_id: masterProduct?.category_id ?? null,
        category_name: masterProduct?.category_name ?? null,
        gst_rate: product.gst_rate ?? null,
        price,
        resolved_price: resolvedPrice,
        campaign_price: campaignPrice,
        has_campaign_price: campaignPrice != null,
        mrp: Number(product.mrp ?? 0),
        default_uom: product.default_uom,
        pack_size: product.pack_size,
        image_urls: product.image_urls?.length ? product.image_urls : (masterProduct?.image_urls ?? []),
        brand_logo_url: brandLogoUrl,
        category_image_url: masterProduct?.category_image_url ?? null,
        stock_status: stockStatus,
        on_hand: onHand,
        is_featured: featuredByProductId.get(item.tenant_product_id) ?? false,
      };
    }))).filter((item): item is GuestCatalogItem => item !== null);

  return NextResponse.json({
    campaign_id: catalog.id,
    name: catalog.name,
    valid_until: catalog.valid_to,
    products_count: guestItems.length,
    items: guestItems,
  });
}
