import { unstable_cache } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';

type DashboardKpi = {
  ordersThisWeek: number;
  ordersDelta: number;
  gmvThisWeek: number;
  gmvDeltaPct: number;
  activeCatalogs: number;
  expiringCatalogs: number;
  lowStockAlerts: number;
  lowStockDelta: number;
};

type BrandPerf = {
  id: string;
  initials: string;
  name: string;
  trend: string;
  pct: number;
  hue: 'teal' | 'ember' | 'cream';
};

type RecentOrder = {
  id: string;
  buyer: string;
  status: string;
  total: number;
};

export type SellerDashboardData = {
  kpi: DashboardKpi;
  topBrands: BrandPerf[];
  recentOrders: RecentOrder[];
};

function formatBrandInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getCurrentIstDate() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekRange(endDate: Date) {
  const end = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1));
  const start = new Date(Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 6));
  return { start: toDayKey(start), endExclusive: toDayKey(end) };
}

function monthRange(nowIst: Date) {
  const start = new Date(Date.UTC(nowIst.getFullYear(), nowIst.getMonth(), 1));
  const end = new Date(Date.UTC(nowIst.getFullYear(), nowIst.getMonth() + 1, 1));
  return { start: toDayKey(start), endExclusive: toDayKey(end) };
}

function formatTrend(n: number): string {
  const rounded = Math.round(n);
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
}

function hueByIndex(index: number): 'teal' | 'ember' | 'cream' {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

async function fetchSellerDashboardData(tenantId: string): Promise<SellerDashboardData> {
  if (!supabaseAdmin) {
    return {
      kpi: {
        ordersThisWeek: 0,
        ordersDelta: 0,
        gmvThisWeek: 0,
        gmvDeltaPct: 0,
        activeCatalogs: 0,
        expiringCatalogs: 0,
        lowStockAlerts: 0,
        lowStockDelta: 0,
      },
      topBrands: [],
      recentOrders: [],
    };
  }

  const db = supabaseAdmin;
  const istNow = getCurrentIstDate();
  const todayKey = toDayKey(istNow);
  const thisWeek = weekRange(istNow);
  const lastWeekEnd = new Date(Date.UTC(istNow.getFullYear(), istNow.getMonth(), istNow.getDate() - 7));
  const lastWeek = weekRange(lastWeekEnd);
  const mtd = monthRange(istNow);

  const yesterday = new Date(Date.UTC(istNow.getFullYear(), istNow.getMonth(), istNow.getDate() - 1));

  const [thisWeekRes, lastWeekRes, catalogsRes, todayProductsRes, yesterdayProductsRes, recentOrdersRes, buyersRes, mtdProductKpiRes] = await Promise.all([
    db.schema('app').from('kpi_tenant_daily').select('orders_count, gmv').eq('tenant_id', tenantId).gte('day', thisWeek.start).lt('day', thisWeek.endExclusive).is('deleted_at', null),
    db.schema('app').from('kpi_tenant_daily').select('orders_count, gmv').eq('tenant_id', tenantId).gte('day', lastWeek.start).lt('day', lastWeek.endExclusive).is('deleted_at', null),
    db.schema('app').from('published_catalogs').select('id, valid_to, status').eq('tenant_id', tenantId).is('deleted_at', null),
    db.schema('app').from('kpi_product_daily').select('tenant_product_id, on_hand').eq('tenant_id', tenantId).eq('day', todayKey).is('deleted_at', null),
    db.schema('app').from('kpi_product_daily').select('tenant_product_id, on_hand').eq('tenant_id', tenantId).eq('day', toDayKey(yesterday)).is('deleted_at', null),
    db.schema('app').from('orders').select('order_number, buyer_id, status, total_amount, placed_at').eq('tenant_id', tenantId).is('deleted_at', null).order('placed_at', { ascending: false }).limit(5),
    db.schema('app').from('buyers').select('id, business_name').eq('tenant_id', tenantId).is('deleted_at', null),
    db.schema('app').from('kpi_product_daily').select('tenant_product_id, revenue').eq('tenant_id', tenantId).gte('day', mtd.start).lt('day', mtd.endExclusive).is('deleted_at', null),
  ]);

  const thisWeekRows = thisWeekRes.data ?? [];
  const lastWeekRows = lastWeekRes.data ?? [];

  const thisWeekOrders = thisWeekRows.reduce((sum, row) => sum + Number(row.orders_count ?? 0), 0);
  const lastWeekOrders = lastWeekRows.reduce((sum, row) => sum + Number(row.orders_count ?? 0), 0);
  const thisWeekGmv = thisWeekRows.reduce((sum, row) => sum + Number(row.gmv ?? 0), 0);
  const lastWeekGmv = lastWeekRows.reduce((sum, row) => sum + Number(row.gmv ?? 0), 0);

  const ordersDelta = thisWeekOrders - lastWeekOrders;
  const gmvDeltaPct = lastWeekGmv > 0 ? ((thisWeekGmv - lastWeekGmv) / lastWeekGmv) * 100 : thisWeekGmv > 0 ? 100 : 0;

  const catalogs = catalogsRes.data ?? [];
  const activeCatalogs = catalogs.filter((catalog) => catalog.status === 'published').length;
  const expiringCatalogs = catalogs.filter((catalog) => {
    if (!catalog.valid_to || catalog.status !== 'published') return false;
    const days = (new Date(catalog.valid_to).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return days > 0 && days <= 7;
  }).length;

  const todayProducts = todayProductsRes.data ?? [];
  const yesterdayProducts = yesterdayProductsRes.data ?? [];
  const lowStockAlerts = todayProducts.filter((row) => Number(row.on_hand ?? 0) > 0 && Number(row.on_hand ?? 0) < 14).length;
  const yesterdayLowStock = yesterdayProducts.filter((row) => Number(row.on_hand ?? 0) > 0 && Number(row.on_hand ?? 0) < 14).length;

  const buyers = new Map((buyersRes.data ?? []).map((row) => [row.id, row.business_name]));
  const recentOrders: RecentOrder[] = (recentOrdersRes.data ?? []).map((row) => ({
    id: row.order_number,
    buyer: buyers.get(row.buyer_id) ?? 'Unknown buyer',
    status: row.status,
    total: Number(row.total_amount ?? 0),
  }));

  const revenueByProduct = new Map<string, number>();
  for (const row of mtdProductKpiRes.data ?? []) {
    const key = row.tenant_product_id;
    revenueByProduct.set(key, (revenueByProduct.get(key) ?? 0) + Number(row.revenue ?? 0));
  }

  const topProductIds = Array.from(revenueByProduct.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([id]) => id);

  let topBrands: BrandPerf[] = [];
  if (topProductIds.length > 0) {
    const [tenantProductsRes, tenantBrandsRes] = await Promise.all([
      db.schema('app').from('tenant_products').select('id, tenant_brand_id').eq('tenant_id', tenantId).in('id', topProductIds).is('deleted_at', null),
      db.schema('app').from('tenant_brands').select('id, display_name_override, master_brand_id').eq('tenant_id', tenantId).is('deleted_at', null),
    ]);

    const tenantProducts = tenantProductsRes.data ?? [];
    const tenantBrands = tenantBrandsRes.data ?? [];
    const masterBrandIds = Array.from(new Set(tenantBrands.map((row) => row.master_brand_id).filter(Boolean)));
    const masterBrandsRes = masterBrandIds.length
      ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds).is('deleted_at', null)
      : { data: [] as Array<{ id: string; name: string }> };

    const tenantBrandById = new Map(tenantBrands.map((row) => [row.id, row]));
    const masterBrandById = new Map((masterBrandsRes.data ?? []).map((row) => [row.id, row.name]));

    const brandRevenue = new Map<string, number>();
    for (const product of tenantProducts) {
      const productRevenue = revenueByProduct.get(product.id) ?? 0;
      const tenantBrand = product.tenant_brand_id ? tenantBrandById.get(product.tenant_brand_id) : null;
      const brandName = tenantBrand?.display_name_override ?? (tenantBrand?.master_brand_id ? masterBrandById.get(tenantBrand.master_brand_id) : undefined) ?? 'Unknown brand';
      brandRevenue.set(brandName, (brandRevenue.get(brandName) ?? 0) + productRevenue);
    }

    const totalRevenue = Array.from(brandRevenue.values()).reduce((sum, value) => sum + value, 0);

    topBrands = Array.from(brandRevenue.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, revenue], index) => ({
        id: `${name}-${index}`,
        initials: formatBrandInitials(name),
        name,
        trend: formatTrend(totalRevenue > 0 ? (revenue / totalRevenue) * 20 : 0),
        pct: totalRevenue > 0 ? Math.max(8, Math.round((revenue / totalRevenue) * 100)) : 0,
        hue: hueByIndex(index),
      }));
  }

  return {
    kpi: {
      ordersThisWeek: thisWeekOrders,
      ordersDelta,
      gmvThisWeek: thisWeekGmv,
      gmvDeltaPct,
      activeCatalogs,
      expiringCatalogs,
      lowStockAlerts,
      lowStockDelta: lowStockAlerts - yesterdayLowStock,
    },
    topBrands,
    recentOrders,
  };
}

export async function getSellerDashboardData(tenantId: string) {
  return unstable_cache(
    () => fetchSellerDashboardData(tenantId),
    ['seller-dashboard', tenantId],
    { revalidate: 30, tags: [`seller-dashboard:${tenantId}`] },
  )();
}
