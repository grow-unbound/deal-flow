import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import { r2Url } from '@/lib/r2-url';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type CategorySort = 'invoice_value_desc' | 'name_asc' | 'oos_sku_count_desc' | 'invoice_count_desc' | 'invoice_buyer_count_desc';
type CategoryCursor = { v: number | string; i: string };
type CategoryPreset = {
  sold_period?: string;
  not_sold_period?: string;
  stock?: 'out' | 'low' | 'available' | string;
  stock_lte?: number;
  stock_gt?: number;
  sort?: string;
};

type CategoryIdentityRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
  r2_image_thumb_key: string | null;
  r2_image_medium_key: string | null;
};

type CategoryMetricRow = {
  tenant_category_id: string;
  invoice_count: number | string | null;
  invoice_value: number | string | null;
  invoice_product_count: number | string | null;
  invoice_buyer_count: number | string | null;
};

type TenantProductRow = {
  id: string;
  tenant_category_id: string | null;
  tenant_brand_id: string | null;
  is_active: boolean;
};

const CATEGORY_SCAN_LIMIT = 1000;
const PRODUCT_SCAN_LIMIT = 5000;
const LOW_STOCK_FALLBACK = 0;

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getQuarterPeriod(asOf = new Date()) {
  const month = asOf.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), quarterStartMonth, 1));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), quarterStartMonth + 3, 1));
  return {
    period_key: 'this_quarter',
    grain: 'quarter' as const,
    period_start: start.toISOString().slice(0, 10),
    period_end_exclusive: end.toISOString().slice(0, 10),
    label: 'This Quarter',
  };
}

function parseSort(value: string | null | undefined): CategorySort {
  if (value === 'name_asc' || value === 'oos_sku_count_desc' || value === 'invoice_count_desc' || value === 'invoice_buyer_count_desc') {
    return value;
  }
  return 'invoice_value_desc';
}

function parsePreset(raw: string | null): CategoryPreset | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as CategoryPreset;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function decodeCursor(raw: string | null): CategoryCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<CategoryCursor>;
    if ((typeof parsed.v !== 'number' && typeof parsed.v !== 'string') || typeof parsed.i !== 'string') return null;
    return { v: parsed.v, i: parsed.i };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: CategoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function sortValue(row: Record<string, unknown>, sort: CategorySort): number | string {
  if (sort === 'name_asc') return String(row.name ?? '');
  if (sort === 'oos_sku_count_desc') return toNumber(row.oos_sku_count as number);
  if (sort === 'invoice_count_desc') return toNumber(row.invoice_count as number);
  if (sort === 'invoice_buyer_count_desc') return toNumber(row.invoice_buyer_count as number);
  return toNumber(row.invoice_value as number);
}

function compareRows(a: Record<string, unknown>, b: Record<string, unknown>, sort: CategorySort): number {
  const av = sortValue(a, sort);
  const bv = sortValue(b, sort);
  if (sort === 'name_asc') {
    const compared = String(av).localeCompare(String(bv));
    return compared || String(a.id).localeCompare(String(b.id));
  }
  if (av !== bv) return Number(bv) - Number(av);
  return String(a.id).localeCompare(String(b.id));
}

function passesCursor(row: Record<string, unknown>, sort: CategorySort, cursor: CategoryCursor | null): boolean {
  if (!cursor) return true;
  const value = sortValue(row, sort);
  if (sort === 'name_asc') {
    return String(value).localeCompare(String(cursor.v)) > 0 || (value === cursor.v && String(row.id) > cursor.i);
  }
  return Number(value) < Number(cursor.v) || (Number(value) === Number(cursor.v) && String(row.id) > cursor.i);
}

async function fetchCategories(db: any, tenantId: string): Promise<CategoryIdentityRow[]> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_categories')
    .select('id, name, slug, description, is_active, external_ref, created_at, updated_at, r2_image_thumb_key, r2_image_medium_key')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(CATEGORY_SCAN_LIMIT);
  if (error) throw error;
  return (data ?? []) as CategoryIdentityRow[];
}

async function fetchCategoryMetrics(db: any, tenantId: string, categoryIds: string[], period: ReturnType<typeof getQuarterPeriod>) {
  const map = new Map<string, CategoryMetricRow>();
  if (categoryIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_category_period_summary')
    .select('tenant_category_id, invoice_count, invoice_value, invoice_product_count, invoice_buyer_count')
    .eq('tenant_id', tenantId)
    .eq('grain', period.grain)
    .eq('period_start', period.period_start)
    .is('deleted_at', null)
    .in('tenant_category_id', categoryIds)
    .limit(categoryIds.length);
  if (error) throw error;
  for (const row of (data ?? []) as CategoryMetricRow[]) map.set(row.tenant_category_id, row);
  return map;
}

async function fetchProductsByCategory(db: any, tenantId: string) {
  const { data, error } = await db
    .schema('app')
    .from('tenant_products')
    .select('id, tenant_category_id, tenant_brand_id, is_active')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .limit(PRODUCT_SCAN_LIMIT);
  if (error) throw error;
  return (data ?? []) as TenantProductRow[];
}

async function fetchInventoryByProduct(db: any, productIds: string[]) {
  const map = new Map<string, { onHand: number; reorderPoint: number | null }>();
  if (productIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available, reorder_point')
    .in('tenant_product_id', productIds)
    .is('deleted_at', null)
    .limit(Math.max(productIds.length * 4, productIds.length));
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ tenant_product_id: string; qty_available: number | string | null; reorder_point: number | string | null }>) {
    const previous = map.get(row.tenant_product_id) ?? { onHand: 0, reorderPoint: null };
    const reorderPoint = row.reorder_point == null ? previous.reorderPoint : Math.max(previous.reorderPoint ?? LOW_STOCK_FALLBACK, toNumber(row.reorder_point));
    map.set(row.tenant_product_id, {
      onHand: previous.onHand + toNumber(row.qty_available),
      reorderPoint,
    });
  }
  return map;
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'categories_landing', init, APP_GET_CACHE_CONTROL);

  const claims = await getVerifiedClaims(request);
  const adminCheck = assertSellerAdmin(claims);
  if (!adminCheck.ok) {
    return timedJson({ error: adminCheck.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: adminCheck.status });
  }

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id!);
  if (!flagEnabled) return timedJson({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  try {
    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id!;
    const period = getQuarterPeriod();
    const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const statusParams = readArrayParam(request.nextUrl.searchParams, 'status');
    const productParams = readArrayParam(request.nextUrl.searchParams, 'products');
    const stockParams = readArrayParam(request.nextUrl.searchParams, 'stock');
    const preset = parsePreset(request.nextUrl.searchParams.get('filter_preset'));
    const sort = parseSort(preset?.sort ?? request.nextUrl.searchParams.get('sort'));
    const cursor = decodeCursor(request.nextUrl.searchParams.get('cursor'));

    const selectedStatus = new Set(statusParams);
    if (preset?.sold_period) selectedStatus.add('Active');
    if (preset?.not_sold_period) selectedStatus.add('Dormant');
    const selectedStock = new Set(stockParams);
    if (preset?.stock === 'out') selectedStock.add('Out of stock');
    if (preset?.stock === 'low' || typeof preset?.stock_lte === 'number') selectedStock.add('Low stock');
    if (typeof preset?.stock_gt === 'number') selectedStock.add('In stock');

    const categories = await fetchCategories(db, tenantId);
    const categoryIds = categories.map((row) => row.id);
    const [metricsByCategory, products] = await Promise.all([
      fetchCategoryMetrics(db, tenantId, categoryIds, period),
      fetchProductsByCategory(db, tenantId),
    ]);
    const activeProducts = products.filter((product) => product.is_active);
    const inventoryByProduct = await fetchInventoryByProduct(db, activeProducts.map((product) => product.id));
    const productsByCategory = new Map<string, TenantProductRow[]>();
    for (const product of activeProducts) {
      if (!product.tenant_category_id) continue;
      const current = productsByCategory.get(product.tenant_category_id) ?? [];
      current.push(product);
      productsByCategory.set(product.tenant_category_id, current);
    }

    const rows = categories.map((category) => {
      const metric = metricsByCategory.get(category.id);
      const categoryProducts = productsByCategory.get(category.id) ?? [];
      const totalSkuCount = categoryProducts.length;
      const brandCount = new Set(categoryProducts.map((product) => product.tenant_brand_id).filter(Boolean)).size;
      const productStock = categoryProducts.map((product) => inventoryByProduct.get(product.id) ?? { onHand: 0, reorderPoint: null });
      const stockOnHand = productStock.reduce((sum, stock) => sum + stock.onHand, 0);
      const oosSkuCount = productStock.filter((stock) => stock.onHand <= 0).length;
      const lowStockSkuCount = productStock.filter((stock) => stock.onHand > 0 && stock.reorderPoint != null && stock.onHand <= stock.reorderPoint).length;
      const invoiceCount = toNumber(metric?.invoice_count);
      const invoiceValue = toNumber(metric?.invoice_value);
      const invoiceProductCount = toNumber(metric?.invoice_product_count);

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        initials: getInitials(category.name),
        image_url: r2Url(category.r2_image_thumb_key) ?? r2Url(category.r2_image_medium_key),
        is_active: category.is_active,
        active_sku_count: totalSkuCount,
        total_sku_count: totalSkuCount,
        invoice_product_count: invoiceProductCount,
        oos_sku_count: oosSkuCount,
        low_stock_sku_count: lowStockSkuCount,
        stock_on_hand: stockOnHand,
        brand_count: brandCount,
        gmv_mtd: invoiceValue,
        invoice_value: invoiceValue,
        invoice_count: invoiceCount,
        invoice_buyer_count: toNumber(metric?.invoice_buyer_count),
        buyers_count: toNumber(metric?.invoice_buyer_count),
      };
    });

    const filtered = rows
      .filter((row) => {
        const sold = Number(row.invoice_count) > 0;
        if (selectedStatus.size > 0) {
          const statusOk = [...selectedStatus].some((status) => {
            if (status === 'Active') return row.is_active && sold;
            if (status === 'Dormant') return row.is_active && !sold;
            if (status === 'Inactive') return !row.is_active;
            return false;
          });
          if (!statusOk) return false;
        }
        if (productParams.length > 0) {
          const productOk = productParams.some((mode) => {
            if (mode === 'Has Products') return row.total_sku_count > 0;
            if (mode === 'Empty') return row.total_sku_count === 0;
            return false;
          });
          if (!productOk) return false;
        }
        if (selectedStock.size > 0) {
          const stockOk = [...selectedStock].some((stock) => {
            if (stock === 'Out of stock') return row.total_sku_count > 0 && row.stock_on_hand <= 0;
            if (stock === 'Low stock') return row.low_stock_sku_count > 0;
            if (stock === 'In stock') return row.stock_on_hand > 0 && row.low_stock_sku_count === 0;
            return false;
          });
          if (!stockOk) return false;
        }
        return !search || row.name.toLowerCase().includes(search) || row.slug.toLowerCase().includes(search);
      })
      .sort((a, b) => compareRows(a, b, sort));

    const afterCursor = filtered.filter((row) => passesCursor(row, sort, cursor));
    const pageRows = afterCursor.slice(0, limit);
    const hasNext = afterCursor.length > limit;
    const last = pageRows.at(-1);

    return timedJson({
      rows: pageRows,
      total: filtered.length,
      limit,
      nextCursor: hasNext && last ? encodeCursor({ v: sortValue(last, sort), i: last.id }) : null,
      period,
      period_key: period.period_key,
      grain: period.grain,
      sort,
      filters: {
        groups: [
          { key: 'status', label: 'Status', options: [{ value: 'Active', label: 'Active' }, { value: 'Dormant', label: 'Dormant' }, { value: 'Inactive', label: 'Inactive' }] },
          { key: 'products', label: 'Products', options: [{ value: 'Has Products', label: 'Has Products' }, { value: 'Empty', label: 'Empty' }] },
          { key: 'stock', label: 'Stock', options: [{ value: 'In stock', label: 'In stock' }, { value: 'Low stock', label: 'Low stock' }, { value: 'Out of stock', label: 'Out of stock' }] },
        ],
      },
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[GET /api/tenant/categories/landing]', err?.code, err?.message);
    return timedJson({ error: 'Failed to fetch categories landing' }, { status: 500 });
  }
}
