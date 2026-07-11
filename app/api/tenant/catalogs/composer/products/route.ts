import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';
import type { CatalogComposerAvailability, CatalogComposerTag } from '@/lib/zod';

type StockTone = 'success' | 'warning' | 'neutral';

type ProductRow = {
  id: string;
  internal_sku: string;
  name_override: string | null;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  created_at: string;
};

type InventoryRow = {
  tenant_product_id: string;
  qty_available: number | null;
  reorder_point: number | null;
  updated_at?: string | null;
};

function readMultiParam(params: URLSearchParams, key: string) {
  return params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function parseOffsetCursor(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function matchesAvailability(
  product: { qty_available: number; reorder_point: number; tag: CatalogComposerTag | null; stock_added_today: boolean },
  availability: CatalogComposerAvailability,
) {
  if (availability === 'show_everything') return true;
  if (availability === 'in_stock_only') return product.qty_available > 0;
  if (availability === 'low_stock_only') return product.qty_available > 0 && product.reorder_point > 0 && product.qty_available <= product.reorder_point;
  if (availability === 'new_in_stock_today') return product.stock_added_today;
  if (availability === 'old_stock') return product.tag === 'old_stock';
  return true;
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
  const availability = (params.get('availability') || 'show_everything') as CatalogComposerAvailability;
  const limit = parseRowsLimit(params.get('limit'), PAGE_SIZE.COMPOSER);
  const offset = parseOffsetCursor(params.get('cursor'));
  const canViewCost = claims.role === 'seller_admin';
  const db = supabaseAdmin as any;

  const [brandLookupRes, categoryLookupRes, searchBrandLookupRes] = await Promise.all([
    brandLabels.length
      ? db.schema('app').from('tenant_brands').select('id, display_name_override').eq('tenant_id', claims.tenant_id).is('deleted_at', null).in('display_name_override', brandLabels)
      : Promise.resolve({ data: [], error: null }),
    categoryLabels.length
      ? db.schema('app').from('tenant_categories').select('id, name').eq('tenant_id', claims.tenant_id).is('deleted_at', null).in('name', categoryLabels)
      : Promise.resolve({ data: [], error: null }),
    search
      ? db.schema('app').from('tenant_brands').select('id, display_name_override').eq('tenant_id', claims.tenant_id).is('deleted_at', null).ilike('display_name_override', `%${escapeLike(search)}%`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (brandLookupRes.error || categoryLookupRes.error || searchBrandLookupRes.error) {
    console.error('[GET /api/tenant/catalogs/composer/products] lookup error:', brandLookupRes.error || categoryLookupRes.error || searchBrandLookupRes.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const brandIds = Array.from(new Set([...brandIdsFromParams, ...((brandLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id)]));
  const categoryIds = Array.from(new Set([...categoryIdsFromParams, ...((categoryLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id)]));
  const searchBrandIds = ((searchBrandLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);

  let query = db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, tenant_brand_id, tenant_category_id, mrp, base_selling_price, cost_price, created_at', { count: 'exact' })
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null);

  if (brandIds.length) query = query.in('tenant_brand_id', brandIds);
  if (categoryIds.length) query = query.in('tenant_category_id', categoryIds);
  if (search) {
    const escaped = escapeLike(search);
    const orParts = [`internal_sku.ilike.%${escaped}%`, `name_override.ilike.%${escaped}%`];
    if (searchBrandIds.length) orParts.push(`tenant_brand_id.in.(${searchBrandIds.join(',')})`);
    query = query.or(orParts.join(','));
  }

  query = query.order('created_at', { ascending: false });
  const needsComputedAvailability = availability !== 'show_everything';
  if (!needsComputedAvailability) query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('[GET /api/tenant/catalogs/composer/products] products error:', error.message);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const matchedProducts = (data ?? []) as ProductRow[];
  const allProductIds = matchedProducts.map((product) => product.id);
  const productIdsForHydration = needsComputedAvailability ? allProductIds : allProductIds;

  const [inventoryRes, categoriesRes, brandsRes, recentOrdersRes, monthOrdersRes] = await Promise.all([
    productIdsForHydration.length
      ? db.schema('app').from('tenant_inventory').select('tenant_product_id, qty_available, reorder_point, updated_at').in('tenant_product_id', productIdsForHydration).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    matchedProducts.some((product) => product.tenant_category_id)
      ? db.schema('app').from('tenant_categories').select('id, name').in('id', Array.from(new Set(matchedProducts.map((product) => product.tenant_category_id).filter(Boolean)))).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    matchedProducts.some((product) => product.tenant_brand_id)
      ? db.schema('app').from('tenant_brands').select('id, display_name_override').in('id', Array.from(new Set(matchedProducts.map((product) => product.tenant_brand_id).filter(Boolean)))).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    db.schema('app').from('orders').select('id, placed_at').eq('tenant_id', claims.tenant_id).neq('status', 'cancelled').is('deleted_at', null).gte('placed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    db.schema('app').from('orders').select('id, placed_at').eq('tenant_id', claims.tenant_id).neq('status', 'cancelled').is('deleted_at', null).gte('placed_at', new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()),
  ]);

  if (inventoryRes.error || categoriesRes.error || brandsRes.error || recentOrdersRes.error || monthOrdersRes.error) {
    console.error('[GET /api/tenant/catalogs/composer/products] hydrate error:', inventoryRes.error || categoriesRes.error || brandsRes.error || recentOrdersRes.error || monthOrdersRes.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const inventoryByProductId = new Map<string, InventoryRow>();
  for (const row of (inventoryRes.data ?? []) as InventoryRow[]) {
    const existing = inventoryByProductId.get(row.tenant_product_id);
    if (!existing) {
      inventoryByProductId.set(row.tenant_product_id, { ...row });
    } else {
      existing.qty_available = Number(existing.qty_available ?? 0) + Number(row.qty_available ?? 0);
      existing.reorder_point = Math.max(Number(existing.reorder_point ?? 0), Number(row.reorder_point ?? 0));
      const existingTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const nextTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      if (nextTs > existingTs) existing.updated_at = row.updated_at;
    }
  }

  const recentOrderIds = ((recentOrdersRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const monthOrderIds = ((monthOrdersRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const allOrderIds = Array.from(new Set([...recentOrderIds, ...monthOrderIds]));
  const orderItemsRes = allOrderIds.length && productIdsForHydration.length
    ? await db.schema('app').from('order_items').select('order_id, tenant_product_id, qty').in('order_id', allOrderIds).in('tenant_product_id', productIdsForHydration).is('deleted_at', null)
    : { data: [], error: null };
  if (orderItemsRes.error) {
    console.error('[GET /api/tenant/catalogs/composer/products] order item error:', orderItemsRes.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const monthOrderSet = new Set(monthOrderIds);
  const hasRecentOrderByProductId = new Set<string>();
  const unitsMtdByProductId = new Map<string, number>();
  for (const item of (orderItemsRes.data ?? []) as Array<{ order_id: string; tenant_product_id: string; qty: number | null }>) {
    if (monthOrderSet.has(item.order_id)) unitsMtdByProductId.set(item.tenant_product_id, (unitsMtdByProductId.get(item.tenant_product_id) ?? 0) + Number(item.qty ?? 0));
    hasRecentOrderByProductId.add(item.tenant_product_id);
  }

  const categoryNameById = new Map(((categoriesRes.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name]));
  const brandById = new Map(((brandsRes.data ?? []) as Array<{ id: string; display_name_override: string | null }>).map((row) => [row.id, row.display_name_override?.trim() || 'Brand']));
  const now = new Date();
  const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const threeDaysAgoTs = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const sevenDaysAgoTs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const daysElapsed = Math.max(1, Math.ceil((Date.now() - new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime()) / (1000 * 60 * 60 * 24)));

  const hydrated = matchedProducts.map((product) => {
    const inventory = inventoryByProductId.get(product.id);
    const qtyAvailable = Number(inventory?.qty_available ?? 0);
    const reorderPoint = Number(inventory?.reorder_point ?? 0);
    const unitsMtd = unitsMtdByProductId.get(product.id) ?? 0;
    const dailyRunRate = unitsMtd > 0 ? unitsMtd / daysElapsed : 0;
    const productCreatedTs = new Date(product.created_at).getTime();
    const inventoryUpdatedTs = inventory?.updated_at ? new Date(inventory.updated_at).getTime() : 0;
    const stockAddedToday = qtyAvailable > 0 && inventoryUpdatedTs >= todayStartTs;
    const tag: CatalogComposerTag | null =
      productCreatedTs >= sevenDaysAgoTs
        ? 'new'
        : qtyAvailable > 0 && inventoryUpdatedTs >= threeDaysAgoTs
          ? 'new_stock'
          : !hasRecentOrderByProductId.has(product.id)
            ? 'old_stock'
            : null;
    const stockTone: StockTone = qtyAvailable <= 0 ? 'neutral' : reorderPoint > 0 && qtyAvailable <= reorderPoint ? 'warning' : 'success';

    return {
      id: product.id,
      display_name: product.name_override?.trim() || product.internal_sku,
      internal_sku: product.internal_sku,
      brand_name: product.tenant_brand_id ? brandById.get(product.tenant_brand_id) ?? 'Brand' : 'Brand',
      category_name: product.tenant_category_id ? categoryNameById.get(product.tenant_category_id) ?? null : null,
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
  });

  const filtered = needsComputedAvailability ? hydrated.filter((product) => matchesAvailability(product, availability)) : hydrated;
  const total = needsComputedAvailability ? filtered.length : Number(count ?? filtered.length);
  const pageRows = needsComputedAvailability ? filtered.slice(offset, offset + limit) : filtered;
  const nextCursor = offset + pageRows.length < total ? String(offset + pageRows.length) : null;

  return NextResponse.json({ products: pageRows, total, nextCursor });
}
