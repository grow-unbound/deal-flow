import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface GuestCatalogItem {
  id: string;
  name: string;
  internal_sku: string | null;
  brand: string;
  price: number;
  mrp: number;
  unit: string | null;
  image_url: string | null;
  in_stock: boolean;
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
    .select('id, internal_sku, name_override, tenant_brand_id, mrp, base_selling_price, unit, image_url')
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
    mrp: number | null;
    base_selling_price: number | null;
    unit: string | null;
    image_url: string | null;
  }>;

  // Fetch tenant brands
  const tenantBrandIds = Array.from(new Set(products.map((p) => p.tenant_brand_id).filter(Boolean))) as string[];

  let brandNameById = new Map<string, string>();

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
    }
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

      const inv = inventoryByProductId.get(item.tenant_product_id);
      const inStock = Number(inv?.qty_available ?? 0) > 0;
      const price =
        priceOverrideByProductId.get(item.tenant_product_id) ??
        Number(product.base_selling_price ?? 0);

      return {
        id: product.id,
        name: product.name_override ?? product.internal_sku ?? 'Unknown product',
        internal_sku: product.internal_sku,
        brand: brandName,
        price,
        mrp: Number(product.mrp ?? 0),
        unit: product.unit,
        image_url: product.image_url,
        in_stock: inStock,
      };
    })
    .filter((item): item is GuestCatalogItem => item !== null);

  return NextResponse.json({
    catalog_id: catalog.id,
    name: catalog.name,
    products_count: guestItems.length,
    items: guestItems,
  });
}
