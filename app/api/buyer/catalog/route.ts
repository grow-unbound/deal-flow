import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getVisibleBuyerCatalogs,
  requireBuyerAccessProfile,
  type BuyerVisibleCatalog,
} from '@/lib/server/buyer-access';
import type {
  BuyerCatalogItem,
  BuyerCatalogResponse,
  BuyerCatalogSummary,
} from '@/types/buyer';

const PAGE_LIMIT = 40;

async function getCatalogCounts(catalogIds: string[]) {
  if (!supabaseAdmin || catalogIds.length === 0) return new Map<string, number>();

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('published_catalog_items')
    .select('catalog_id')
    .in('catalog_id', catalogIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error(error.message);
  }

  const countByCatalog = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ catalog_id: string }>) {
    countByCatalog.set(row.catalog_id, (countByCatalog.get(row.catalog_id) ?? 0) + 1);
  }

  return countByCatalog;
}

async function resolveBuyerPrice(
  tenantProductId: string,
  buyerId: string | null,
  catalogOverride: number | null,
): Promise<number> {
  if (catalogOverride != null) {
    return Number(catalogOverride);
  }

  if (!buyerId || !supabaseAdmin) {
    return 0;
  }

  const { data, error } = await supabaseAdmin.schema('app').rpc('resolve_price', {
    p_tenant_product_id: tenantProductId,
    p_buyer_id: buyerId,
    p_qty: 1,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const context = profile.context;
    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryId = searchParams.get('category_id')?.trim() ?? '';
    const brandId = searchParams.get('brand_id')?.trim() ?? '';
    const requestedCatalogId = searchParams.get('catalog_id')?.trim() ?? '';
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? PAGE_LIMIT)), 100);
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

    let visibleCatalogs: BuyerVisibleCatalog[] = [];
    const buyer = profile.buyer;

    if (context.mode === 'preview' || !buyer) {
      const { data, error } = await supabaseAdmin
        .schema('app')
        .from('published_catalogs')
        .select('id, tenant_id, name, share_token, valid_to, created_at, scope_type, scope_value')
        .eq('tenant_id', context.tenant_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[GET /api/buyer/catalog] preview catalogs error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
      }

      visibleCatalogs = (data ?? []) as BuyerVisibleCatalog[];
    } else {
      visibleCatalogs = await getVisibleBuyerCatalogs(context.tenant_id, buyer.id);
    }

    const countByCatalog = await getCatalogCounts(visibleCatalogs.map((catalog) => catalog.id));
    const catalogs: BuyerCatalogSummary[] = visibleCatalogs.map((catalog) => ({
      id: catalog.id,
      name: catalog.name,
      product_count: countByCatalog.get(catalog.id) ?? 0,
      share_token: catalog.share_token,
      valid_until: catalog.valid_to,
    }));

    const selectedCatalog = requestedCatalogId
      ? visibleCatalogs.find((catalog) => catalog.id === requestedCatalogId) ?? null
      : visibleCatalogs[0] ?? null;

    if (!selectedCatalog) {
      const response: BuyerCatalogResponse = {
        items: [],
        total: 0,
        has_more: false,
        catalogs,
        selected_catalog_id: null,
        selected_catalog_name: null,
        selected_catalog_valid_until: null,
      };
      return NextResponse.json(response);
    }

    const { data: catalogItems, error: catalogItemsError } = await supabaseAdmin
      .schema('app')
      .from('published_catalog_items')
      .select('tenant_product_id, price_override')
      .eq('catalog_id', selectedCatalog.id)
      .is('deleted_at', null);

    if (catalogItemsError) {
      console.error('[GET /api/buyer/catalog] item query error:', catalogItemsError.message);
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
    }

    const itemRows = (catalogItems ?? []) as Array<{
      tenant_product_id: string;
      price_override: number | null;
    }>;
    const productIds = itemRows.map((row) => row.tenant_product_id);

    if (productIds.length === 0) {
      const response: BuyerCatalogResponse = {
        items: [],
        total: 0,
        has_more: false,
        catalogs,
        selected_catalog_id: selectedCatalog.id,
        selected_catalog_name: selectedCatalog.name,
        selected_catalog_valid_until: selectedCatalog.valid_to,
      };
      return NextResponse.json(response);
    }

    const { data: tenantProducts, error: productsError } = await supabaseAdmin
      .schema('app')
      .from('tenant_products')
      .select(`
        id,
        tenant_brand_id,
        master_product_id,
        internal_sku,
        name_override,
        mrp,
        base_selling_price,
        default_uom,
        pack_size,
        image_urls,
        is_active
      `)
      .in('id', productIds)
      .is('deleted_at', null)
      .eq('is_active', true);

    if (productsError) {
      console.error('[GET /api/buyer/catalog] product query error:', productsError.message);
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
    }

    const products = (tenantProducts ?? []) as Array<{
      id: string;
      tenant_brand_id: string | null;
      master_product_id: string | null;
      internal_sku: string;
      name_override: string | null;
      mrp: number | null;
      base_selling_price: number | null;
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
        ? supabaseAdmin
            .schema('catalog')
            .from('products')
            .select('id, name, image_urls, category_id, brand_id, categories(id, name, slug)')
            .in('id', masterProductIds)
        : Promise.resolve({ data: [], error: null }),
      tenantBrandIds.length > 0
        ? supabaseAdmin
            .schema('app')
            .from('tenant_brands')
            .select('id, display_name_override, master_brand_id')
            .in('id', tenantBrandIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (masterProductsRes.error || tenantBrandsRes.error) {
      console.error('[GET /api/buyer/catalog] enrichment error:', masterProductsRes.error || tenantBrandsRes.error);
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
    }

    const tenantBrandsList = (tenantBrandsRes.data ?? []) as Array<{
      id: string;
      display_name_override: string | null;
      master_brand_id: string | null;
    }>;
    const tenantBrandMap = new Map(tenantBrandsList.map((brand) => [brand.id, brand]));
    const masterProductMap = new Map(
      ((masterProductsRes.data ?? []) as Array<{
        id: string;
        name: string;
        image_urls: string[] | null;
        brand_id: string;
        categories: { id: string; name: string; slug: string } | null;
      }>).map((product) => [product.id, product]),
    );

    const masterBrandIds = Array.from(
      new Set(tenantBrandsList.map((brand) => brand.master_brand_id).filter(Boolean) as string[]),
    );
    let masterBrandMap = new Map<string, string>();
    if (masterBrandIds.length > 0) {
      const { data: masterBrands, error: masterBrandsError } = await supabaseAdmin
        .schema('catalog')
        .from('brands')
        .select('id, name')
        .in('id', masterBrandIds);

      if (masterBrandsError) {
        console.error('[GET /api/buyer/catalog] master brands error:', masterBrandsError.message);
        return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
      }

      masterBrandMap = new Map(
        ((masterBrands ?? []) as Array<{ id: string; name: string }>).map((brand) => [brand.id, brand.name]),
      );
    }

    const inventoryMap = new Map<string, number>();
    const { data: inventoryRows, error: inventoryError } = await supabaseAdmin
      .schema('app')
      .from('tenant_inventory')
      .select('tenant_product_id, qty_available')
      .in('tenant_product_id', productIds)
      .is('deleted_at', null);

    if (inventoryError) {
      console.error('[GET /api/buyer/catalog] inventory error:', inventoryError.message);
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
    }

    for (const row of (inventoryRows ?? []) as Array<{ tenant_product_id: string; qty_available: number | null }>) {
      inventoryMap.set(
        row.tenant_product_id,
        (inventoryMap.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
      );
    }

    const priceOverrideByProductId = new Map(
      itemRows.map((row) => [row.tenant_product_id, row.price_override]),
    );

    const itemsWithPrices = await Promise.all(products.map(async (product) => {
      const master = product.master_product_id
        ? masterProductMap.get(product.master_product_id) ?? null
        : null;
      const tenantBrand = product.tenant_brand_id
        ? tenantBrandMap.get(product.tenant_brand_id) ?? null
        : null;
      const brandName =
        tenantBrand?.display_name_override
        ?? (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id) ?? null : null)
        ?? null;
      const onHand = Math.max(0, inventoryMap.get(product.id) ?? 0);
      const stockStatus: 'available' | 'limited' | 'out_of_stock' =
        onHand === 0 ? 'out_of_stock' : onHand < 10 ? 'limited' : 'available';
      const resolvedPrice = await resolveBuyerPrice(
        product.id,
        buyer?.id ?? null,
        priceOverrideByProductId.get(product.id) ?? null,
      );

      return {
        id: product.id,
        tenant_product_id: product.id,
        catalog_id: selectedCatalog.id,
        catalog_name: selectedCatalog.name,
        catalog_valid_until: selectedCatalog.valid_to,
        internal_sku: product.internal_sku,
        display_name: product.name_override ?? master?.name ?? product.internal_sku,
        brand_id: tenantBrand?.master_brand_id ?? null,
        brand_name: brandName,
        category_id: master?.categories?.id ?? null,
        category_name: master?.categories?.name ?? null,
        mrp: Number(product.mrp ?? 0),
        price: resolvedPrice || Number(product.base_selling_price ?? product.mrp ?? 0),
        default_uom: product.default_uom,
        pack_size: product.pack_size,
        image_urls: (product.image_urls?.length ? product.image_urls : (master?.image_urls ?? [])) as string[],
        stock_status: stockStatus,
        on_hand: onHand,
      } satisfies BuyerCatalogItem;
    }));

    let filteredItems = itemsWithPrices;
    if (search) {
      filteredItems = filteredItems.filter((item) =>
        item.display_name.toLowerCase().includes(search)
        || item.internal_sku.toLowerCase().includes(search)
        || (item.brand_name?.toLowerCase().includes(search) ?? false)
        || (item.category_name?.toLowerCase().includes(search) ?? false),
      );
    }
    if (categoryId) {
      filteredItems = filteredItems.filter((item) => item.category_id === categoryId);
    }
    if (brandId) {
      filteredItems = filteredItems.filter((item) => item.brand_id === brandId);
    }

    const total = filteredItems.length;
    const pageItems = filteredItems.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    const response: BuyerCatalogResponse = {
      items: pageItems,
      total,
      has_more: hasMore,
      catalogs,
      selected_catalog_id: selectedCatalog.id,
      selected_catalog_name: selectedCatalog.name,
      selected_catalog_valid_until: selectedCatalog.valid_to,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[GET /api/buyer/catalog] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
