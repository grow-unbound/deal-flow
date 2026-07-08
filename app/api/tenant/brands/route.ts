import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTenantBrand } from '@/lib/server/tenant-brand-create';
import { getPostHogClient } from '@/lib/posthog-server';
import { readArrayParam } from '@/lib/landing-filter-params';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';

type TenantBrandLandingRow = {
  id: string;
  tenant_id: string;
  master_brand_id: string | null;
  display_name_override: string | null;
  slug: string | null;
  description: string | null;
  logo_url: string | null;
  margin_pct: number | null;
  exclusivity: boolean | null;
  is_active: boolean;
  external_ref: string | null;
  principal_name: string | null;
  principal_email: string | null;
  principal_phone: string | null;
  principal_location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_cohort_id: string | null;
  created_at: string;
  updated_at: string;
  master_brand: { id: string; name: string; slug: string; logo_url: string | null; description: string | null } | null;
  gmv_mtd: number;
  gmv_prev_mtd: number;
  growth_pct: number;
  portfolio_share_pct: number;
  sku_count: number;
  active_buyers_mtd: number;
  total_buyers: number;
  catalog_days_ago: number | null;
  categories: string[];
  catalog_name: string | null;
  alerts: string[];
};

export async function GET(req: NextRequest) {
  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryFilter = readArrayParam(req.nextUrl.searchParams, 'categories');
    const cohortFilter = readArrayParam(req.nextUrl.searchParams, 'cohorts');
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);

    // ── Parallel fetch: brands list + static snapshot + per-brand KPI daily ──
    const [brandsRes, snapshotRes, currentKpiRes, prevKpiRes, categoriesRes, cohortsRes, buyersRes, cohortMembersRes] = await Promise.all([
      db
        .schema('app')
        .from('tenant_brands')
        .select(`
          id, tenant_id, master_brand_id, display_name_override, slug, description,
          logo_url, margin_pct, exclusivity, is_active, external_ref,
          principal_name, principal_email, principal_phone, principal_location,
          contact_name, contact_email, contact_phone, default_cohort_id,
          created_at, updated_at, deleted_at
        `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit + 1), // +1 to detect whether the UI should request another page
      db
        .schema('app')
        .from('brands_snapshot')
        .select('total_count, active_count, with_products_count, refreshed_at')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      db
        .schema('app')
        .from('kpi_brand_daily')
        .select('tenant_brand_id, gmv, orders_count, buyers_count, units_sold')
        .eq('tenant_id', tenantId)
        .gte('day', period.current_start.split('T')[0])
        .lt('day', period.current_end_exclusive.split('T')[0]),
      db
        .schema('app')
        .from('kpi_brand_daily')
        .select('tenant_brand_id, gmv')
        .eq('tenant_id', tenantId)
        .gte('day', period.previous_start.split('T')[0])
        .lt('day', period.previous_end_exclusive.split('T')[0]),
      db
        .schema('app')
        .from('tenant_categories')
        .select('id, name, is_active, deleted_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      db
        .schema('app')
        .from('cohorts')
        .select('id, name, deleted_at, allowed_tenant_brand_ids')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      db
        .schema('app')
        .from('buyers')
        .select('id, default_cohort_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      db
        .schema('app')
        .from('cohort_members')
        .select('buyer_id, cohort_id'),
    ]);

    if (brandsRes.error || categoriesRes.error || cohortsRes.error || buyersRes.error || cohortMembersRes.error) {
      const err = brandsRes.error ?? categoriesRes.error ?? cohortsRes.error ?? buyersRes.error ?? cohortMembersRes.error;
      console.error('[GET /api/tenant/brands] query error:', err?.code, err?.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const tenantBrands = brandsRes.data ?? [];
    const brandIds = tenantBrands.map((b: { id: string }) => b.id);
    const snapshot = snapshotRes.data ?? null;
    const totalBuyers = (buyersRes.data ?? []).length;
    const activeCategories = (categoriesRes.data ?? []).map((row: { name: string }) => row.name).filter(Boolean);
    const activeCohorts = (cohortsRes.data ?? [])
      .map((row: { id: string; name: string }) => ({ id: row.id, name: row.name }))
      .filter((row: { id: string; name: string }) => Boolean(row.id && row.name));
    const cohortAccessById = new Map(
      (cohortsRes.data ?? []).map((row: { id: string; allowed_tenant_brand_ids: string[] | null }) => [row.id, row.allowed_tenant_brand_ids]),
    );
    const buyerMembershipsByBuyerId = new Map<string, Set<string>>();
    for (const row of (cohortMembersRes.data ?? []) as Array<{ buyer_id: string; cohort_id: string }>) {
      const set = buyerMembershipsByBuyerId.get(row.buyer_id) ?? new Set<string>();
      set.add(row.cohort_id);
      buyerMembershipsByBuyerId.set(row.buyer_id, set);
    }
    const buyerAccessCountByBrand = new Map<string, number>();
    for (const brandId of brandIds) buyerAccessCountByBrand.set(brandId, 0);
    for (const buyer of (buyersRes.data ?? []) as Array<{ id: string; default_cohort_id: string | null }>) {
      const cohortIds = new Set<string>(buyerMembershipsByBuyerId.get(buyer.id) ?? []);
      if (buyer.default_cohort_id) cohortIds.add(buyer.default_cohort_id);
      if (cohortIds.size === 0) continue;
      const allowedSets = Array.from(cohortIds)
        .map((cohortId) => cohortAccessById.get(cohortId))
        .filter((value): value is string[] | null => value !== undefined);
      if (allowedSets.length === 0) continue;
      if (allowedSets.some((value) => value === null)) {
        for (const brandId of brandIds) {
          buyerAccessCountByBrand.set(brandId, (buyerAccessCountByBrand.get(brandId) ?? 0) + 1);
        }
        continue;
      }
      const allowedBrandIds = new Set(allowedSets.flatMap((value) => value ?? []));
      for (const brandId of allowedBrandIds) {
        if (!buyerAccessCountByBrand.has(brandId)) continue;
        buyerAccessCountByBrand.set(brandId, (buyerAccessCountByBrand.get(brandId) ?? 0) + 1);
      }
    }

    // Aggregate kpi_brand_daily rows by brand ID for current and prev periods.
    const currentKpiByBrand = new Map<string, { gmv: number; orders_count: number; buyers_count: number; units_sold: number }>();
    const prevGmvByBrand = new Map<string, number>();

    for (const row of currentKpiRes.data ?? []) {
      const existing = currentKpiByBrand.get(row.tenant_brand_id) ?? { gmv: 0, orders_count: 0, buyers_count: 0, units_sold: 0 };
      currentKpiByBrand.set(row.tenant_brand_id, {
        gmv:          existing.gmv          + Number(row.gmv ?? 0),
        orders_count: existing.orders_count + Number(row.orders_count ?? 0),
        buyers_count: existing.buyers_count + Number(row.buyers_count ?? 0),
        units_sold:   existing.units_sold   + Number(row.units_sold ?? 0),
      });
    }
    for (const row of prevKpiRes.data ?? []) {
      prevGmvByBrand.set(row.tenant_brand_id, (prevGmvByBrand.get(row.tenant_brand_id) ?? 0) + Number(row.gmv ?? 0));
    }

    const portfolioGmvMtd = Array.from(currentKpiByBrand.values()).reduce((s, r) => s + r.gmv, 0);
    const portfolioGmvPrevMtd = Array.from(prevGmvByBrand.values()).reduce((s, v) => s + v, 0);

    // ── Master brands ────────────────────────────────────────────────────────
    const masterBrandIds = tenantBrands
      .map((b: { master_brand_id: string | null }) => b.master_brand_id)
      .filter(Boolean);

    let masterBrands: Record<string, { id: string; name: string; slug: string; logo_url: string | null; description: string | null }> = {};
    if (masterBrandIds.length > 0) {
      const { data: catalogBrands } = await db
        .schema('catalog')
        .from('brands')
        .select('id, name, slug, logo_url, description, deleted_at')
        .in('id', masterBrandIds)
        .is('deleted_at', null);

      masterBrands = Object.fromEntries(
        (catalogBrands ?? []).map((b: { id: string; name: string; slug: string; logo_url: string | null; description: string | null }) => [b.id, b]),
      );
    }

    // ── Per-brand: SKU counts, categories, low stock, catalog freshness ──────
    const tenantProductsRes = await db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, master_product_id, is_active, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('tenant_brand_id', brandIds.length > 0 ? brandIds : ['00000000-0000-0000-0000-000000000000']);

    if (tenantProductsRes.error) {
      console.error('[GET /api/tenant/brands] tenant_products error:', tenantProductsRes.error.code, tenantProductsRes.error.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const tenantProducts = tenantProductsRes.data ?? [];
    const tenantProductIds = tenantProducts.map((p: { id: string }) => p.id);
    const productToBrand = new Map<string, string>();
    for (const row of tenantProducts) {
      if (row.tenant_brand_id) productToBrand.set(row.id, row.tenant_brand_id);
    }

    // Categories per brand
    const categorySetByBrand = new Map<string, Set<string>>();
    if (tenantProducts.length > 0) {
      const masterProductIds = tenantProducts
        .map((p: { master_product_id: string | null }) => p.master_product_id)
        .filter(Boolean);
      if (masterProductIds.length > 0) {
        const { data: categoryRows } = await db
          .schema('catalog')
          .from('products')
          .select('id, category_id, categories(name), deleted_at')
          .in('id', masterProductIds)
          .is('deleted_at', null);

        const masterProductToCategory = new Map<string, string>();
        for (const row of categoryRows ?? []) {
          if (row.categories?.name) masterProductToCategory.set(row.id, row.categories.name);
        }
        for (const p of tenantProducts) {
          const catName = p.master_product_id ? masterProductToCategory.get(p.master_product_id) ?? 'Uncategorized' : 'Uncategorized';
          if (!categorySetByBrand.has(p.tenant_brand_id)) categorySetByBrand.set(p.tenant_brand_id, new Set());
          categorySetByBrand.get(p.tenant_brand_id)?.add(catName);
        }
      }
    }

    // SKU counts per brand
    const skuCountByBrand = new Map<string, number>();
    for (const tp of tenantProducts) {
      skuCountByBrand.set(tp.tenant_brand_id, (skuCountByBrand.get(tp.tenant_brand_id) ?? 0) + 1);
    }

    // Low-stock SKUs per brand
    const lowStockByBrand = new Map<string, number>();
    if (tenantProductIds.length > 0) {
      const { data: lowStockRows, error: lowStockError } = await db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available, reorder_point, deleted_at')
        .in('tenant_product_id', tenantProductIds)
        .is('deleted_at', null)
        .not('reorder_point', 'is', null);

      if (lowStockError) {
        console.error('[GET /api/tenant/brands] inventory error:', lowStockError.code, lowStockError.message);
        return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
      }
      for (const row of lowStockRows ?? []) {
        if (Number(row.qty_available ?? 0) <= Number(row.reorder_point ?? -1)) {
          const brandId = productToBrand.get(row.tenant_product_id);
          if (brandId) lowStockByBrand.set(brandId, (lowStockByBrand.get(brandId) ?? 0) + 1);
        }
      }
    }

    // Catalog freshness per brand
    const latestCatalogByBrand = new Map<string, { updated_at: string; name: string }>();
    const catalogTouchesMtdByBrand = new Map<string, number>();
    const { data: catalogsData, error: catalogsError } = await db
      .schema('app')
      .from('campaigns')
      .select('id, name, status, updated_at, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .is('deleted_at', null);
    if (catalogsError) {
      console.error('[GET /api/tenant/brands] catalogs error:', catalogsError.code, catalogsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }
    const publishedCatalogs = catalogsData ?? [];
    const allCatalogIds = publishedCatalogs.map((c: { id: string }) => c.id);
    const monthCatalogIdSet = new Set(
      publishedCatalogs
        .filter((c: { updated_at: string }) => c.updated_at >= period.current_start && c.updated_at < period.current_end_exclusive)
        .map((c: { id: string }) => c.id),
    );

    if (allCatalogIds.length > 0) {
      const { data: catalogItemsData, error: catalogItemsError } = await db
        .schema('app')
        .from('campaign_items')
        .select('campaign_id, tenant_product_id, deleted_at')
        .in('campaign_id', allCatalogIds)
        .is('deleted_at', null);

      if (catalogItemsError) {
        console.error('[GET /api/tenant/brands] catalog items error:', catalogItemsError.code, catalogItemsError.message);
        return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
      }
      const catalogMetaById = new Map<string, { updated_at: string; name: string }>();
      for (const c of publishedCatalogs) catalogMetaById.set(c.id, { updated_at: c.updated_at, name: c.name });

      for (const row of catalogItemsData ?? []) {
        const brandId = productToBrand.get(row.tenant_product_id);
        if (!brandId) continue;
        const meta = catalogMetaById.get(row.campaign_id);
        if (meta) {
          const cur = latestCatalogByBrand.get(brandId);
          if (!cur || meta.updated_at > cur.updated_at) latestCatalogByBrand.set(brandId, meta);
        }
        if (monthCatalogIdSet.has(row.campaign_id)) {
          catalogTouchesMtdByBrand.set(brandId, (catalogTouchesMtdByBrand.get(brandId) ?? 0) + 1);
        }
      }
    }

    // ── Assemble row objects ─────────────────────────────────────────────────
    const now = new Date();
    const brands: TenantBrandLandingRow[] = tenantBrands.map(
      (row: { id: string; tenant_id: string; master_brand_id: string | null; display_name_override: string | null; slug: string | null; description: string | null; margin_pct: number | null; exclusivity: boolean | null; is_active: boolean; external_ref: string | null; created_at: string; updated_at: string }) => {
        const kpi        = currentKpiByBrand.get(row.id);
        const gmvMtd     = kpi?.gmv ?? 0;
        const gmvPrevMtd = prevGmvByBrand.get(row.id) ?? 0;
        const growthPct  = gmvPrevMtd > 0 ? Math.round(((gmvMtd - gmvPrevMtd) / gmvPrevMtd) * 100) : gmvMtd > 0 ? 100 : 0;
        const portfolioSharePct = portfolioGmvMtd > 0 ? Math.round((gmvMtd / portfolioGmvMtd) * 100) : 0;
        const latestCatalog = latestCatalogByBrand.get(row.id) ?? null;
        const catalogDaysAgo = latestCatalog
          ? Math.max(0, Math.floor((now.getTime() - new Date(latestCatalog.updated_at).getTime()) / (1000 * 60 * 60 * 24)))
          : null;
        const lowStockSkus       = lowStockByBrand.get(row.id) ?? 0;
        const catalogTouchesMtd  = catalogTouchesMtdByBrand.get(row.id) ?? 0;
        const alerts = [
          ...(lowStockSkus > 0 ? ['low_stock'] : []),
          ...(gmvMtd < gmvPrevMtd ? ['gmv_decline'] : []),
          ...(catalogTouchesMtd === 0 ? ['not_in_catalog_mtd'] : []),
        ];

        return {
          ...row,
          master_brand:       row.master_brand_id ? masterBrands[row.master_brand_id] ?? null : null,
          gmv_mtd:            gmvMtd,
          gmv_prev_mtd:       gmvPrevMtd,
          growth_pct:         growthPct,
          portfolio_share_pct: portfolioSharePct,
          sku_count:          skuCountByBrand.get(row.id) ?? 0,
          active_buyers_mtd:  kpi?.buyers_count ?? 0,
          total_buyers:       buyerAccessCountByBrand.get(row.id) ?? totalBuyers,
          catalog_days_ago:   catalogDaysAgo,
          categories:         Array.from(categorySetByBrand.get(row.id) ?? ['Uncategorized']),
          catalog_name:       latestCatalog?.name ?? null,
          alerts,
        };
      },
    );

    const byGmv    = [...brands].sort((a, b) => b.gmv_mtd - a.gmv_mtd);
    const byGrowth = [...brands].sort((a, b) => b.growth_pct - a.growth_pct);
    const categories = Array.from(new Set([...activeCategories, ...brands.flatMap((b) => b.categories)])).sort((a: string, b: string) => a.localeCompare(b));

    const filteredBrands = brands.filter((brand) => {
      const categoryOk = categoryFilter.length === 0 || categoryFilter.some((value) => brand.categories.includes(value));
      const cohortOk = cohortFilter.length === 0 || (brand.default_cohort_id ? cohortFilter.includes(brand.default_cohort_id) : false);
      const searchOk =
        !search ||
        [brand.display_name_override ?? brand.master_brand?.name ?? '', ...brand.categories, brand.catalog_name ?? '']
          .some((value) => value.toLowerCase().includes(search));
      return categoryOk && cohortOk && searchOk;
    });

    const pageBrands = filteredBrands.slice(0, limit);
    const needsAttentionCount     = brands.filter((b) => b.alerts.length > 0).length;
    const catalogFreshnessCount   = brands.filter((b) => (catalogTouchesMtdByBrand.get(b.id) ?? 0) > 0).length;
    const monthCatalogDates       = publishedCatalogs
      .filter((c: { id: string }) => monthCatalogIdSet.has(c.id))
      .map((c: { updated_at: string }) => c.updated_at)
      .sort();
    const catalogFreshnessEarliestDays = monthCatalogDates[0]
      ? Math.max(0, Math.floor((now.getTime() - new Date(monthCatalogDates[0]).getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return NextResponse.json({
      period,
      kpis: {
        portfolio_gmv_mtd:             portfolioGmvMtd,
        portfolio_gmv_prev_mtd:        portfolioGmvPrevMtd,
        brands_carried:                snapshot?.active_count ?? tenantBrands.length,
        buyers_with_orders_mtd:        new Set(
          (currentKpiRes.data ?? []).map((r: { tenant_brand_id: string }) => r.tenant_brand_id),
        ).size, // distinct brands with any buyers this period (proxy; exact unique buyers across all brands is live-computed below if needed)
        total_buyers:                  totalBuyers,
        need_attention_count:          needsAttentionCount,
        catalog_freshness_count:       catalogFreshnessCount,
        total_campaigns:      publishedCatalogs.length,
        catalog_freshness_earliest_days: catalogFreshnessEarliestDays,
      },
      todays_read: {
        needs_attention: brands
          .filter((b) => b.alerts.length > 0)
          .map((b) => ({ id: b.id, name: b.display_name_override ?? 'Unknown brand', growth_pct: b.growth_pct, alerts: b.alerts })),
        top_performers: byGmv.slice(0, 3).map((b) => ({ id: b.id, name: b.display_name_override ?? 'Unknown brand', gmv_mtd: b.gmv_mtd })),
        top_risers: byGrowth.slice(0, 3).map((b) => ({ id: b.id, name: b.display_name_override ?? 'Unknown brand', growth_pct: b.growth_pct, gmv_mtd: b.gmv_mtd, gmv_prev_mtd: b.gmv_prev_mtd })),
      },
      cohorts: activeCohorts,
      categories,
      brands: pageBrands,
      total: filteredBrands.length,
      nextCursor: null,
    }, { headers: { 'Cache-Control': SELLER_GET_CACHE_CONTROL } });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
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

    const db = supabaseAdmin as any;
    const body = await req.json();
    const created = await createTenantBrand(db, claims, body);

    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: claims.sub ?? claims.tenant_id,
        event: 'brand_created',
        properties: {
          tenant_id: claims.tenant_id,
          brand_id: (created as { id?: string })?.id,
        },
      });
      await ph.flush();
    } catch {
      // non-blocking
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && 'error' in err) {
      const typedErr = err as { status: number; error: string; details?: unknown };
      return NextResponse.json(
        typedErr.details ? { error: typedErr.error, details: typedErr.details } : { error: typedErr.error },
        { status: typedErr.status },
      );
    }
    console.error('[POST /api/tenant/brands] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
