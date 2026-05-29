import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

type CatalogStatus = 'draft' | 'published' | 'archived';
type DisplayStatus = 'Live' | 'Draft' | 'Ended';
type StatusTone = 'success' | 'warning' | 'neutral';
type AvatarHue = 'teal' | 'ember' | 'cream';

interface CatalogRow {
  id: string;
  name: string;
  scope_type: 'cohort' | 'buyer' | 'geography' | 'all';
  scope_value: Record<string, unknown> | null;
  valid_from: string;
  valid_to: string | null;
  status: CatalogStatus;
  created_at: string;
}

interface CatalogItemRow {
  catalog_id: string;
  tenant_product_id: string;
}

interface TenantProductRow {
  id: string;
  tenant_brand_id: string | null;
}

interface TenantBrandRow {
  id: string;
  display_name_override: string | null;
  master_brand_id: string;
}

interface MasterBrandRow {
  id: string;
  name: string;
}

interface CohortRow {
  id: string;
  name: string;
}

interface OrderRow {
  id: string;
  catalog_id: string | null;
  total_amount: number | null;
  placed_at: string | null;
}

function getHue(index: number): AvatarHue {
  if (index % 3 === 0) return 'teal';
  if (index % 3 === 1) return 'ember';
  return 'cream';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getIstBoundaries(now = new Date()) {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const year = istNow.getFullYear();
  const month = istNow.getMonth();
  const day = istNow.getDate();

  const mtdStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const prevMonthSameDayExclusive = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

  return {
    mtdStartIso: mtdStart.toISOString(),
    nextMonthStartIso: nextMonthStart.toISOString(),
    prevMonthStartIso: prevMonthStart.toISOString(),
    prevMonthMtdEndIso: prevMonthSameDayExclusive.toISOString(),
  };
}

function getDisplayStatus(status: CatalogStatus, validTo: string | null, nowTs: number): DisplayStatus {
  if (status === 'draft') return 'Draft';
  if (status === 'archived') return 'Ended';
  if (validTo && new Date(validTo).getTime() < nowTs) return 'Ended';
  return 'Live';
}

function getStatusTone(status: DisplayStatus): StatusTone {
  if (status === 'Live') return 'success';
  if (status === 'Draft') return 'warning';
  return 'neutral';
}

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const db = supabaseAdmin;
    const now = new Date();
    const nowTs = now.getTime();
    const { mtdStartIso, nextMonthStartIso, prevMonthStartIso, prevMonthMtdEndIso } = getIstBoundaries(now);

    const [catalogsRes, itemsRes, ordersRes, prevOrdersRes, cohortsRes] = await Promise.all([
      db
        .schema('app')
        .from('published_catalogs')
        .select('id, name, scope_type, scope_value, valid_from, valid_to, status, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      db
        .schema('app')
        .from('published_catalog_items')
        .select('catalog_id, tenant_product_id')
        .is('deleted_at', null),
      db
        .schema('app')
        .from('orders')
        .select('id, catalog_id, total_amount, placed_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .not('catalog_id', 'is', null)
        .gte('placed_at', mtdStartIso)
        .lt('placed_at', nextMonthStartIso),
      db
        .schema('app')
        .from('orders')
        .select('id, catalog_id, total_amount, placed_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .not('catalog_id', 'is', null)
        .gte('placed_at', prevMonthStartIso)
        .lt('placed_at', prevMonthMtdEndIso),
      db.schema('app').from('cohorts').select('id, name').eq('tenant_id', tenantId).is('deleted_at', null),
    ]);

    if (catalogsRes.error || itemsRes.error || ordersRes.error || prevOrdersRes.error || cohortsRes.error) {
      console.error('[GET /api/tenant/catalogs] query error:', catalogsRes.error || itemsRes.error || ordersRes.error || prevOrdersRes.error || cohortsRes.error);
      return NextResponse.json({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
    }

    const catalogs = (catalogsRes.data ?? []) as CatalogRow[];
    const catalogIds = catalogs.map((catalog) => catalog.id);
    const items = ((itemsRes.data ?? []) as CatalogItemRow[]).filter((item) => catalogIds.includes(item.catalog_id));
    const orders = (ordersRes.data ?? []) as OrderRow[];
    const prevOrders = (prevOrdersRes.data ?? []) as OrderRow[];
    const cohorts = (cohortsRes.data ?? []) as CohortRow[];

    const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort.name]));

    const tenantProductIds = Array.from(new Set(items.map((item) => item.tenant_product_id)));

    let tenantProducts: TenantProductRow[] = [];
    let tenantBrands: TenantBrandRow[] = [];
    let masterBrands: MasterBrandRow[] = [];

    if (tenantProductIds.length > 0) {
      const tenantProductsRes = await db
        .schema('app')
        .from('tenant_products')
        .select('id, tenant_brand_id')
        .in('id', tenantProductIds)
        .is('deleted_at', null);

      if (tenantProductsRes.error) {
        console.error('[GET /api/tenant/catalogs] tenant products error:', tenantProductsRes.error);
        return NextResponse.json({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
      }

      tenantProducts = (tenantProductsRes.data ?? []) as TenantProductRow[];
      const tenantBrandIds = Array.from(new Set(tenantProducts.map((product) => product.tenant_brand_id).filter(Boolean)));

      if (tenantBrandIds.length > 0) {
        const tenantBrandsRes = await db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, master_brand_id')
          .in('id', tenantBrandIds)
          .is('deleted_at', null);

        if (tenantBrandsRes.error) {
          console.error('[GET /api/tenant/catalogs] tenant brands error:', tenantBrandsRes.error);
          return NextResponse.json({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
        }

        tenantBrands = (tenantBrandsRes.data ?? []) as TenantBrandRow[];

        const masterBrandIds = Array.from(new Set(tenantBrands.map((brand) => brand.master_brand_id)));
        if (masterBrandIds.length > 0) {
          const masterBrandsRes = await db
            .schema('catalog')
            .from('brands')
            .select('id, name')
            .in('id', masterBrandIds)
            .is('deleted_at', null);

          if (masterBrandsRes.error) {
            console.error('[GET /api/tenant/catalogs] master brands error:', masterBrandsRes.error);
            return NextResponse.json({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
          }

          masterBrands = (masterBrandsRes.data ?? []) as MasterBrandRow[];
        }
      }
    }

    const tenantProductToBrand = new Map<string, string | null>(tenantProducts.map((product) => [product.id, product.tenant_brand_id]));
    const tenantBrandById = new Map(tenantBrands.map((brand) => [brand.id, brand]));
    const masterBrandById = new Map(masterBrands.map((brand) => [brand.id, brand.name]));

    const itemsByCatalog = new Map<string, CatalogItemRow[]>();
    for (const item of items) {
      if (!itemsByCatalog.has(item.catalog_id)) itemsByCatalog.set(item.catalog_id, []);
      itemsByCatalog.get(item.catalog_id)?.push(item);
    }

    const ordersByCatalog = new Map<string, OrderRow[]>();
    const prevOrdersByCatalog = new Map<string, OrderRow[]>();

    for (const order of orders) {
      if (!order.catalog_id) continue;
      if (!ordersByCatalog.has(order.catalog_id)) ordersByCatalog.set(order.catalog_id, []);
      ordersByCatalog.get(order.catalog_id)?.push(order);
    }

    for (const order of prevOrders) {
      if (!order.catalog_id) continue;
      if (!prevOrdersByCatalog.has(order.catalog_id)) prevOrdersByCatalog.set(order.catalog_id, []);
      prevOrdersByCatalog.get(order.catalog_id)?.push(order);
    }

    const catalogRows = catalogs.map((catalog, index) => {
      const displayStatus = getDisplayStatus(catalog.status, catalog.valid_to, nowTs);
      const tone = getStatusTone(displayStatus);
      const catalogItems = itemsByCatalog.get(catalog.id) ?? [];
      const ordersForCatalog = ordersByCatalog.get(catalog.id) ?? [];
      const gmv = ordersForCatalog.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
      const orderCount = ordersForCatalog.length;
      const views = 0;
      const conversionPct = views > 0 ? Number(((orderCount / views) * 100).toFixed(1)) : 0;
      const brandSet = new Set<string>();

      for (const item of catalogItems) {
        const tenantBrandId = tenantProductToBrand.get(item.tenant_product_id);
        if (!tenantBrandId) continue;
        const tenantBrand = tenantBrandById.get(tenantBrandId);
        if (!tenantBrand) continue;
        const brandName = tenantBrand.display_name_override ?? masterBrandById.get(tenantBrand.master_brand_id) ?? null;
        if (brandName) brandSet.add(brandName);
      }

      const cohortId = catalog.scope_type === 'cohort' ? (catalog.scope_value?.cohort_id as string | undefined) : undefined;
      const cohortName = cohortId ? (cohortById.get(cohortId) ?? 'Unknown cohort') : catalog.scope_type === 'all' ? 'All buyers' : 'Targeted';

      const daysLeft =
        catalog.valid_to && displayStatus === 'Live'
          ? Math.max(0, Math.ceil((new Date(catalog.valid_to).getTime() - nowTs) / (1000 * 60 * 60 * 24)))
          : null;

      return {
        id: catalog.id,
        name: catalog.name,
        initials: getInitials(catalog.name),
        hue: getHue(index),
        status: {
          value: catalog.status,
          label: displayStatus,
          tone,
        },
        cohort_name: cohortName,
        products_count: catalogItems.length,
        brands_count: brandSet.size,
        gmv,
        orders: orderCount,
        views,
        conversion_pct: conversionPct,
        valid_from: catalog.valid_from,
        valid_to: catalog.valid_to,
        valid_until_label: catalog.valid_to ? new Date(catalog.valid_to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'No end date',
        days_left: daysLeft,
        created_at: catalog.created_at,
      };
    });

    const liveCatalogs = catalogRows.filter((catalog) => catalog.status.label === 'Live');
    const draftCatalogs = catalogRows.filter((catalog) => catalog.status.label === 'Draft');
    const endedCatalogs = catalogRows.filter((catalog) => catalog.status.label === 'Ended');

    const gmvMtd = orders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    const gmvPrevMtd = prevOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
    const gmvGrowthPct = gmvPrevMtd > 0 ? Math.round(((gmvMtd - gmvPrevMtd) / gmvPrevMtd) * 100) : gmvMtd > 0 ? 100 : 0;

    const avgConversion =
      liveCatalogs.length > 0
        ? Number((liveCatalogs.reduce((sum, catalog) => sum + catalog.conversion_pct, 0) / liveCatalogs.length).toFixed(1))
        : 0;

    const needsAttention = catalogRows
      .filter((catalog) => catalog.status.label === 'Draft' || catalog.status.label === 'Ended' || (catalog.days_left != null && catalog.days_left <= 5 && catalog.days_left > 0))
      .slice(0, 3);

    const topPerformers = [...liveCatalogs].sort((a, b) => b.gmv - a.gmv).slice(0, 2);

    const latestByCohort = new Map<string, Array<typeof catalogRows[number]>>();
    for (const catalog of [...catalogRows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
      const key = catalog.cohort_name;
      if (!latestByCohort.has(key)) latestByCohort.set(key, []);
      latestByCohort.get(key)?.push(catalog);
    }

    const withGrowth = catalogRows.map((catalog) => {
      const cohortCatalogs = latestByCohort.get(catalog.cohort_name) ?? [];
      const index = cohortCatalogs.findIndex((row) => row.id === catalog.id);
      const prev = index > 0 ? cohortCatalogs[index - 1] : null;
      const growthPct = prev && prev.gmv > 0 ? Math.round(((catalog.gmv - prev.gmv) / prev.gmv) * 100) : catalog.gmv > 0 ? 100 : 0;
      return { ...catalog, growth_pct: growthPct };
    });

    const topRisers = [...withGrowth].sort((a, b) => b.growth_pct - a.growth_pct).slice(0, 2);

    return NextResponse.json({
      kpis: {
        live_catalogs: liveCatalogs.length,
        draft_catalogs: draftCatalogs.length,
        ended_catalogs: endedCatalogs.length,
        gmv_mtd: gmvMtd,
        gmv_prev_mtd: gmvPrevMtd,
        gmv_growth_pct: gmvGrowthPct,
        avg_conversion_pct: avgConversion,
        orders_attributed_mtd: orders.length,
      },
      todays_read: {
        needs_attention: needsAttention,
        top_performers: topPerformers,
        top_risers: topRisers,
      },
      catalogs: withGrowth,
    });
  } catch (error) {
    console.error('[GET /api/tenant/catalogs] unexpected error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
