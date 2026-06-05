import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { BuyerCatalogItem } from '@/types/buyer';

interface GuestCatalogItem {
  id: string;
  tenant_product_id: string;
  catalog_id: string;
  catalog_name: string;
  catalog_valid_until: string | null;
  internal_sku: string | null;
  display_name: string;
  brand_id: string | null;
  brand_name: string;
  category_id: string | null;
  category_name: string | null;
  price: number;
  mrp: number;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[];
  stock_status: 'available' | 'limited' | 'out_of_stock';
  on_hand: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ share_token: string }> }
) {
  const { share_token } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin;

  // Resolve catalog by share_token — must be published and not deleted
  const { data: catalog, error: catalogError } = await db
    .schema('app')
    .from('published_catalogs')
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
    .from('published_catalog_items')
    .select('tenant_product_id, price_override, display_order')
    .eq('catalog_id', catalog.id)
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('[GET /api/buyer/catalog/:share_token] items error:', itemsError);
    return NextResponse.json({ error: 'Failed to load catalog items' }, { status: 500 });
  }

  const items = catalogItems ?? [];
  const tenantProductIds = items.map((item) => item.tenant_product_id);

  if (tenantProductIds.length === 0) {
    return NextResponse.json({
      catalog_id: catalog.id,
      name: catalog.name,
      products_count: 0,
      items: [],
    });
  }

  // Fetch tenant products
  const { data: tenantProducts, error: productsError } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, tenant_brand_id, master_product_id, mrp, base_selling_price, default_uom, pack_size, image_urls')
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
    default_uom: string | null;
    pack_size: number | null;
    image_urls: string[] | null;
  }>;

  // Fetch tenant brands
  const tenantBrandIds = Array.from(new Set(products.map((p) => p.tenant_brand_id).filter(Boolean))) as string[];

  let brandNameById = new Map<string, string>();
  let brandIdByTenantBrandId = new Map<string, string | null>();

  if (tenantBrandIds.length > 0) {
    const { data: tenantBrands, error: brandsError } = await db
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id')
      .in('id', tenantBrandIds)
      .is('deleted_at', null);

    if (brandsError) {
      console.error('[GET /api/buyer/catalog/:share_token] brands error:', brandsError);
    } else {
      const tenantBrandRows = (tenantBrands ?? []) as Array<{
        id: string;
        display_name_override: string | null;
        master_brand_id: string;
      }>;

      const masterBrandIds = Array.from(new Set(tenantBrandRows.map((b) => b.master_brand_id)));
      let masterBrandById = new Map<string, string>();

      if (masterBrandIds.length > 0) {
        const { data: masterBrands } = await db
          .schema('catalog')
          .from('brands')
          .select('id, name')
          .in('id', masterBrandIds)
          .is('deleted_at', null);

        masterBrandById = new Map(
          ((masterBrands ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name])
        );
      }

      brandNameById = new Map(
        tenantBrandRows.map((b) => [
          b.id,
          b.display_name_override ?? masterBrandById.get(b.master_brand_id) ?? 'Unknown brand',
        ])
      );
      brandIdByTenantBrandId = new Map(tenantBrandRows.map((b) => [b.id, b.master_brand_id ?? null]));
    }
  }

  const masterProductIds = Array.from(new Set(products.map((p) => p.master_product_id).filter(Boolean))) as string[];
  let masterProductById = new Map<string, { category_id: string | null; category_name: string | null; image_urls: string[] | null }>();

  if (masterProductIds.length > 0) {
    const { data: masterProducts } = await db
      .schema('catalog')
      .from('products')
      .select('id, category_id, image_urls')
      .in('id', masterProductIds)
      .is('deleted_at', null);

    const categoryIds = Array.from(
      new Set(((masterProducts ?? []) as Array<{ category_id: string | null }>).map((product) => product.category_id).filter(Boolean))
    ) as string[];

    let categoryNameById = new Map<string, string>();
    if (categoryIds.length > 0) {
      const { data: categories } = await db
        .schema('catalog')
        .from('categories')
        .select('id, name')
        .in('id', categoryIds)
        .is('deleted_at', null);

      categoryNameById = new Map(((categories ?? []) as Array<{ id: string; name: string }>).map((category) => [category.id, category.name]));
    }

    masterProductById = new Map(
      ((masterProducts ?? []) as Array<{ id: string; category_id: string | null; image_urls: string[] | null }>).map((product) => [
        product.id,
        {
          category_id: product.category_id,
          category_name: product.category_id ? (categoryNameById.get(product.category_id) ?? null) : null,
          image_urls: product.image_urls ?? [],
        },
      ])
    );
  }

  // Fetch inventory for in-stock status
  const { data: inventoryData } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available')
    .in('tenant_product_id', tenantProductIds)
    .is('deleted_at', null);

  const inventoryByProductId = new Map(
    ((inventoryData ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>).map((inv) => [
      inv.tenant_product_id,
      inv,
    ])
  );

  // Build price override map
  const priceOverrideByProductId = new Map(
    items
      .filter((item) => item.price_override != null)
      .map((item) => [item.tenant_product_id, item.price_override as number])
  );

  const productById = new Map(products.map((p) => [p.id, p]));

  const guestItems: GuestCatalogItem[] = items
    .map((item) => {
      const product = productById.get(item.tenant_product_id);
      if (!product) return null;

      const brandName = product.tenant_brand_id
        ? (brandNameById.get(product.tenant_brand_id) ?? 'Unknown brand')
        : 'Unknown brand';
      const brandId = product.tenant_brand_id ? (brandIdByTenantBrandId.get(product.tenant_brand_id) ?? null) : null;
      const masterProduct = product.master_product_id ? (masterProductById.get(product.master_product_id) ?? null) : null;

      const inv = inventoryByProductId.get(item.tenant_product_id);
      const onHand = Math.max(0, Number(inv?.qty_available ?? 0));
      const price =
        priceOverrideByProductId.get(item.tenant_product_id) ??
        Number(product.base_selling_price ?? 0);
      const stockStatus: BuyerCatalogItem['stock_status'] =
        onHand === 0 ? 'out_of_stock' : onHand < 10 ? 'limited' : 'available';

      return {
        id: product.id,
        tenant_product_id: product.id,
        catalog_id: catalog.id,
        catalog_name: catalog.name,
        catalog_valid_until: catalog.valid_to,
        internal_sku: product.internal_sku,
        display_name: product.name_override ?? product.internal_sku ?? 'Unknown product',
        brand_id: brandId,
        brand_name: brandName,
        category_id: masterProduct?.category_id ?? null,
        category_name: masterProduct?.category_name ?? null,
        price,
        mrp: Number(product.mrp ?? 0),
        default_uom: product.default_uom,
        pack_size: product.pack_size,
        image_urls: product.image_urls?.length ? product.image_urls : (masterProduct?.image_urls ?? []),
        stock_status: stockStatus,
        on_hand: onHand,
      };
    })
    .filter((item): item is GuestCatalogItem => item !== null);

  return NextResponse.json({
    catalog_id: catalog.id,
    name: catalog.name,
    valid_until: catalog.valid_to,
    products_count: guestItems.length,
    items: guestItems,
  });
}
