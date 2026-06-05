import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getBuyerAppContext } from '@/lib/auth';
import type { BuyerCategoriesResponse } from '@/types/buyer';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const context = await getBuyerAppContext(req);

    if (!context.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = context.tenant_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    // Get active tenant products with their master product category info
    const { data: products, error } = await db
      .schema('app')
      .from('tenant_products')
      .select('id, master_product_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .is('is_active', true);

    if (error) {
      console.error('[GET /api/buyer/categories] DB error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    const masterProductIds = (products ?? [])
      .filter((p: { master_product_id: string | null }) => p.master_product_id)
      .map((p: { master_product_id: string }) => p.master_product_id);

    if (masterProductIds.length === 0) {
      const body: BuyerCategoriesResponse = { categories: [] };
      return NextResponse.json(body);
    }

    // Get categories from master products
    const { data: catalogProducts, error: catError } = await db
      .schema('catalog')
      .from('products')
      .select('category_id, categories(id, name, slug)')
      .in('id', masterProductIds)
      .not('category_id', 'is', null);

    if (catError) {
      console.error('[GET /api/buyer/categories] catalog DB error:', catError.message);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    // Count products per category
    const countMap = new Map<string, number>();
    const categoryMeta = new Map<string, { id: string; name: string; slug: string }>();

    for (const row of catalogProducts ?? []) {
      const cat = row.categories as { id: string; name: string; slug: string } | null;
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
