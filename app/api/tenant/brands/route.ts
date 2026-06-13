import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTenantBrand } from '@/lib/server/tenant-brand-create';
import { getPostHogClient } from '@/lib/posthog-server';

type BrandAggregate = {
  brandId: string;
  gmvMtd: number;
  gmvPrevMtd: number;
  activeBuyersMtd: number;
  lowStockSkus: number;
  catalogTouchesMtd: number;
  latestCatalogUpdatedAt: string | null;
  latestCatalogName: string | null;
  categories: string[];
  skuCount: number;
};

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

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;

    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));

    const { data: tenantBrandsData, error: tenantBrandsError } = await db
      .schema('app')
      .from('tenant_brands')
      .select(
        `
        id,
        tenant_id,
        master_brand_id,
        display_name_override,
        slug,
        description,
        logo_url,
        margin_pct,
        exclusivity,
        is_active,
        external_ref,
        principal_name,
        principal_email,
        principal_phone,
        principal_location,
        contact_name,
        contact_email,
        contact_phone,
        default_cohort_id,
        created_at,
        updated_at,
        deleted_at
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (tenantBrandsError) {
      console.error('[GET /api/tenant/brands] tenant_brands error:', tenantBrandsError.code, tenantBrandsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const tenantBrands = tenantBrandsData ?? [];
    const brandIds = tenantBrands.map((b: { id: string }) => b.id);
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

    const { data: tenantProductsData, error: tenantProductsError } = await db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, master_product_id, is_active, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('tenant_brand_id', brandIds.length > 0 ? brandIds : ['00000000-0000-0000-0000-000000000000']);

    if (tenantProductsError) {
      console.error('[GET /api/tenant/brands] tenant_products error:', tenantProductsError.code, tenantProductsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const tenantProducts = tenantProductsData ?? [];
    const tenantProductIds = tenantProducts.map((p: { id: string }) => p.id);
    const tenantProductIdSet = new Set(tenantProductIds);
    const productToBrand = new Map<string, string>();
    for (const row of tenantProducts) {
      if (row.tenant_brand_id) productToBrand.set(row.id, row.tenant_brand_id);
    }

    let productCategoryRows: Array<{ brand_id: string; category_name: string }> = [];
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
          const categoryName = row.categories?.name;
          if (categoryName) masterProductToCategory.set(row.id, categoryName);
        }

        productCategoryRows = tenantProducts
          .map((p: { tenant_brand_id: string; master_product_id: string | null }) => ({
            brand_id: p.tenant_brand_id,
            category_name: p.master_product_id ? masterProductToCategory.get(p.master_product_id) ?? 'Uncategorized' : 'Uncategorized',
          }))
          .filter((r: { brand_id: string | null; category_name: string | null }) => Boolean(r.brand_id && r.category_name)) as Array<{
          brand_id: string;
          category_name: string;
        }>;
      }
    }

    const { count: totalBuyersCount, error: totalBuyersError } = await db
      .schema('app')
      .from('buyers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);
    if (totalBuyersError) {
      console.error('[GET /api/tenant/brands] buyers error:', totalBuyersError.code, totalBuyersError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const { data: monthOrders, error: monthOrdersError } = await db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, placed_at, created_at, status, deleted_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('placed_at', period.current_start)
      .lt('placed_at', period.current_end_exclusive);

    if (monthOrdersError) {
      console.error('[GET /api/tenant/brands] month orders error:', monthOrdersError.code, monthOrdersError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const { data: prevMonthOrders, error: prevMonthOrdersError } = await db
      .schema('app')
      .from('orders')
      .select('id, buyer_id, total_amount, placed_at, created_at, status, deleted_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .gte('placed_at', period.previous_start)
      .lt('placed_at', period.previous_end_exclusive);

    if (prevMonthOrdersError) {
      console.error('[GET /api/tenant/brands] prev orders error:', prevMonthOrdersError.code, prevMonthOrdersError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const monthOrderIds = (monthOrders ?? []).map((o: { id: string }) => o.id);
    const prevOrderIds = (prevMonthOrders ?? []).map((o: { id: string }) => o.id);

    const [monthOrderItemsRes, prevOrderItemsRes] = await Promise.all([
      monthOrderIds.length
        ? db
            .schema('app')
            .from('order_items')
            .select('order_id, tenant_product_id, deleted_at')
            .in('order_id', monthOrderIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as any[], error: null }),
      prevOrderIds.length
        ? db
            .schema('app')
            .from('order_items')
            .select('order_id, tenant_product_id, deleted_at')
            .in('order_id', prevOrderIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (monthOrderItemsRes.error || prevOrderItemsRes.error) {
      console.error('[GET /api/tenant/brands] order_items error:', monthOrderItemsRes.error || prevOrderItemsRes.error);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const monthOrderItems = monthOrderItemsRes.data ?? [];
    const prevOrderItems = prevOrderItemsRes.data ?? [];

    const monthOrderTotals = new Map<string, number>();
    for (const order of monthOrders ?? []) {
      monthOrderTotals.set(order.id, Number(order.total_amount ?? 0));
    }
    const prevOrderTotals = new Map<string, number>();
    for (const order of prevMonthOrders ?? []) {
      prevOrderTotals.set(order.id, Number(order.total_amount ?? 0));
    }

    const monthOrderBuyers = new Map<string, string>();
    for (const order of monthOrders ?? []) {
      monthOrderBuyers.set(order.id, order.buyer_id);
    }

    const brandAggMap = new Map<string, BrandAggregate>();
    for (const b of tenantBrands) {
      brandAggMap.set(b.id, {
        brandId: b.id,
        gmvMtd: 0,
        gmvPrevMtd: 0,
        activeBuyersMtd: 0,
        lowStockSkus: 0,
        catalogTouchesMtd: 0,
        latestCatalogUpdatedAt: null,
        latestCatalogName: null,
        categories: [],
        skuCount: 0,
      });
    }

    const categorySetByBrand = new Map<string, Set<string>>();
    for (const row of productCategoryRows) {
      if (!categorySetByBrand.has(row.brand_id)) categorySetByBrand.set(row.brand_id, new Set());
      categorySetByBrand.get(row.brand_id)?.add(row.category_name);
    }

    for (const tp of tenantProducts) {
      const agg = brandAggMap.get(tp.tenant_brand_id);
      if (agg) agg.skuCount += 1;
    }

    const monthOrderCountedForBrand = new Set<string>();
    const buyersByBrand = new Map<string, Set<string>>();
    for (const item of monthOrderItems) {
      if (!tenantProductIdSet.has(item.tenant_product_id)) continue;
      const brandId = productToBrand.get(item.tenant_product_id);
      if (!brandId) continue;
      const dedupeKey = `${brandId}:${item.order_id}`;
      if (!monthOrderCountedForBrand.has(dedupeKey)) {
        monthOrderCountedForBrand.add(dedupeKey);
        const agg = brandAggMap.get(brandId);
        if (agg) agg.gmvMtd += Number(monthOrderTotals.get(item.order_id) ?? 0);
      }
      const buyerId = monthOrderBuyers.get(item.order_id);
      if (buyerId) {
        if (!buyersByBrand.has(brandId)) buyersByBrand.set(brandId, new Set());
        buyersByBrand.get(brandId)?.add(buyerId);
      }
    }

    const prevOrderCountedForBrand = new Set<string>();
    for (const item of prevOrderItems) {
      if (!tenantProductIdSet.has(item.tenant_product_id)) continue;
      const brandId = productToBrand.get(item.tenant_product_id);
      if (!brandId) continue;
      const dedupeKey = `${brandId}:${item.order_id}`;
      if (!prevOrderCountedForBrand.has(dedupeKey)) {
        prevOrderCountedForBrand.add(dedupeKey);
        const agg = brandAggMap.get(brandId);
        if (agg) agg.gmvPrevMtd += Number(prevOrderTotals.get(item.order_id) ?? 0);
      }
    }

    for (const [brandId, buyers] of buyersByBrand.entries()) {
      const agg = brandAggMap.get(brandId);
      if (agg) agg.activeBuyersMtd = buyers.size;
    }

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
          if (!brandId) continue;
          const agg = brandAggMap.get(brandId);
          if (agg) agg.lowStockSkus += 1;
        }
      }
    }

    let publishedCatalogs: any[] = [];
    const { data: catalogsData, error: catalogsError } = await db
      .schema('app')
      .from('published_catalogs')
      .select('id, name, status, updated_at, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .is('deleted_at', null);
    if (catalogsError) {
      console.error('[GET /api/tenant/brands] catalogs error:', catalogsError.code, catalogsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }
    publishedCatalogs = catalogsData ?? [];

    const monthCatalogs = publishedCatalogs.filter(
      (c: { updated_at: string }) => c.updated_at >= period.current_start && c.updated_at < period.current_end_exclusive,
    );
    const allCatalogIds = publishedCatalogs.map((c: { id: string }) => c.id);

    if (allCatalogIds.length > 0) {
      const { data: catalogItemsData, error: catalogItemsError } = await db
        .schema('app')
        .from('published_catalog_items')
        .select('catalog_id, tenant_product_id, deleted_at')
        .in('catalog_id', allCatalogIds)
        .is('deleted_at', null);

      if (catalogItemsError) {
        console.error('[GET /api/tenant/brands] catalog items error:', catalogItemsError.code, catalogItemsError.message);
        return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
      }

      const catalogMetaById = new Map<string, { updated_at: string; name: string }>();
      for (const c of publishedCatalogs) catalogMetaById.set(c.id, { updated_at: c.updated_at, name: c.name });
      const monthCatalogIdSet = new Set(monthCatalogs.map((c: { id: string }) => c.id));

      for (const row of catalogItemsData ?? []) {
        const brandId = productToBrand.get(row.tenant_product_id);
        if (!brandId) continue;
        const agg = brandAggMap.get(brandId);
        if (!agg) continue;

        const catalogMeta = catalogMetaById.get(row.catalog_id) ?? null;
        const catalogUpdated = catalogMeta?.updated_at ?? null;
        if (catalogUpdated && (!agg.latestCatalogUpdatedAt || catalogUpdated > agg.latestCatalogUpdatedAt)) {
          agg.latestCatalogUpdatedAt = catalogUpdated;
          agg.latestCatalogName = catalogMeta?.name ?? null;
        }

        if (monthCatalogIdSet.has(row.catalog_id)) {
          agg.catalogTouchesMtd += 1;
        }
      }
    }

    const now = new Date();
    for (const [brandId, agg] of brandAggMap.entries()) {
      const categories = Array.from(categorySetByBrand.get(brandId) ?? []);
      agg.categories = categories.length > 0 ? categories : ['Uncategorized'];
    }

    const totalBuyers = totalBuyersError ? 0 : totalBuyersCount ?? 0;
    const uniqueBuyersMtd = new Set((monthOrders ?? []).map((o: { buyer_id: string }) => o.buyer_id)).size;

    const aggregates = Array.from(brandAggMap.values());
    const portfolioGmvMtd = (monthOrders ?? []).reduce((sum: number, order: { total_amount: number | null }) => sum + Number(order.total_amount ?? 0), 0);
    const portfolioGmvPrevMtd = (prevMonthOrders ?? []).reduce((sum: number, order: { total_amount: number | null }) => sum + Number(order.total_amount ?? 0), 0);
    const brandsCarried = aggregates.filter((a) => a.gmvMtd > 0).length;

    const needsAttentionBrandIds = new Set<string>();
    for (const a of aggregates) {
      if (a.lowStockSkus > 0 || a.gmvMtd < a.gmvPrevMtd || a.catalogTouchesMtd === 0) {
        needsAttentionBrandIds.add(a.brandId);
      }
    }

    const catalogFreshnessCount = aggregates.filter((a) => a.catalogTouchesMtd > 0).length;
    const earliestMonthCatalogUpdate = monthCatalogs
      .map((c: { updated_at: string }) => c.updated_at)
      .sort()[0] ?? null;
    const catalogFreshnessEarliestDays = earliestMonthCatalogUpdate
      ? Math.max(
          0,
          Math.floor((now.getTime() - new Date(earliestMonthCatalogUpdate).getTime()) / (1000 * 60 * 60 * 24)),
        )
      : null;

    const brands: TenantBrandLandingRow[] = tenantBrands.map(
      (row: {
        id: string;
        tenant_id: string;
        master_brand_id: string | null;
        display_name_override: string | null;
        slug: string | null;
        description: string | null;
        margin_pct: number | null;
        exclusivity: boolean | null;
        is_active: boolean;
        external_ref: string | null;
        created_at: string;
        updated_at: string;
      }) => {
        const agg = brandAggMap.get(row.id);
        const gmvMtd = agg?.gmvMtd ?? 0;
        const gmvPrevMtd = agg?.gmvPrevMtd ?? 0;
        const growthPct = gmvPrevMtd > 0 ? Math.round(((gmvMtd - gmvPrevMtd) / gmvPrevMtd) * 100) : gmvMtd > 0 ? 100 : 0;
        const portfolioSharePct = portfolioGmvMtd > 0 ? Math.round((gmvMtd / portfolioGmvMtd) * 100) : 0;
        const catalogDaysAgo = agg?.latestCatalogUpdatedAt
          ? Math.max(0, Math.floor((now.getTime() - new Date(agg.latestCatalogUpdatedAt).getTime()) / (1000 * 60 * 60 * 24)))
          : null;
        const alerts = [
          ...(agg && agg.lowStockSkus > 0 ? ['low_stock'] : []),
          ...(agg && agg.gmvMtd < agg.gmvPrevMtd ? ['gmv_decline'] : []),
          ...(agg && agg.catalogTouchesMtd === 0 ? ['not_in_catalog_mtd'] : []),
        ];

        return {
          ...row,
          master_brand: row.master_brand_id ? masterBrands[row.master_brand_id] ?? null : null,
          gmv_mtd: gmvMtd,
          gmv_prev_mtd: gmvPrevMtd,
          growth_pct: growthPct,
          portfolio_share_pct: portfolioSharePct,
          sku_count: agg?.skuCount ?? 0,
          active_buyers_mtd: agg?.activeBuyersMtd ?? 0,
          total_buyers: totalBuyers,
          catalog_days_ago: catalogDaysAgo,
          categories: agg?.categories ?? ['Uncategorized'],
          catalog_name: agg?.latestCatalogName ?? null,
          alerts,
        };
      },
    );

    const byGmv = [...brands].sort((a, b) => b.gmv_mtd - a.gmv_mtd);
    const byGrowth = [...brands].sort((a, b) => b.growth_pct - a.growth_pct);

    const categories = Array.from(new Set(brands.flatMap((b) => b.categories))).sort((a: string, b: string) => a.localeCompare(b));

    return NextResponse.json({
      period,
      kpis: {
        portfolio_gmv_mtd: portfolioGmvMtd,
        portfolio_gmv_prev_mtd: portfolioGmvPrevMtd,
        brands_carried: brandsCarried,
        buyers_with_orders_mtd: uniqueBuyersMtd,
        total_buyers: totalBuyers,
        need_attention_count: needsAttentionBrandIds.size,
        catalog_freshness_count: catalogFreshnessCount,
        total_published_catalogs: publishedCatalogs.length,
        catalog_freshness_earliest_days: catalogFreshnessEarliestDays,
      },
      todays_read: {
        needs_attention: brands
          .filter((b) => b.alerts.length > 0)
          .map((b) => ({ id: b.id, name: b.display_name_override ?? 'Unknown brand', growth_pct: b.growth_pct, alerts: b.alerts })),
        top_performers: byGmv.slice(0, 3).map((b) => ({ id: b.id, name: b.display_name_override ?? 'Unknown brand', gmv_mtd: b.gmv_mtd })),
        top_risers: byGrowth.slice(0, 3).map((b) => ({ id: b.id, name: b.display_name_override ?? 'Unknown brand', growth_pct: b.growth_pct, gmv_mtd: b.gmv_mtd, gmv_prev_mtd: b.gmv_prev_mtd })),
      },
      categories,
      brands,
    });
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
