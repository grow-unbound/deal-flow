import { NextRequest, NextResponse } from 'next/server';

import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';
import { firstStoredImageUrl } from '@/lib/r2-url';
import { r2Url } from '@/lib/r2-url';
import {
  daysCoverFromQtd,
  deriveStockFlags,
  fetchInventoryOnHandByProduct,
  fetchProductPeriodSummaries,
  getProductTabQuarterBounds,
  isIdleStockSku,
  loadLatestDemandByProduct,
  trendPct,
} from '@/lib/server/product-tab-metrics';
import { matchesProductStockStatuses, parseProductStockStatusParams } from '@/lib/server/product-stock-status';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;

  if (context.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: categoryId } = await params;
  const stockStatuses = parseProductStockStatusParams(request.nextUrl.searchParams);
  const sort = request.nextUrl.searchParams.get('sort') || 'sales_qtd_desc';
  const q = context.query?.toLowerCase() ?? '';
  const quarterBounds = getProductTabQuarterBounds();

  const productsRes = await context.db
    .schema('app')
    .from('tenant_products')
    .select(
      'id, internal_sku, name_override, tenant_brand_id, is_active, image_urls, tenant_brands(id, display_name_override, logo_url, r2_logo_thumb_key)',
    )
    .eq('tenant_id', context.tenantId)
    .eq('tenant_category_id', categoryId)
    .is('deleted_at', null);

  if (productsRes.error) {
    return NextResponse.json({ error: 'Failed to search category products' }, { status: 500 });
  }

  const products = (productsRes.data ?? []) as Array<{
    id: string;
    internal_sku: string | null;
    name_override: string | null;
    tenant_brand_id: string | null;
    is_active: boolean | null;
    image_urls: string[] | null;
    tenant_brands: {
      id: string;
      display_name_override: string | null;
      logo_url: string | null;
      r2_logo_thumb_key: string | null;
    } | null;
  }>;

  const productIds = products.map((row) => row.id);
  const [inventoryByProduct, periodByProduct, latestDemandByProduct] = await Promise.all([
    fetchInventoryOnHandByProduct(context.db, productIds),
    fetchProductPeriodSummaries(context.db, context.tenantId, productIds, quarterBounds),
    loadLatestDemandByProduct(context.db, productIds),
  ]);

  const rows = products
    .map((product) => {
      const period = periodByProduct.get(product.id) ?? { current: null, previous: null };
      const onHand = inventoryByProduct.get(product.id) ?? 0;
      const unitsQtd = period.current?.invoice_units ?? 0;
      const salesQtd = period.current?.invoice_value ?? 0;
      const previousUnits = period.previous?.invoice_units ?? 0;
      const previousSales = period.previous?.invoice_value ?? 0;
      const daysCover = daysCoverFromQtd(onHand, unitsQtd, quarterBounds.elapsedDays);
      const { outOfStock, lowStock } = deriveStockFlags(onHand, daysCover);
      const isIdle = isIdleStockSku(onHand, latestDemandByProduct.get(product.id) ?? null);
      const brand = product.tenant_brands;
      const brandLogo = brand ? r2Url(brand.r2_logo_thumb_key) ?? brand.logo_url ?? null : null;

      return {
        id: product.id,
        name: product.name_override?.trim() || product.internal_sku || 'Product',
        sku_code: product.internal_sku,
        brand_id: product.tenant_brand_id ?? '',
        brand_name: brand?.display_name_override?.trim() || '—',
        brand_logo_url: brandLogo,
        image_url: firstStoredImageUrl(product.image_urls),
        on_hand: onHand,
        days_cover: daysCover,
        units_qtd: unitsQtd,
        sales_qtd: salesQtd,
        units_qtd_trend_pct: trendPct(unitsQtd, previousUnits),
        sales_qtd_trend_pct: trendPct(salesQtd, previousSales),
        is_active: product.is_active !== false,
        out_of_stock: outOfStock,
        low_stock: lowStock,
        is_idle: isIdle,
      };
    })
    .filter((row) => {
      if (q) {
        const haystack = [row.name, row.sku_code, row.brand_name].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return matchesProductStockStatuses(stockStatuses, {
        onHand: row.on_hand,
        lowStock: row.low_stock,
        outOfStock: row.out_of_stock,
        isIdle: row.is_idle,
      });
    });

  rows.sort((a, b) => {
    if (sort === 'name_asc') return a.name.localeCompare(b.name);
    if (sort === 'on_hand_asc') return a.on_hand - b.on_hand || a.name.localeCompare(b.name);
    if (sort === 'units_qtd_desc') return b.units_qtd - a.units_qtd || a.name.localeCompare(b.name);
    if (sort === 'sales_qtd_asc') return a.sales_qtd - b.sales_qtd || a.name.localeCompare(b.name);
    return b.sales_qtd - a.sales_qtd || a.name.localeCompare(b.name);
  });

  const total = rows.length;
  const pagedRows = rows.slice(context.offset, context.offset + context.limit).map((row) => ({
    ...row,
    total_count: total,
  }));

  return detailSearchResponse(pagedRows, context.limit, context.offset);
}
