import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { parseRowsLimit, SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { getSellerLocationScope } from '@/lib/server/seller-location-access';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import type {
  CategoryLandingKpis,
  CategoryTableRow,
  CategoryCalloutRow,
  CategoriesLandingResponse,
} from '@/hooks/useCategories';

export const dynamic = 'force-dynamic';

type CategoryInventoryRow = {
  tenant_product_id: string;
  qty_available?: number | null;
  reorder_point?: number | null;
  location_id?: string | null;
};

type CategoryOrderRow = {
  id: string;
  buyer_id: string | null;
  status: string | null;
};

type CategoryOrderItemRow = {
  order_id: string;
  tenant_product_id: string;
  qty?: number | null;
  line_total?: number | null;
  unit_price?: number | null;
};

type CategoryInvoiceRow = {
  id: string;
  status: string | null;
};

type CategoryInvoiceItemRow = {
  invoice_id: string;
  tenant_product_id: string;
  qty?: number | null;
};

function metricNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function isOperationalOrderStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? '').toLowerCase();
  return !['void', 'cancelled', 'rejected', 'archived'].includes(normalized);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('categories_landing'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return timedJson({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
  if (!flagEnabled) return timedJson({ error: 'Feature not enabled' }, { status: 403 });

  const db = supabaseAdmin as any;
  const tenantId = claims.tenant_id;
  const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));
  const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
  const statusFilter = readArrayParam(request.nextUrl.searchParams, 'status');
  const productFilter = readArrayParam(request.nextUrl.searchParams, 'products');
  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
  const locationScope = getSellerLocationScope({
    role: claims.role ?? null,
    location_ids: claims.location_ids ?? null,
  });

  // 30 days ago for avg_days_cover computation
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  if (locationScope.mode === 'none') {
    const emptyPayload: CategoriesLandingResponse = {
      kpis: {
        active_count: 0,
        low_stock_count: 0,
        top_category_name: null,
        top_category_share_pct: 0,
        uncategorized_count: 0,
      },
      callouts: {
        stockout_risk: [],
        top_performers: [],
        fast_movers: [],
      },
      rows: [],
      period: period.selected,
    };

    return timedJson(emptyPayload);
  }

  try {
    const isAssistant = locationScope.mode === 'subset';
    const [
      categoriesRes,
      snapshotRes,
      currentKpiRes,
      prevKpiRes,
      productsRes,
      currentInventoryRes,
      unitsRes,
    ] = await Promise.all([
      // All categories for this tenant
      db
        .schema('app')
        .from('tenant_categories')
        .select('id, name, slug, is_active, deleted_at, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),

      // Tenant-level snapshot for InsightStrip4 tiles 1, 2, 4
      db
        .schema('app')
        .from('categories_snapshot')
        .select('active_count, low_stock_count, uncategorized_count')
        .eq('tenant_id', tenantId)
        .maybeSingle(),

      // Current period: sum GMV + units + buyers per category
      db
        .schema('app')
        .from('kpi_category_daily')
        .select('tenant_category_id, gmv, units_sold, buyers_count')
        .eq('tenant_id', tenantId)
        .gte('day', period.current_start.split('T')[0])
        .lt('day', period.current_end_exclusive.split('T')[0]),

      // Previous period: sum GMV per category (for growth %)
      db
        .schema('app')
        .from('kpi_category_daily')
        .select('tenant_category_id, gmv')
        .eq('tenant_id', tenantId)
        .gte('day', period.previous_start.split('T')[0])
        .lt('day', period.previous_end_exclusive.split('T')[0]),

      // Products for per-category inventory posture and scoped raw derivations.
      db
        .schema('app')
        .from('tenant_products')
        .select('id, tenant_category_id, tenant_brand_id, is_active')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('is_active', true),
      (() => {
        let query = db
          .schema('app')
          .from('tenant_inventory')
          .select('tenant_product_id, qty_available, reorder_point, location_id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);
        if (locationScope.mode === 'subset') {
          query = query.in('location_id', locationScope.locationIds);
        }
        return query;
      })(),

      // Last-30d units sold per product for avg_days_cover approximation
      locationScope.mode === 'all'
        ? db
            .schema('app')
            .from('kpi_product_daily')
            .select('tenant_product_id, units_sold')
            .eq('tenant_id', tenantId)
            .gte('day', thirtyDaysAgoStr)
        : Promise.resolve({ data: [] as Array<{ tenant_product_id: string; units_sold: number }>, error: null }),
    ]);

    if (
      categoriesRes.error ||
      snapshotRes.error ||
      currentKpiRes.error ||
      prevKpiRes.error ||
      productsRes.error ||
      currentInventoryRes.error ||
      unitsRes.error
    ) {
      throw categoriesRes.error ?? snapshotRes.error ?? currentKpiRes.error ?? prevKpiRes.error ?? productsRes.error ?? currentInventoryRes.error ?? unitsRes.error;
    }

    const rawCategories: Array<{ id: string; name: string; slug: string; is_active: boolean; deleted_at: string | null; created_at: string }> =
      categoriesRes.data ?? [];
    const snap = snapshotRes.data as { active_count: number; low_stock_count: number; uncategorized_count: number } | null;

    // Aggregate current-period KPI by category
    const gmvCurrentByCategory = new Map<string, number>();
    const unitsByCategory = new Map<string, number>();
    const buyersByCategory = new Map<string, number>();
    const gmvPrevByCategory = new Map<string, number>();
    let units30dRows = (unitsRes.data ?? []) as Array<{ tenant_product_id: string; units_sold: number }>;

    const products = (productsRes.data ?? []) as Array<{
      id: string;
      tenant_category_id: string | null;
      tenant_brand_id: string | null;
      is_active: boolean;
    }>;
    const inventoryRows = (currentInventoryRes.data ?? []) as CategoryInventoryRow[];
    const productToCategory = new Map<string, string>();
    for (const product of products) {
      if (product.tenant_category_id) {
        productToCategory.set(product.id, product.tenant_category_id);
      }
    }

    if (isAssistant) {
      const [currentOrdersRes, prevOrdersRes, recentInvoicesRes] = await Promise.all([
        db
          .schema('app')
          .from('orders')
          .select('id, buyer_id, status')
          .eq('tenant_id', tenantId)
          .in('location_id', locationScope.locationIds)
          .gte('order_date', period.current_start)
          .lt('order_date', period.current_end_exclusive)
          .is('deleted_at', null),
        db
          .schema('app')
          .from('orders')
          .select('id, buyer_id, status')
          .eq('tenant_id', tenantId)
          .in('location_id', locationScope.locationIds)
          .gte('order_date', period.previous_start)
          .lt('order_date', period.previous_end_exclusive)
          .is('deleted_at', null),
        db
          .schema('app')
          .from('invoices')
          .select('id, status')
          .eq('tenant_id', tenantId)
          .in('location_id', locationScope.locationIds)
          .gte('invoice_date', thirtyDaysAgoStr)
          .is('deleted_at', null),
      ]);

      if (currentOrdersRes.error || prevOrdersRes.error || recentInvoicesRes.error) {
        throw currentOrdersRes.error ?? prevOrdersRes.error ?? recentInvoicesRes.error;
      }

      const currentOrders = ((currentOrdersRes.data ?? []) as CategoryOrderRow[])
        .filter((row) => isOperationalOrderStatus(row.status));
      const prevOrders = ((prevOrdersRes.data ?? []) as CategoryOrderRow[])
        .filter((row) => isOperationalOrderStatus(row.status));
      const currentOrderIds = currentOrders.map((row) => row.id);
      const prevOrderIds = prevOrders.map((row) => row.id);
      const recentInvoiceIds = ((recentInvoicesRes.data ?? []) as CategoryInvoiceRow[])
        .filter((row) => !['draft', 'void', 'cancelled', 'rejected', 'archived'].includes((row.status ?? '').toLowerCase()))
        .map((row) => row.id);

      const [currentOrderItemsRes, prevOrderItemsRes, recentInvoiceItemsRes] = await Promise.all([
        currentOrderIds.length > 0
          ? db
              .schema('app')
              .from('order_items')
              .select('order_id, tenant_product_id, qty, line_total, unit_price')
              .in('order_id', currentOrderIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as CategoryOrderItemRow[], error: null }),
        prevOrderIds.length > 0
          ? db
              .schema('app')
              .from('order_items')
              .select('order_id, tenant_product_id, qty, line_total, unit_price')
              .in('order_id', prevOrderIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as CategoryOrderItemRow[], error: null }),
        recentInvoiceIds.length > 0
          ? db
              .schema('app')
              .from('invoice_items')
              .select('invoice_id, tenant_product_id, qty')
              .in('invoice_id', recentInvoiceIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as CategoryInvoiceItemRow[], error: null }),
      ]);

      if (currentOrderItemsRes.error || prevOrderItemsRes.error || recentInvoiceItemsRes.error) {
        throw currentOrderItemsRes.error ?? prevOrderItemsRes.error ?? recentInvoiceItemsRes.error;
      }

      const buyersByCategorySet = new Map<string, Set<string>>();
      const currentOrderBuyerById = new Map(
        currentOrders.map((row) => [row.id, row.buyer_id]),
      );

      for (const row of (currentOrderItemsRes.data ?? []) as CategoryOrderItemRow[]) {
        const categoryId = productToCategory.get(row.tenant_product_id);
        if (!categoryId) continue;
        const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
        gmvCurrentByCategory.set(categoryId, (gmvCurrentByCategory.get(categoryId) ?? 0) + revenue);
        unitsByCategory.set(categoryId, (unitsByCategory.get(categoryId) ?? 0) + metricNumber(row.qty));
        const buyerId = currentOrderBuyerById.get(row.order_id);
        if (typeof buyerId === 'string' && buyerId.length > 0) {
          const buyerSet = buyersByCategorySet.get(categoryId) ?? new Set<string>();
          buyerSet.add(buyerId);
          buyersByCategorySet.set(categoryId, buyerSet);
        }
      }

      for (const [categoryId, buyerSet] of buyersByCategorySet.entries()) {
        buyersByCategory.set(categoryId, buyerSet.size);
      }

      for (const row of (prevOrderItemsRes.data ?? []) as CategoryOrderItemRow[]) {
        const categoryId = productToCategory.get(row.tenant_product_id);
        if (!categoryId) continue;
        const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
        gmvPrevByCategory.set(categoryId, (gmvPrevByCategory.get(categoryId) ?? 0) + revenue);
      }

      const units30dByProduct = new Map<string, number>();
      for (const row of (recentInvoiceItemsRes.data ?? []) as CategoryInvoiceItemRow[]) {
        units30dByProduct.set(row.tenant_product_id, (units30dByProduct.get(row.tenant_product_id) ?? 0) + metricNumber(row.qty));
      }

      for (const row of units30dRows) {
        units30dByProduct.set(row.tenant_product_id, (units30dByProduct.get(row.tenant_product_id) ?? 0) + Number(row.units_sold ?? 0));
      }

      units30dRows = Array.from(units30dByProduct.entries()).map(([tenant_product_id, units_sold]) => ({
        tenant_product_id,
        units_sold,
      }));
    } else {
      const currentKpi = (currentKpiRes.data ?? []) as Array<{ tenant_category_id: string; gmv: number; units_sold: number; buyers_count: number }>;
      const prevKpi = (prevKpiRes.data ?? []) as Array<{ tenant_category_id: string; gmv: number }>;

      for (const row of currentKpi) {
        const cid = row.tenant_category_id;
        gmvCurrentByCategory.set(cid, (gmvCurrentByCategory.get(cid) ?? 0) + Number(row.gmv ?? 0));
        unitsByCategory.set(cid, (unitsByCategory.get(cid) ?? 0) + Number(row.units_sold ?? 0));
        buyersByCategory.set(cid, (buyersByCategory.get(cid) ?? 0) + Number(row.buyers_count ?? 0));
      }

      for (const row of prevKpi) {
        const cid = row.tenant_category_id;
        gmvPrevByCategory.set(cid, (gmvPrevByCategory.get(cid) ?? 0) + Number(row.gmv ?? 0));
      }
    }

    type SkuStats = { active: number; oos: number; low_stock: number; brands: Set<string>; product_ids: string[] };
    const skuByCategory = new Map<string, SkuStats>();
    const scopedProductIds = new Set(
      locationScope.mode === 'subset'
        ? inventoryRows.map((row) => row.tenant_product_id)
        : products.map((row) => row.id),
    );
    for (const p of products) {
      if (locationScope.mode === 'subset' && !scopedProductIds.has(p.id)) continue;
      const cid = p.tenant_category_id;
      if (!cid) continue;
      if (!skuByCategory.has(cid)) {
        skuByCategory.set(cid, { active: 0, oos: 0, low_stock: 0, brands: new Set(), product_ids: [] });
      }
      const stat = skuByCategory.get(cid)!;
      stat.active++;
      stat.product_ids.push(p.id);
      if (p.tenant_brand_id) stat.brands.add(p.tenant_brand_id);
      const inventoryForProduct = inventoryRows.filter((row) => row.tenant_product_id === p.id);
      const qty = inventoryForProduct.reduce((sum, row) => sum + Number(row.qty_available ?? 0), 0);
      const reorderPoint = inventoryForProduct.reduce((max, row) => Math.max(max, Number(row.reorder_point ?? 0)), 0);
      if (inventoryForProduct.length > 0) {
        if (qty <= 0) stat.oos++;
        else if (reorderPoint > 0 && qty <= reorderPoint) stat.low_stock++;
      }
    }

    // Build product → qty_available map and product → units_30d map for avg_days_cover
    const productQty = new Map<string, number>();
    for (const row of inventoryRows) {
      productQty.set(row.tenant_product_id, (productQty.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0));
    }
    const units30dByProduct = new Map<string, number>();
    for (const row of units30dRows) {
      units30dByProduct.set(row.tenant_product_id, (units30dByProduct.get(row.tenant_product_id) ?? 0) + Number(row.units_sold ?? 0));
    }

    // Compute avg_days_cover per category
    const avgDaysCoverByCategory = new Map<string, number | null>();
    for (const [cid, stat] of skuByCategory.entries()) {
      const covers: number[] = [];
      for (const pid of stat.product_ids) {
        const qty = productQty.get(pid) ?? 0;
        const units30d = units30dByProduct.get(pid) ?? 0;
        if (units30d > 0) {
          covers.push((qty * 30) / units30d);
        }
      }
      avgDaysCoverByCategory.set(
        cid,
        covers.length > 0 ? Math.round(covers.reduce((a, b) => a + b, 0) / covers.length) : null,
      );
    }

    // Build rows
    const rows: CategoryTableRow[] = rawCategories.map((cat) => {
      const gmv_mtd = gmvCurrentByCategory.get(cat.id) ?? 0;
      const gmv_prev = gmvPrevByCategory.get(cat.id) ?? 0;
      const growth_pct = gmv_prev > 0 ? Math.round(((gmv_mtd - gmv_prev) / gmv_prev) * 100) : 0;
      const sku = skuByCategory.get(cat.id);
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        initials: getInitials(cat.name),
        is_active: cat.is_active,
        active_sku_count: sku?.active ?? 0,
        oos_sku_count: sku?.oos ?? 0,
        low_stock_sku_count: sku?.low_stock ?? 0,
        brand_count: sku?.brands.size ?? 0,
        gmv_mtd,
        gmv_prev,
        growth_pct,
        units_mtd: unitsByCategory.get(cat.id) ?? 0,
        buyers_count: buyersByCategory.get(cat.id) ?? 0,
        avg_days_cover: avgDaysCoverByCategory.get(cat.id) ?? null,
      };
    });

    const visibleRows = locationScope.mode === 'subset'
      ? rows.filter((row) => skuByCategory.has(row.id) || gmvCurrentByCategory.has(row.id) || gmvPrevByCategory.has(row.id))
      : rows;
    const activeRows = visibleRows.filter((r) => r.is_active);
    const filteredRows = visibleRows.filter((r) => {
      const statusOk =
        statusFilter.length === 0 ||
        statusFilter.some((value) => {
          if (value === 'Active') return r.is_active;
          if (value === 'Inactive') return !r.is_active;
          return false;
        });
      const productOk =
        productFilter.length === 0 ||
        productFilter.some((value) => {
          if (value === 'Has Products') return r.active_sku_count > 0;
          if (value === 'Empty') return r.active_sku_count === 0;
          return false;
        });
      const searchOk = !search || r.name.toLowerCase().includes(search);
      return statusOk && productOk && searchOk;
    });
    const totalGmv = activeRows.reduce((s, r) => s + r.gmv_mtd, 0);
    const topCategory = activeRows.reduce<CategoryTableRow | null>(
      (best, r) => (best === null || r.gmv_mtd > best.gmv_mtd ? r : best),
      null,
    );

    const kpis: CategoryLandingKpis = {
      active_count: Number(locationScope.mode === 'subset' ? activeRows.length : (snap?.active_count ?? activeRows.length)),
      low_stock_count: Number(locationScope.mode === 'subset' ? activeRows.filter((row) => row.low_stock_sku_count > 0 || row.oos_sku_count > 0).length : (snap?.low_stock_count ?? 0)),
      top_category_name: topCategory?.name ?? null,
      top_category_share_pct:
        topCategory && totalGmv > 0 ? Math.round((topCategory.gmv_mtd / totalGmv) * 100) : 0,
      uncategorized_count: Number(locationScope.mode === 'subset' ? visibleRows.filter((row) => row.name === 'Uncategorized').length : (snap?.uncategorized_count ?? 0)),
    };

    // Callouts
    const stockout_risk: CategoryCalloutRow[] = [...activeRows]
      .filter((r) => r.oos_sku_count > 0)
      .sort((a, b) => b.oos_sku_count - a.oos_sku_count)
      .slice(0, 3)
      .map((r) => ({ id: r.id, name: r.name, initials: r.initials, oos_sku_count: r.oos_sku_count, low_stock_sku_count: r.low_stock_sku_count }));

    const top_performers: CategoryCalloutRow[] = [...activeRows]
      .filter((r) => r.gmv_mtd > 0)
      .sort((a, b) => b.gmv_mtd - a.gmv_mtd)
      .slice(0, 2)
      .map((r) => ({ id: r.id, name: r.name, initials: r.initials, gmv_mtd: r.gmv_mtd, growth_pct: r.growth_pct, buyers_count: r.buyers_count }));

    const fast_movers: CategoryCalloutRow[] = [...activeRows]
      .filter((r) => r.units_mtd > 0)
      .sort((a, b) => b.units_mtd - a.units_mtd)
      .slice(0, 2)
      .map((r) => ({ id: r.id, name: r.name, initials: r.initials, units_mtd: r.units_mtd, growth_pct: r.growth_pct }));

    const pageRows = filteredRows.slice(0, limit);

    const payload: CategoriesLandingResponse = {
      kpis,
      callouts: { stockout_risk, top_performers, fast_movers },
      rows: pageRows,
      period: period.selected,
    };

    return timedJson(payload);
  } catch (error: any) {
    console.error('[GET /api/tenant/categories/landing]', error?.code, error?.message);
    return timedJson({ error: 'Failed to fetch categories landing' }, { status: 500 });
  }
}
