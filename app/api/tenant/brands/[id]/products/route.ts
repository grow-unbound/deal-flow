import { NextRequest, NextResponse } from 'next/server';

import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';
import { firstStoredImageUrl } from '@/lib/r2-url';

function monthBounds() {
  const now = new Date();
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    currentStart: currentStart.toISOString().slice(0, 10),
    nextStart: nextStart.toISOString().slice(0, 10),
    previousStart: previousStart.toISOString().slice(0, 10),
  };
}

function matchesStockFilter(stock: string | null, onHand: number, lowStock: boolean, outOfStock: boolean) {
  if (!stock) return true;
  if (stock === 'out_of_stock') return outOfStock || onHand <= 0;
  if (stock === 'low_stock') return lowStock && onHand > 0;
  if (stock === 'in_stock') return onHand > 0;
  return true;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;
  // Brands is a Growth-section module scoped to seller_admin only — getDetailSearchContext
  // is shared across modules (e.g. Products) that do allow seller_assistant, so the
  // brand-specific admin gate has to live here rather than in the shared helper.
  if (context.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const stock = request.nextUrl.searchParams.get('stock') || null;
  const sort = request.nextUrl.searchParams.get('sort') || 'gmv_desc';
  const q = context.query?.toLowerCase() ?? '';
  const { currentStart, nextStart, previousStart } = monthBounds();

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
  const categoryIds = Array.from(new Set(products.flatMap((row) => row.tenant_category_id ? [row.tenant_category_id] : [])));
  const masterProductIds = Array.from(new Set(products.flatMap((row) => row.master_product_id ? [row.master_product_id] : [])));

  const [metricsRes, categoriesRes, masterProductsRes, invoiceItemsRes] = await Promise.all([
    productIds.length > 0
      ? context.db
          .schema('app')
          .from('metrics_product_snapshot')
          .select('tenant_product_id, available, days_cover, low_stock, out_of_stock, invoice_value_90d')
          .eq('tenant_id', context.tenantId)
          .in('tenant_product_id', productIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
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
    productIds.length > 0
      ? context.db
          .schema('app')
          .from('invoice_items')
          .select('tenant_product_id, qty, line_total, invoices!inner(tenant_id, invoice_date, created_at)')
          .in('tenant_product_id', productIds)
          .is('deleted_at', null)
          .eq('invoices.tenant_id', context.tenantId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const extraError = metricsRes.error ?? categoriesRes.error ?? masterProductsRes.error ?? invoiceItemsRes.error;
  if (extraError) {
    return NextResponse.json({ error: 'Failed to search brand products' }, { status: 500 });
  }

  const metricsById = new Map(
    ((metricsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.tenant_product_id),
      row,
    ]),
  );
  const categoryById = new Map(
    ((categoriesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), String(row.name ?? 'Uncategorized')]),
  );
  const masterProductById = new Map(
    ((masterProductsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), String(row.name ?? '')]),
  );

  const monthlyByProduct = new Map<string, { unitsMtd: number; gmvMtd: number; gmvPrev: number }>();
  for (const row of (invoiceItemsRes.data ?? []) as Array<Record<string, unknown>>) {
    const productId = String(row.tenant_product_id);
    const invoice = (row.invoices as Record<string, unknown>) ?? {};
    const invoiceDate = String(invoice.invoice_date ?? invoice.created_at ?? '');
    if (!invoiceDate) continue;
    const bucket = monthlyByProduct.get(productId) ?? { unitsMtd: 0, gmvMtd: 0, gmvPrev: 0 };
    const qty = Number(row.qty ?? 0);
    const lineTotal = Number(row.line_total ?? 0);
    if (invoiceDate >= currentStart && invoiceDate < nextStart) {
      bucket.unitsMtd += qty;
      bucket.gmvMtd += lineTotal;
    } else if (invoiceDate >= previousStart && invoiceDate < currentStart) {
      bucket.gmvPrev += lineTotal;
    }
    monthlyByProduct.set(productId, bucket);
  }

  const rows = products
    .map((product) => {
      const metric = metricsById.get(product.id);
      const monthly = monthlyByProduct.get(product.id) ?? { unitsMtd: 0, gmvMtd: 0, gmvPrev: 0 };
      const productName = product.name_override?.trim()
        || (product.master_product_id ? masterProductById.get(product.master_product_id) : '')
        || product.internal_sku
        || 'Product';
      const categoryName = product.tenant_category_id ? categoryById.get(product.tenant_category_id) ?? 'Uncategorized' : 'Uncategorized';
      const onHand = Number(metric?.available ?? 0);
      const gmvPrev = monthly.gmvPrev;
      const growthPct = gmvPrev > 0 ? Number((((monthly.gmvMtd - gmvPrev) / gmvPrev) * 100).toFixed(1)) : 0;
      return {
        tenant_product_id: product.id,
        product_name: productName,
        sku: product.internal_sku,
        category_name: categoryName,
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
        cost_price: context.role === 'seller_admin' ? product.cost_price : null,
        on_hand: onHand,
        days_cover: metric?.days_cover == null ? 0 : Number(metric.days_cover),
        units_mtd: monthly.unitsMtd,
        gmv_mtd: monthly.gmvMtd,
        growth_pct: growthPct,
        image_url: firstStoredImageUrl(product.image_urls),
        sort_gmv_90d: Number(metric?.invoice_value_90d ?? monthly.gmvMtd),
        low_stock: Boolean(metric?.low_stock),
        out_of_stock: Boolean(metric?.out_of_stock),
      };
    })
    .filter((row) => {
      if (q) {
        const haystack = [row.product_name, row.sku, row.category_name].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return matchesStockFilter(stock, Number(row.on_hand ?? 0), row.low_stock, row.out_of_stock);
    });

  rows.sort((a, b) => {
    if (sort === 'gmv_asc') return a.sort_gmv_90d - b.sort_gmv_90d || a.product_name.localeCompare(b.product_name);
    if (sort === 'growth_desc') return b.growth_pct - a.growth_pct || a.product_name.localeCompare(b.product_name);
    if (sort === 'on_hand_asc') return Number(a.on_hand) - Number(b.on_hand) || a.product_name.localeCompare(b.product_name);
    return b.sort_gmv_90d - a.sort_gmv_90d || a.product_name.localeCompare(b.product_name);
  });

  const total = rows.length;
  const pagedRows = rows.slice(context.offset, context.offset + context.limit).map((row) => ({
    ...row,
    total_count: total,
  }));

  return detailSearchResponse(pagedRows, context.limit, context.offset);
}
