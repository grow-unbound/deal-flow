import { NextRequest, NextResponse } from 'next/server';

import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';
import { r2Url } from '@/lib/r2-url';
import {
  fetchProductPeriodSummaries,
  getProductTabQuarterBounds,
  rollupPeriodByBrand,
} from '@/lib/server/product-tab-metrics';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;

  if (context.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: categoryId } = await params;
  const sort = request.nextUrl.searchParams.get('sort') || 'sales_qtd_desc';
  const q = context.query?.toLowerCase() ?? '';
  const quarterBounds = getProductTabQuarterBounds();

  const productsRes = await context.db
    .schema('app')
    .from('tenant_products')
    .select('id, tenant_brand_id')
    .eq('tenant_id', context.tenantId)
    .eq('tenant_category_id', categoryId)
    .is('deleted_at', null);

  if (productsRes.error) {
    return NextResponse.json({ error: 'Failed to search category brands' }, { status: 500 });
  }

  const products = (productsRes.data ?? []) as Array<{ id: string; tenant_brand_id: string | null }>;
  const productIds = products.map((row) => row.id);
  const productToBrandId = new Map<string, string>();
  const skuCountByBrand = new Map<string, number>();

  for (const product of products) {
    if (!product.tenant_brand_id) continue;
    const brandId = String(product.tenant_brand_id);
    productToBrandId.set(product.id, brandId);
    skuCountByBrand.set(brandId, (skuCountByBrand.get(brandId) ?? 0) + 1);
  }

  const brandIds = Array.from(skuCountByBrand.keys());
  const [brandsRes, periodByProduct] = await Promise.all([
    brandIds.length > 0
      ? context.db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, logo_url, r2_logo_thumb_key, is_active')
          .eq('tenant_id', context.tenantId)
          .in('id', brandIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    fetchProductPeriodSummaries(context.db, context.tenantId, productIds, quarterBounds),
  ]);

  if (brandsRes.error) {
    return NextResponse.json({ error: 'Failed to search category brands' }, { status: 500 });
  }

  const rollupByBrand = rollupPeriodByBrand(productToBrandId, periodByProduct);

  const rows = ((brandsRes.data ?? []) as Array<{
    id: string;
    display_name_override: string | null;
    logo_url: string | null;
    r2_logo_thumb_key: string | null;
    is_active: boolean | null;
  }>)
    .map((brand) => {
      const rollup = rollupByBrand.get(brand.id) ?? {
        sales_qtd: 0,
        units_qtd: 0,
        sales_qtd_trend_pct: null,
        units_qtd_trend_pct: null,
        demand_qtd_value: 0,
        demand_qtd_units: 0,
      };
      const name = brand.display_name_override?.trim() || 'Brand';
      return {
        id: brand.id,
        name,
        initials: getInitials(name),
        logo_url: r2Url(brand.r2_logo_thumb_key) ?? brand.logo_url ?? null,
        sku_count: skuCountByBrand.get(brand.id) ?? 0,
        sales_qtd: rollup.sales_qtd,
        units_qtd: rollup.units_qtd,
        sales_qtd_trend_pct: rollup.sales_qtd_trend_pct,
        units_qtd_trend_pct: rollup.units_qtd_trend_pct,
        demand_qtd_value: rollup.demand_qtd_value,
        demand_qtd_units: rollup.demand_qtd_units,
        is_active: brand.is_active !== false,
      };
    })
    .filter((row) => {
      if (!q) return true;
      return row.name.toLowerCase().includes(q);
    });

  rows.sort((a, b) => {
    if (sort === 'name_asc') return a.name.localeCompare(b.name);
    if (sort === 'sku_count_desc') return b.sku_count - a.sku_count || a.name.localeCompare(b.name);
    if (sort === 'units_qtd_desc') return b.units_qtd - a.units_qtd || a.name.localeCompare(b.name);
    return b.sales_qtd - a.sales_qtd || a.name.localeCompare(b.name);
  });

  const total = rows.length;
  const pagedRows = rows.slice(context.offset, context.offset + context.limit).map((row) => ({
    ...row,
    total_count: total,
  }));

  return detailSearchResponse(pagedRows, context.limit, context.offset);
}
