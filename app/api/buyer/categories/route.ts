import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVisibleBuyerCatalogs, requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import type { BuyerCategoriesResponse } from '@/types/buyer';

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
    const shareToken = req.nextUrl.searchParams.get('share_token')?.trim() ?? '';
    const selectedCatalogId = req.nextUrl.searchParams.get('catalog_id')?.trim() ?? '';

    let catalogIds: string[] = [];

    if (shareToken) {
      const { data: catalog, error } = await supabaseAdmin
        .schema('app')
        .from('published_catalogs')
        .select('id')
        .eq('share_token', shareToken)
        .eq('status', 'published')
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        console.error('[GET /api/buyer/categories] share catalog error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
      }

      catalogIds = catalog?.id ? [catalog.id] : [];
    } else if (selectedCatalogId) {
      catalogIds = [selectedCatalogId];
    } else if (context.mode === 'preview' || !profile.buyer) {
      const { data: catalogs, error } = await supabaseAdmin
        .schema('app')
        .from('published_catalogs')
        .select('id')
        .eq('tenant_id', context.tenant_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`);

      if (error) {
        console.error('[GET /api/buyer/categories] preview catalog error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
      }

      catalogIds = ((catalogs ?? []) as Array<{ id: string }>).map((catalog) => catalog.id);
    } else if (profile.buyer) {
      const catalogs = await getVisibleBuyerCatalogs(context.tenant_id, profile.buyer.id);
      catalogIds = selectedCatalogId
        ? catalogs.filter((catalog) => catalog.id === selectedCatalogId).map((catalog) => catalog.id)
        : catalogs.slice(0, 1).map((catalog) => catalog.id);
    } else {
      catalogIds = [];
    }

    if (catalogIds.length === 0) {
      const body: BuyerCategoriesResponse = { categories: [] };
      return NextResponse.json(body);
    }

    const { data: catalogItems, error: itemsError } = await supabaseAdmin
      .schema('app')
      .from('published_catalog_items')
      .select('tenant_product_id')
      .in('catalog_id', catalogIds)
      .is('deleted_at', null);

    if (itemsError) {
      console.error('[GET /api/buyer/categories] items error:', itemsError.message);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    const productIds = ((catalogItems ?? []) as Array<{ tenant_product_id: string }>).map(
      (item) => item.tenant_product_id,
    );

    if (productIds.length === 0) {
      const body: BuyerCategoriesResponse = { categories: [] };
      return NextResponse.json(body);
    }

    const { data: tenantProducts, error: tenantProductsError } = await supabaseAdmin
      .schema('app')
      .from('tenant_products')
      .select('id, master_product_id')
      .in('id', productIds)
      .is('deleted_at', null)
      .eq('is_active', true);

    if (tenantProductsError) {
      console.error('[GET /api/buyer/categories] tenant products error:', tenantProductsError.message);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    const masterProductIds = ((tenantProducts ?? []) as Array<{ master_product_id: string | null }>)
      .map((product) => product.master_product_id)
      .filter((value): value is string => Boolean(value));

    if (masterProductIds.length === 0) {
      const body: BuyerCategoriesResponse = { categories: [] };
      return NextResponse.json(body);
    }

    const { data: catalogProducts, error: catError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('category_id, categories(id, name, slug)')
      .in('id', masterProductIds)
      .not('category_id', 'is', null);

    if (catError) {
      console.error('[GET /api/buyer/categories] catalog DB error:', catError.message);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    const countMap = new Map<string, number>();
    const categoryMeta = new Map<string, { id: string; name: string; slug: string }>();

    for (const row of catalogProducts ?? []) {
      const cat = row.categories as unknown as { id: string; name: string; slug: string } | null;
      if (!cat) continue;
      countMap.set(cat.id, (countMap.get(cat.id) ?? 0) + 1);
      if (!categoryMeta.has(cat.id)) {
        categoryMeta.set(cat.id, cat);
      }
    }

    const categories = Array.from(categoryMeta.values())
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        product_count: countMap.get(cat.id) ?? 0,
      }))
      .sort((a, b) => b.product_count - a.product_count);

    const body: BuyerCategoriesResponse = { categories };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[GET /api/buyer/categories] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
