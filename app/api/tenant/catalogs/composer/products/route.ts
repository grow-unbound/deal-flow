import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { searchScopedProducts, type ScopedProductAvailability } from '@/lib/server/scoped-product-search';
import { supabaseAdmin } from '@/lib/supabase';
import type { CatalogComposerAvailability, CatalogComposerTag } from '@/lib/zod';

type StockTone = 'success' | 'warning' | 'neutral';

type InventoryRow = {
  tenant_product_id: string;
  qty_available: number | null;
  reorder_point: number | null;
  inventory_updated_at: string | null;
  units_mtd: number | null;
  has_recent_order: boolean | null;
};

function readMultiParam(params: URLSearchParams, key: string) {
  return params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function readSelectedIds(params: URLSearchParams) {
  return readMultiParam(params, 'selected_id').slice(0, PAGE_SIZE.MAX);
}

function parseOffsetCursor(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export async function GET(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims?.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const params = req.nextUrl.searchParams;
  const search = params.get('q')?.trim() ?? '';
  const brandLabels = readMultiParam(params, 'brand');
  const categoryLabels = readMultiParam(params, 'category');
  const brandIdsFromParams = readMultiParam(params, 'brand_id');
  const categoryIdsFromParams = readMultiParam(params, 'category_id');
  const selectedIds = readSelectedIds(params);
  const availability = (params.get('availability') || 'show_everything') as CatalogComposerAvailability;
  const limit = parseRowsLimit(params.get('limit'), PAGE_SIZE.COMPOSER);
  const offset = parseOffsetCursor(params.get('cursor'));
  const canViewCost = claims.role === 'seller_admin';
  const db = supabaseAdmin as any;

  const [brandLookupRes, categoryLookupRes] = await Promise.all([
    brandLabels.length
      ? db.schema('app').from('tenant_brands').select('id, display_name_override').eq('tenant_id', claims.tenant_id).is('deleted_at', null).in('display_name_override', brandLabels).limit(PAGE_SIZE.MAX)
      : Promise.resolve({ data: [], error: null }),
    categoryLabels.length
      ? db.schema('app').from('tenant_categories').select('id, name').eq('tenant_id', claims.tenant_id).is('deleted_at', null).in('name', categoryLabels).limit(PAGE_SIZE.MAX)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (brandLookupRes.error || categoryLookupRes.error) {
    console.error('[GET /api/tenant/catalogs/composer/products] lookup error:', brandLookupRes.error || categoryLookupRes.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const brandIds = Array.from(new Set([...brandIdsFromParams, ...((brandLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id)]));
  const categoryIds = Array.from(new Set([...categoryIdsFromParams, ...((categoryLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id)]));
  let productsResult;
  let selectedProductsResult;
  try {
    [productsResult, selectedProductsResult] = await Promise.all([
      searchScopedProducts({
        db,
        tenantId: claims.tenant_id,
        query: search,
        limit,
        offset,
        brandIds,
        categoryIds,
        availability: availability as ScopedProductAvailability,
        sort: search ? 'relevance' : 'created_desc',
      }),
      selectedIds.length > 0
        ? searchScopedProducts({
            db,
            tenantId: claims.tenant_id,
            ids: selectedIds,
            limit: selectedIds.length,
            offset: 0,
            availability: 'show_everything',
            sort: 'created_desc',
          })
        : Promise.resolve({ rows: [], total: 0 }),
    ]);
  } catch (error) {
    console.error('[GET /api/tenant/catalogs/composer/products] products error:', error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const matchedProducts = productsResult.rows;
  const selectedProducts = selectedProductsResult.rows;
  const productIdsForHydration = Array.from(new Set([...matchedProducts, ...selectedProducts].map((product) => product.tenant_product_id)));
  const now = new Date();
  const recentSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const metricsRes = productIdsForHydration.length
    ? await db.schema('app').rpc('get_catalog_composer_product_metrics', {
        p_tenant_id: claims.tenant_id,
        p_product_ids: productIdsForHydration,
        p_recent_since: recentSince,
        p_month_start: monthStart,
      })
    : { data: [], error: null };

  if (metricsRes.error) {
    console.error('[GET /api/tenant/catalogs/composer/products] hydrate error:', metricsRes.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const inventoryByProductId = new Map<string, InventoryRow>();
  for (const row of (metricsRes.data ?? []) as InventoryRow[]) {
    inventoryByProductId.set(row.tenant_product_id, row);
  }

  const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const threeDaysAgoTs = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const sevenDaysAgoTs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const daysElapsed = Math.max(1, Math.ceil((Date.now() - new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime()) / (1000 * 60 * 60 * 24)));

  const hydrateProduct = (product: typeof matchedProducts[number]) => {
    const inventory = inventoryByProductId.get(product.tenant_product_id);
    const qtyAvailable = Number(inventory?.qty_available ?? product.on_hand ?? 0);
    const reorderPoint = Number(inventory?.reorder_point ?? product.reorder_point ?? 0);
    const unitsMtd = Number(inventory?.units_mtd ?? 0);
    const dailyRunRate = unitsMtd > 0 ? unitsMtd / daysElapsed : 0;
    const productCreatedTs = new Date(product.created_at).getTime();
    const inventoryUpdatedTs = inventory?.inventory_updated_at ? new Date(inventory.inventory_updated_at).getTime() : 0;
    const stockAddedToday = qtyAvailable > 0 && inventoryUpdatedTs >= todayStartTs;
    const tag: CatalogComposerTag | null =
      productCreatedTs >= sevenDaysAgoTs
        ? 'new'
        : qtyAvailable > 0 && inventoryUpdatedTs >= threeDaysAgoTs
          ? 'new_stock'
          : !inventory?.has_recent_order
            ? 'old_stock'
            : null;
    const stockTone: StockTone = qtyAvailable <= 0 ? 'neutral' : reorderPoint > 0 && qtyAvailable <= reorderPoint ? 'warning' : 'success';

    return {
      id: product.tenant_product_id,
      display_name: product.product_name,
      internal_sku: product.sku ?? product.product_name,
      brand_name: product.brand_name,
      category_name: product.category_name || null,
      mrp: product.mrp,
      base_selling_price: product.base_selling_price,
      cost_price: canViewCost ? product.cost_price : null,
      qty_available: qtyAvailable,
      reorder_point: reorderPoint,
      units_mtd: unitsMtd,
      days_cover: qtyAvailable > 0 && dailyRunRate > 0 ? Math.round((qtyAvailable / dailyRunRate) * 10) / 10 : null,
      tag,
      stock_added_today: stockAddedToday,
      stock_label: qtyAvailable <= 0 ? 'Out' : `${qtyAvailable}`,
      stock_tone: stockTone,
    };
  };

  const hydrated = matchedProducts.map(hydrateProduct);
  const selectedHydrated = selectedProducts.map(hydrateProduct);

  const total = productsResult.total;
  const nextCursor = offset + hydrated.length < total ? String(offset + hydrated.length) : null;

  return NextResponse.json({ products: hydrated, selected_products: selectedHydrated, total, nextCursor }, { headers: SELLER_CACHE_PERSONAL });
}
