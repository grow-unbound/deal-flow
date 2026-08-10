import { NextRequest, NextResponse } from 'next/server';

import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';
import { firstStoredImageUrl } from '@/lib/r2-url';
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

  const { id } = await params;
  const stockStatuses = parseProductStockStatusParams(request.nextUrl.searchParams);
  const sort = request.nextUrl.searchParams.get('sort') || 'sales_qtd_desc';
  const q = context.query?.toLowerCase() ?? '';
  const quarterBounds = getProductTabQuarterBounds();

  const productsRes = await context.db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, mrp, base_selling_price, cost_price, tenant_category_id, master_product_id, image_urls')
    .eq('tenant_id', context.tenantId)
    .eq('tenant_brand_id', id)
    .is('deleted_at', null);
  if (productsRes.error) {
    return NextResponse.json({ error: 'Failed to search brand products' }, { status: 500 });
  }

  const products = (productsRes.data ?? []) as Array<{
    id: string;
    internal_sku: string | null;
    name_override: string | null;
    mrp: number | null;
    base_selling_price: number | null;
    cost_price: number | null;
    tenant_category_id: string | null;
    master_product_id: string | null;
    image_urls: string[] | null;
  }>;
  const productIds = products.map((row) => row.id);
  const categoryIds = Array.from(new Set(products.flatMap((row) => (row.tenant_category_id ? [row.tenant_category_id] : []))));
  const masterProductIds = Array.from(new Set(products.flatMap((row) => (row.master_product_id ? [row.master_product_id] : []))));

  const [categoriesRes, masterProductsRes, inventoryByProduct, periodByProduct, latestDemandByProduct] = await Promise.all([
    categoryIds.length > 0
      ? context.db
          .schema('app')
          .from('tenant_categories')
          .select('id, name')
          .in('id', categoryIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    masterProductIds.length > 0
      ? context.db
          .schema('catalog')
          .from('products')
          .select('id, name')
          .in('id', masterProductIds)
      : Promise.resolve({ data: [], error: null }),
    fetchInventoryOnHandByProduct(context.db, productIds),
    fetchProductPeriodSummaries(context.db, context.tenantId, productIds, quarterBounds),
    loadLatestDemandByProduct(context.db, productIds),
  ]);

  const extraError = categoriesRes.error ?? masterProductsRes.error;
  if (extraError) {
    return NextResponse.json({ error: 'Failed to search brand products' }, { status: 500 });
  }

  const categoryById = new Map(
    ((categoriesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), String(row.name ?? 'Uncategorized')]),
  );
  const masterProductById = new Map(
    ((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), String(row.name ?? '')]),
  );

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
      const productName = product.name_override?.trim()
        || (product.master_product_id ? masterProductById.get(product.master_product_id) : '')
        || product.internal_sku
        || 'Product';
      const categoryName = product.tenant_category_id ? categoryById.get(product.tenant_category_id) ?? 'Uncategorized' : 'Uncategorized';

      return {
        tenant_product_id: product.id,
        product_name: productName,
        sku: product.internal_sku,
        category_name: categoryName,
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
        cost_price: context.role === 'seller_admin' ? product.cost_price : null,
        on_hand: onHand,
        days_cover: daysCover ?? 0,
        units_qtd: unitsQtd,
        sales_qtd: salesQtd,
        units_qtd_trend_pct: trendPct(unitsQtd, previousUnits),
        sales_qtd_trend_pct: trendPct(salesQtd, previousSales),
        image_url: firstStoredImageUrl(product.image_urls),
        low_stock: lowStock,
        out_of_stock: outOfStock,
        is_idle: isIdle,
      };
    })
    .filter((row) => {
      if (q) {
        const haystack = [row.product_name, row.sku, row.category_name].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return matchesProductStockStatuses(stockStatuses, {
        onHand: Number(row.on_hand ?? 0),
        lowStock: row.low_stock,
        outOfStock: row.out_of_stock,
        isIdle: row.is_idle,
      });
    });

  rows.sort((a, b) => {
    if (sort === 'sales_qtd_asc') return a.sales_qtd - b.sales_qtd || a.product_name.localeCompare(b.product_name);
    if (sort === 'units_qtd_trend_desc') {
      const aTrend = a.units_qtd_trend_pct ?? Number.NEGATIVE_INFINITY;
      const bTrend = b.units_qtd_trend_pct ?? Number.NEGATIVE_INFINITY;
      return bTrend - aTrend || a.product_name.localeCompare(b.product_name);
    }
    if (sort === 'on_hand_asc') return Number(a.on_hand) - Number(b.on_hand) || a.product_name.localeCompare(b.product_name);
    return b.sales_qtd - a.sales_qtd || a.product_name.localeCompare(b.product_name);
  });

  const total = rows.length;
  const pagedRows = rows.slice(context.offset, context.offset + context.limit).map((row) => ({
    ...row,
    total_count: total,
  }));

  return detailSearchResponse(pagedRows, context.limit, context.offset);
}
