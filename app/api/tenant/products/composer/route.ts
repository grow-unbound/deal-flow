import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';

const COMPOSER_SAFETY_CAP = 2000;

interface ProductRow {
  id: string;
  internal_sku: string;
  name_override: string | null;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  is_active: boolean;
}

interface TenantBrandRow {
  id: string;
  display_name_override: string | null;
}

/**
 * GET /api/tenant/products/composer
 * Returns all active tenant products (no pagination, safety cap at 2000) plus
 * server-computed brand/category facet counts for the PriceList composer.
 */
export async function GET(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canViewCost = claims.role === 'seller_admin';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const [productsRes, brandFacetRes, categoryFacetRes] = await Promise.all([
    db
      .schema('app')
      .from('tenant_products')
      .select('id, internal_sku, name_override, tenant_brand_id, tenant_category_id, mrp, base_selling_price, cost_price, is_active')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name_override', { ascending: true, nullsFirst: false })
      .order('internal_sku', { ascending: true })
      .limit(COMPOSER_SAFETY_CAP),
    // Brand facet counts — all products, no pagination cap
    db
      .schema('app')
      .from('tenant_products')
      .select('tenant_brand_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('tenant_brand_id', 'is', null),
    // Category facet counts — all products, no pagination cap
    db
      .schema('app')
      .from('tenant_products')
      .select('tenant_category_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('tenant_category_id', 'is', null),
  ]);

  if (productsRes.error) {
    console.error('[GET /api/tenant/products/composer] products error:', productsRes.error.message);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const products = (productsRes.data ?? []) as ProductRow[];

  // Build brand + category count maps
  const brandCountMap = new Map<string, number>();
  for (const row of (brandFacetRes.data ?? []) as Array<{ tenant_brand_id: string | null }>) {
    if (row.tenant_brand_id) {
      brandCountMap.set(row.tenant_brand_id, (brandCountMap.get(row.tenant_brand_id) ?? 0) + 1);
    }
  }
  const categoryCountMap = new Map<string, number>();
  for (const row of (categoryFacetRes.data ?? []) as Array<{ tenant_category_id: string | null }>) {
    if (row.tenant_category_id) {
      categoryCountMap.set(row.tenant_category_id, (categoryCountMap.get(row.tenant_category_id) ?? 0) + 1);
    }
  }

  // Resolve brand names for all facet brand IDs
  const allBrandIds = Array.from(new Set([
    ...products.map((p) => p.tenant_brand_id).filter(Boolean) as string[],
    ...brandCountMap.keys(),
  ]));
  const brandsRes = allBrandIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override')
        .in('id', allBrandIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  const brandById = new Map(
    ((brandsRes.data ?? []) as TenantBrandRow[]).map((b) => [b.id, b.display_name_override?.trim() || 'Brand']),
  );

  // Resolve category names for all facet category IDs
  const allCategoryIds = Array.from(new Set([
    ...products.map((p) => p.tenant_category_id).filter(Boolean) as string[],
    ...categoryCountMap.keys(),
  ]));
  const categoriesRes = allCategoryIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_categories')
        .select('id, name')
        .in('id', allCategoryIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  const categoryNameById = new Map(
    ((categoriesRes.data ?? []) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name ?? 'Uncategorized']),
  );

  const facets = {
    brands: Array.from(brandCountMap.entries())
      .map(([id, count]) => ({ id, label: brandById.get(id) ?? 'Brand', count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    categories: Array.from(categoryCountMap.entries())
      .map(([id, count]) => ({ id, label: categoryNameById.get(id) ?? 'Uncategorized', count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };

  const productList = products.map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    display_name: p.name_override?.trim() || p.internal_sku,
    brand_name: p.tenant_brand_id ? (brandById.get(p.tenant_brand_id) ?? 'Brand') : 'Brand',
    category_name: p.tenant_category_id ? (categoryNameById.get(p.tenant_category_id) ?? null) : null,
    tenant_brand_id: p.tenant_brand_id,
    tenant_category_id: p.tenant_category_id,
    mrp: p.mrp,
    base_selling_price: p.base_selling_price,
    cost_price: canViewCost ? p.cost_price : null,
  }));

  return NextResponse.json({ products: productList, facets, total: products.length });
}
