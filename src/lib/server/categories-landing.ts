import type {
  CategoriesLandingResponse,
  CategoryCalloutRow,
  CategoryLandingKpis,
  CategoryTableRow,
} from '@/hooks/useCategories';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { chunkArray, POSTGREST_IN_CHUNK_SIZE } from '@/lib/server/warehouse-data';

type CategoryInventoryRow = {
  tenant_product_id: string;
  qty_available?: number | null;
  reorder_point?: number | null;
};

export interface CategoriesLandingFilters {
  search: string;
  status: string[];
  products: string[];
  limit: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

async function loadInventoryForProducts(
  db: any,
  productIds: string[],
): Promise<CategoryInventoryRow[]> {
  if (productIds.length === 0) return [];

  const rows: CategoryInventoryRow[] = [];
  for (const chunk of chunkArray(productIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data, error } = await db
      .schema('app')
      .from('tenant_inventory')
      .select('tenant_product_id, qty_available, reorder_point')
      .in('tenant_product_id', chunk)
      .is('deleted_at', null);

    if (error) throw error;
    rows.push(...((data ?? []) as CategoryInventoryRow[]));
  }

  return rows;
}

async function loadKpiProductDailyUnits(
  db: any,
  tenantId: string,
  productIds: string[],
  sinceDay: string,
): Promise<Array<{ tenant_product_id: string; units_sold: number }>> {
  if (productIds.length === 0) return [];

  const rows: Array<{ tenant_product_id: string; units_sold: number }> = [];
  for (const chunk of chunkArray(productIds, POSTGREST_IN_CHUNK_SIZE)) {
    const { data, error } = await db
      .schema('app')
      .from('kpi_product_daily')
      .select('tenant_product_id, units_sold')
      .eq('tenant_id', tenantId)
      .in('tenant_product_id', chunk)
      .gte('day', sinceDay);

    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ tenant_product_id: string; units_sold: number }>));
  }

  return rows;
}

export async function getCategoriesLandingPayload(
  db: any,
  tenantId: string,
  periodInput: string | null | undefined,
  filters: CategoriesLandingFilters,
): Promise<CategoriesLandingResponse> {
  const period = getSellerLandingPeriodMeta(periodInput);
  const { search, status: statusFilter, products: productFilter, limit } = filters;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]!;

  const [categoriesRes, snapshotRes, currentKpiRes, prevKpiRes, productsRes] = await Promise.all([
    db
      .schema('app')
      .from('tenant_categories')
      .select('id, name, slug, is_active, deleted_at, created_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    db
      .schema('app')
      .from('categories_snapshot')
      .select('active_count, low_stock_count, uncategorized_count')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db
      .schema('app')
      .from('kpi_category_daily')
      .select('tenant_category_id, gmv, units_sold, buyers_count')
      .eq('tenant_id', tenantId)
      .gte('day', period.current_start.split('T')[0])
      .lt('day', period.current_end_exclusive.split('T')[0]),
    db
      .schema('app')
      .from('kpi_category_daily')
      .select('tenant_category_id, gmv')
      .eq('tenant_id', tenantId)
      .gte('day', period.previous_start.split('T')[0])
      .lt('day', period.previous_end_exclusive.split('T')[0]),
    db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_category_id, tenant_brand_id, is_active')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('is_active', true),
  ]);

  if (
    categoriesRes.error ||
    snapshotRes.error ||
    currentKpiRes.error ||
    prevKpiRes.error ||
    productsRes.error
  ) {
    throw (
      categoriesRes.error ??
      snapshotRes.error ??
      currentKpiRes.error ??
      prevKpiRes.error ??
      productsRes.error
    );
  }

  const rawCategories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    deleted_at: string | null;
    created_at: string;
  }>;
  const snap = snapshotRes.data as {
    active_count: number;
    low_stock_count: number;
    uncategorized_count: number;
  } | null;

  const products = (productsRes.data ?? []) as Array<{
    id: string;
    tenant_category_id: string | null;
    tenant_brand_id: string | null;
    is_active: boolean;
  }>;
  const productIds = products.map((product) => product.id);

  const [inventoryRows, units30dRows] = await Promise.all([
    loadInventoryForProducts(db, productIds),
    loadKpiProductDailyUnits(db, tenantId, productIds, thirtyDaysAgoStr),
  ]);

  const gmvCurrentByCategory = new Map<string, number>();
  const unitsByCategory = new Map<string, number>();
  const buyersByCategory = new Map<string, number>();
  const gmvPrevByCategory = new Map<string, number>();

  for (const row of (currentKpiRes.data ?? []) as Array<{
    tenant_category_id: string;
    gmv: number;
    units_sold: number;
    buyers_count: number;
  }>) {
    const cid = row.tenant_category_id;
    gmvCurrentByCategory.set(cid, (gmvCurrentByCategory.get(cid) ?? 0) + Number(row.gmv ?? 0));
    unitsByCategory.set(cid, (unitsByCategory.get(cid) ?? 0) + Number(row.units_sold ?? 0));
    buyersByCategory.set(cid, (buyersByCategory.get(cid) ?? 0) + Number(row.buyers_count ?? 0));
  }

  for (const row of (prevKpiRes.data ?? []) as Array<{ tenant_category_id: string; gmv: number }>) {
    const cid = row.tenant_category_id;
    gmvPrevByCategory.set(cid, (gmvPrevByCategory.get(cid) ?? 0) + Number(row.gmv ?? 0));
  }

  type SkuStats = { active: number; oos: number; low_stock: number; brands: Set<string>; product_ids: string[] };
  const skuByCategory = new Map<string, SkuStats>();

  for (const product of products) {
    const cid = product.tenant_category_id;
    if (!cid) continue;
    if (!skuByCategory.has(cid)) {
      skuByCategory.set(cid, { active: 0, oos: 0, low_stock: 0, brands: new Set(), product_ids: [] });
    }
    const stat = skuByCategory.get(cid)!;
    stat.active++;
    stat.product_ids.push(product.id);
    if (product.tenant_brand_id) stat.brands.add(product.tenant_brand_id);

    const inventoryForProduct = inventoryRows.filter((row) => row.tenant_product_id === product.id);
    const qty = inventoryForProduct.reduce((sum, row) => sum + Number(row.qty_available ?? 0), 0);
    const reorderPoint = inventoryForProduct.reduce(
      (max, row) => Math.max(max, Number(row.reorder_point ?? 0)),
      0,
    );
    if (inventoryForProduct.length > 0) {
      if (qty <= 0) stat.oos++;
      else if (reorderPoint > 0 && qty <= reorderPoint) stat.low_stock++;
    }
  }

  const productQty = new Map<string, number>();
  for (const row of inventoryRows) {
    productQty.set(
      row.tenant_product_id,
      (productQty.get(row.tenant_product_id) ?? 0) + Number(row.qty_available ?? 0),
    );
  }

  const units30dByProduct = new Map<string, number>();
  for (const row of units30dRows) {
    units30dByProduct.set(
      row.tenant_product_id,
      (units30dByProduct.get(row.tenant_product_id) ?? 0) + Number(row.units_sold ?? 0),
    );
  }

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

  const activeRows = rows.filter((row) => row.is_active);
  const filteredRows = rows.filter((row) => {
    const statusOk =
      statusFilter.length === 0 ||
      statusFilter.some((value) => {
        if (value === 'Active') return row.is_active;
        if (value === 'Inactive') return !row.is_active;
        return false;
      });
    const productOk =
      productFilter.length === 0 ||
      productFilter.some((value) => {
        if (value === 'Has Products') return row.active_sku_count > 0;
        if (value === 'Empty') return row.active_sku_count === 0;
        return false;
      });
    const searchOk = !search || row.name.toLowerCase().includes(search);
    return statusOk && productOk && searchOk;
  });

  const totalGmv = activeRows.reduce((sum, row) => sum + row.gmv_mtd, 0);
  const topCategory = activeRows.reduce<CategoryTableRow | null>(
    (best, row) => (best === null || row.gmv_mtd > best.gmv_mtd ? row : best),
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

  const stockout_risk: CategoryCalloutRow[] = [...activeRows]
    .filter((row) => row.oos_sku_count > 0)
    .sort((a, b) => b.oos_sku_count - a.oos_sku_count)
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      name: row.name,
      initials: row.initials,
      oos_sku_count: row.oos_sku_count,
      low_stock_sku_count: row.low_stock_sku_count,
    }));

  const top_performers: CategoryCalloutRow[] = [...activeRows]
    .filter((row) => row.gmv_mtd > 0)
    .sort((a, b) => b.gmv_mtd - a.gmv_mtd)
    .slice(0, 2)
    .map((row) => ({
      id: row.id,
      name: row.name,
      initials: row.initials,
      gmv_mtd: row.gmv_mtd,
      growth_pct: row.growth_pct,
      buyers_count: row.buyers_count,
    }));

  const fast_movers: CategoryCalloutRow[] = [...activeRows]
    .filter((row) => row.units_mtd > 0)
    .sort((a, b) => b.units_mtd - a.units_mtd)
    .slice(0, 2)
    .map((row) => ({
      id: row.id,
      name: row.name,
      initials: row.initials,
      units_mtd: row.units_mtd,
      growth_pct: row.growth_pct,
    }));

  return {
    kpis,
    callouts: { stockout_risk, top_performers, fast_movers },
    rows: filteredRows.slice(0, limit),
    total: filteredRows.length,
    period: period.selected,
  };
}
