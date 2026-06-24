import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import type {
  CategoryLandingKpis,
  CategoryTableRow,
  CategoryCalloutRow,
  CategoriesLandingResponse,
} from '@/hooks/useCategories';

export const dynamic = 'force-dynamic';

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

  // 30 days ago for avg_days_cover computation
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  try {
    const [
      categoriesRes,
      snapshotRes,
      currentKpiRes,
      prevKpiRes,
      productsRes,
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

      // Products with inventory for SKU health per category
      db
        .schema('app')
        .from('tenant_products')
        .select('id, tenant_category_id, tenant_brand_id, is_active, tenant_inventory(qty_available, reorder_point)')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('is_active', true),

      // Last-30d units sold per product for avg_days_cover approximation
      db
        .schema('app')
        .from('kpi_product_daily')
        .select('tenant_product_id, units_sold')
        .eq('tenant_id', tenantId)
        .gte('day', thirtyDaysAgoStr),
    ]);

    if (categoriesRes.error) throw categoriesRes.error;

    const rawCategories: Array<{ id: string; name: string; slug: string; is_active: boolean; deleted_at: string | null; created_at: string }> =
      categoriesRes.data ?? [];
    const snap = snapshotRes.data as { active_count: number; low_stock_count: number; uncategorized_count: number } | null;

    // Aggregate current-period KPI by category
    const currentKpi = (currentKpiRes.data ?? []) as Array<{ tenant_category_id: string; gmv: number; units_sold: number; buyers_count: number }>;
    const prevKpi = (prevKpiRes.data ?? []) as Array<{ tenant_category_id: string; gmv: number }>;

    const gmvCurrentByCategory = new Map<string, number>();
    const unitsByCategory = new Map<string, number>();
    const buyersByCategory = new Map<string, number>();
    for (const row of currentKpi) {
      const cid = row.tenant_category_id;
      gmvCurrentByCategory.set(cid, (gmvCurrentByCategory.get(cid) ?? 0) + Number(row.gmv ?? 0));
      unitsByCategory.set(cid, (unitsByCategory.get(cid) ?? 0) + Number(row.units_sold ?? 0));
      buyersByCategory.set(cid, (buyersByCategory.get(cid) ?? 0) + Number(row.buyers_count ?? 0));
    }
    const gmvPrevByCategory = new Map<string, number>();
    for (const row of prevKpi) {
      const cid = row.tenant_category_id;
      gmvPrevByCategory.set(cid, (gmvPrevByCategory.get(cid) ?? 0) + Number(row.gmv ?? 0));
    }

    // Aggregate SKU health + brand count per category
    const products = (productsRes.data ?? []) as Array<{
      id: string;
      tenant_category_id: string | null;
      tenant_brand_id: string | null;
      is_active: boolean;
      tenant_inventory: Array<{ qty_available: number; reorder_point: number | null }> | null;
    }>;

    type SkuStats = { active: number; oos: number; low_stock: number; brands: Set<string>; product_ids: string[] };
    const skuByCategory = new Map<string, SkuStats>();
    for (const p of products) {
      const cid = p.tenant_category_id;
      if (!cid) continue;
      if (!skuByCategory.has(cid)) {
        skuByCategory.set(cid, { active: 0, oos: 0, low_stock: 0, brands: new Set(), product_ids: [] });
      }
      const stat = skuByCategory.get(cid)!;
      stat.active++;
      stat.product_ids.push(p.id);
      if (p.tenant_brand_id) stat.brands.add(p.tenant_brand_id);
      const inv = p.tenant_inventory?.[0];
      if (inv) {
        const qty = Number(inv.qty_available ?? 0);
        if (qty <= 0) stat.oos++;
        else if (inv.reorder_point != null && qty <= Number(inv.reorder_point)) stat.low_stock++;
      }
    }

    // Build product → qty_available map and product → units_30d map for avg_days_cover
    const productQty = new Map<string, number>();
    for (const p of products) {
      const inv = p.tenant_inventory?.[0];
      if (inv) productQty.set(p.id, Number(inv.qty_available ?? 0));
    }
    const units30dByProduct = new Map<string, number>();
    const rawUnits = (unitsRes.data ?? []) as Array<{ tenant_product_id: string; units_sold: number }>;
    for (const row of rawUnits) {
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
        } else if (qty > 0) {
          covers.push(999); // treat as well-covered if no sales but has stock
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

    const activeRows = rows.filter((r) => r.is_active);
    const totalGmv = activeRows.reduce((s, r) => s + r.gmv_mtd, 0);
    const topCategory = activeRows.reduce<CategoryTableRow | null>(
      (best, r) => (best === null || r.gmv_mtd > best.gmv_mtd ? r : best),
      null,
    );

    const kpis: CategoryLandingKpis = {
      active_count: Number(snap?.active_count ?? activeRows.length),
      low_stock_count: Number(snap?.low_stock_count ?? 0),
      top_category_name: topCategory?.name ?? null,
      top_category_share_pct:
        topCategory && totalGmv > 0 ? Math.round((topCategory.gmv_mtd / totalGmv) * 100) : 0,
      uncategorized_count: Number(snap?.uncategorized_count ?? 0),
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

    const payload: CategoriesLandingResponse = {
      kpis,
      callouts: { stockout_risk, top_performers, fast_movers },
      rows,
      period: period.selected,
    };

    return timedJson(payload);
  } catch (error: any) {
    console.error('[GET /api/tenant/categories/landing]', error?.code, error?.message);
    return timedJson({ error: 'Failed to fetch categories landing' }, { status: 500 });
  }
}
