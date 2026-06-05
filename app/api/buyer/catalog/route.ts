import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getBuyerAppContext } from '@/lib/auth';
import type { BuyerCatalogItem, BuyerCatalogResponse } from '@/types/buyer';

const PAGE_LIMIT = 40;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const context = await getBuyerAppContext(req);

    if (!context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search')?.trim() ?? '';
    const categoryId = searchParams.get('category_id')?.trim() ?? '';
    const brandId = searchParams.get('brand_id')?.trim() ?? '';
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? PAGE_LIMIT)), 100);
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

    const tenantId = context.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Fetch active tenant products with brand/category enrichment
    let query = db
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
        default_uom,
        pack_size,
        image_urls,
        is_active
      `,
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .is('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: rawProducts, error, count } = await query;

    if (error) {
      console.error('[GET /api/buyer/catalog] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
    }

    const products = rawProducts ?? [];

    // Gather IDs for enrichment
    const masterProductIds = products
      .filter((p: { master_product_id: string | null }) => p.master_product_id)
      .map((p: { master_product_id: string }) => p.master_product_id);

    const tenantBrandIds = Array.from(
      new Set(
        products
          .filter((p: { tenant_brand_id: string | null }) => p.tenant_brand_id)
          .map((p: { tenant_brand_id: string }) => p.tenant_brand_id),
      ),
    );

    // Parallel enrichment fetches
    const [masterProductsRes, tenantBrandsRes] = await Promise.all([
      masterProductIds.length > 0
        ? db
            .schema('catalog')
            .from('products')
            .select('id, name, image_urls, category_id, brand_id, categories(id, name, slug)')
            .in('id', masterProductIds)
        : Promise.resolve({ data: [], error: null }),
      tenantBrandIds.length > 0
        ? db
            .schema('app')
            .from('tenant_brands')
            .select('id, display_name_override, master_brand_id')
            .in('id', tenantBrandIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const masterProductMap = new Map<
      string,
      {
        id: string;
        name: string;
        image_urls: string[] | null;
        category_id: string | null;
        brand_id: string;
        categories: { id: string; name: string; slug: string } | null;
      }
    >(
      (masterProductsRes.data ?? []).map(
        (p: {
          id: string;
          name: string;
          image_urls: string[] | null;
          category_id: string | null;
          brand_id: string;
          categories: { id: string; name: string; slug: string } | null;
        }) => [p.id, p],
      ),
    );

    const tenantBrandsList: Array<{
      id: string;
      display_name_override: string | null;
      master_brand_id: string | null;
    }> = tenantBrandsRes.data ?? [];

    // Fetch master brand names for tenant brands
    const masterBrandIds = Array.from(
      new Set(tenantBrandsList.map((b) => b.master_brand_id).filter(Boolean) as string[]),
    );
    let masterBrandMap = new Map<string, string>();
    if (masterBrandIds.length > 0) {
      const { data: masterBrands } = await db
        .schema('catalog')
        .from('brands')
        .select('id, name')
        .in('id', masterBrandIds);
      masterBrandMap = new Map<string, string>(
        (masterBrands ?? []).map((b: { id: string; name: string }) => [b.id, b.name]),
      );
    }

    const tenantBrandMap = new Map(tenantBrandsList.map((b) => [b.id, b]));

    // Fetch inventory for on_hand
    const productIds = products.map((p: { id: string }) => p.id);
    const inventoryMap = new Map<string, number>();
    if (productIds.length > 0) {
      const { data: inventoryRows } = await db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available')
        .in('tenant_product_id', productIds)
        .is('deleted_at', null);
      for (const row of inventoryRows ?? []) {
        const qty = Number(row.qty_available ?? 0);
        inventoryMap.set(row.tenant_product_id, (inventoryMap.get(row.tenant_product_id) ?? 0) + qty);
      }
    }

    // Build enriched items
    let items: BuyerCatalogItem[] = products.map(
      (p: {
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
      }) => {
        const master = p.master_product_id ? masterProductMap.get(p.master_product_id) ?? null : null;
        const tenantBrand = p.tenant_brand_id ? tenantBrandMap.get(p.tenant_brand_id) ?? null : null;
        const brandName =
          tenantBrand?.display_name_override ??
          (tenantBrand?.master_brand_id ? masterBrandMap.get(tenantBrand.master_brand_id) ?? null : null) ??
          null;

        const onHand = Math.max(0, inventoryMap.get(p.id) ?? 0);
        const stockStatus: 'available' | 'limited' | 'out_of_stock' =
          onHand === 0 ? 'out_of_stock' : onHand < 10 ? 'limited' : 'available';

        return {
          id: p.id,
          tenant_product_id: p.id,
          catalog_id: null,
          catalog_name: null,
          catalog_valid_until: null,
          internal_sku: p.internal_sku,
          display_name: p.name_override ?? master?.name ?? p.internal_sku,
          brand_id: tenantBrand?.master_brand_id ?? null,
          brand_name: brandName,
          category_id: master?.categories?.id ?? null,
          category_name: master?.categories?.name ?? null,
          mrp: Number(p.mrp ?? 0),
          price: Number(p.base_selling_price ?? p.mrp ?? 0),
          default_uom: p.default_uom,
          pack_size: p.pack_size,
          image_urls: (p.image_urls?.length ? p.image_urls : (master?.image_urls ?? [])) as string[],
          stock_status: stockStatus,
          on_hand: onHand,
        } satisfies BuyerCatalogItem;
      },
    );

    // Apply filters client-side after enrichment (simpler than trying to do multi-schema joins in Supabase)
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (item) =>
          item.display_name.toLowerCase().includes(q) ||
          item.internal_sku.toLowerCase().includes(q) ||
          (item.brand_name?.toLowerCase().includes(q) ?? false) ||
          (item.category_name?.toLowerCase().includes(q) ?? false),
      );
    }
    if (categoryId) {
      items = items.filter((item) => item.category_id === categoryId);
    }
    if (brandId) {
      items = items.filter((item) => item.brand_id === brandId);
    }

    const total = count ?? items.length;
    const hasMore = offset + limit < total;

    const response: BuyerCatalogResponse = {
      items,
      total,
      has_more: hasMore,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[GET /api/buyer/catalog] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
