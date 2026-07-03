import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveBuyerAllowedTenantBrandIds } from '@/lib/server/buyer-brand-visibility';
import { requireBuyerAccessProfile } from '@/lib/server/buyer-access';
import { BUYER_CACHE_CATALOG } from '@/lib/server/buyer-cache-headers';
import type { BuyerCategoriesResponse } from '@/types/buyer';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const profile = await requireBuyerAccessProfile(req);
    if (!profile?.context.tenant_id || !supabaseAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = profile.context.tenant_id;
    const buyerId = profile.buyer?.id ?? null;
    const allowedTenantBrandIds = buyerId
      ? await resolveBuyerAllowedTenantBrandIds(supabaseAdmin as any, tenantId, buyerId)
      : null;

    let tenantProductsQuery = supabaseAdmin
      .schema('app')
      .from('tenant_products')
      .select('master_product_id, tenant_brand_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (Array.isArray(allowedTenantBrandIds)) {
      if (allowedTenantBrandIds.length === 0) {
        return NextResponse.json({ categories: [] } satisfies BuyerCategoriesResponse, { headers: BUYER_CACHE_CATALOG });
      }
      tenantProductsQuery = tenantProductsQuery.in('tenant_brand_id', allowedTenantBrandIds);
    }

    const { data: tenantProducts, error: tenantProductsError } = await tenantProductsQuery;
    if (tenantProductsError) throw new Error(tenantProductsError.message);

    const masterProductIds = ((tenantProducts ?? []) as Array<{ master_product_id: string | null }>)
      .map((row) => row.master_product_id)
      .filter((value): value is string => Boolean(value));
    if (masterProductIds.length === 0) {
      return NextResponse.json({ categories: [] } satisfies BuyerCategoriesResponse, { headers: BUYER_CACHE_CATALOG });
    }

    const { data: catalogProducts, error: catalogProductsError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('category_id, categories(id, name, slug, image_url)')
      .in('id', masterProductIds)
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

    const categories = Array.from(categoryMap.values())
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image_url: category.image_url,
        product_count: countMap.get(category.id) ?? 0,
      }))
      .sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ categories } satisfies BuyerCategoriesResponse, { headers: BUYER_CACHE_CATALOG });
  } catch (err) {
    console.error('[GET /api/buyer/categories]', err);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}
