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

type TenantBrandDbRow = Omit<
  TenantBrandLandingRow,
  | 'master_brand'
  | 'gmv_mtd'
  | 'gmv_prev_mtd'
  | 'growth_pct'
  | 'portfolio_share_pct'
  | 'sku_count'
  | 'active_buyers_mtd'
  | 'total_buyers'
  | 'catalog_days_ago'
  | 'categories'
  | 'catalog_name'
  | 'alerts'
>;

type BrandOrderRow = {
  id: string;
  buyer_id: string | null;
  status: string | null;
};

type BrandOrderItemRow = {
  order_id: string;
  tenant_product_id: string;
  qty?: number | null;
  line_total?: number | null;
  unit_price?: number | null;
};

type BrandKpiRow = {
  tenant_brand_id: string | null;
  gmv?: number | null;
  buyers_count?: number | null;
};

type BrandInventoryRow = {
  tenant_product_id: string;
  qty_available?: number | null;
  reorder_point?: number | null;
  location_id?: string | null;
};

const NO_ACCESS_ID = '00000000-0000-0000-0000-000000000000';

function metricNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function isOperationalOrderStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? '').toLowerCase();
  return !['void', 'cancelled', 'rejected', 'archived'].includes(normalized);
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

    const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;
    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryFilter = readArrayParam(req.nextUrl.searchParams, 'categories');
    const cohortFilter = readArrayParam(req.nextUrl.searchParams, 'cohorts');
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);

    const [
      brandsRes,
      snapshotRes,
      categoriesRes,
      cohortsRes,
      buyersRes,
      cohortMembersRes,
      tenantProductsRes,
      inventoryRes,
      currentOrdersRes,
      previousOrdersRes,
      currentBrandKpiRes,
      previousBrandKpiRes,
      catalogsRes,
    ] = await Promise.all([
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
        .order('created_at', { ascending: false }),
      db
        .schema('app')
        .from('brands_snapshot')
        .select('total_count, active_count, with_products_count, refreshed_at')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
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
      db
        .schema('app')
        .from('tenant_products')
        .select('id, tenant_brand_id, master_product_id, is_active, deleted_at')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null),
      isAssistant
        ? (
            assistantLocationIds.length > 0
              ? db
                  .schema('app')
                  .from('tenant_inventory')
                  .select('tenant_product_id, qty_available, reorder_point, location_id')
                  .in('location_id', assistantLocationIds)
                  .is('deleted_at', null)
              : Promise.resolve({ data: [] as BrandInventoryRow[], error: null })
          )
        : db
            .schema('app')
            .from('tenant_inventory')
            .select('tenant_product_id, qty_available, reorder_point, location_id')
            .is('deleted_at', null),
      isAssistant
        ? (
            assistantLocationIds.length > 0
              ? db
                  .schema('app')
                  .from('orders')
                  .select('id, buyer_id, status')
                  .eq('tenant_id', tenantId)
                  .in('location_id', assistantLocationIds)
                  .gte('order_date', period.current_start)
                  .lt('order_date', period.current_end_exclusive)
                  .is('deleted_at', null)
              : Promise.resolve({ data: [] as BrandOrderRow[], error: null })
          )
        : db
            .schema('app')
            .from('orders')
            .select('id, buyer_id, status')
            .eq('tenant_id', tenantId)
            .gte('order_date', period.current_start)
            .lt('order_date', period.current_end_exclusive)
            .is('deleted_at', null),
      isAssistant
        ? (
            assistantLocationIds.length > 0
              ? db
                  .schema('app')
                  .from('orders')
                  .select('id, buyer_id, status')
                  .eq('tenant_id', tenantId)
                  .in('location_id', assistantLocationIds)
                  .gte('order_date', period.previous_start)
                  .lt('order_date', period.previous_end_exclusive)
                  .is('deleted_at', null)
              : Promise.resolve({ data: [] as BrandOrderRow[], error: null })
          )
        : db
            .schema('app')
            .from('orders')
            .select('id, buyer_id, status')
            .eq('tenant_id', tenantId)
            .gte('order_date', period.previous_start)
            .lt('order_date', period.previous_end_exclusive)
            .is('deleted_at', null),
      db
        .schema('app')
        .from('kpi_brand_daily')
        .select('tenant_brand_id, gmv, buyers_count')
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
        .from('campaigns')
        .select('id, name, status, updated_at, deleted_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .is('deleted_at', null),
    ]);

    if (
      brandsRes.error || categoriesRes.error || cohortsRes.error || buyersRes.error ||
      cohortMembersRes.error || tenantProductsRes.error || inventoryRes.error ||
      currentOrdersRes.error || previousOrdersRes.error || currentBrandKpiRes.error || previousBrandKpiRes.error || catalogsRes.error
    ) {
      const err =
        brandsRes.error ?? categoriesRes.error ?? cohortsRes.error ?? buyersRes.error ??
        cohortMembersRes.error ?? tenantProductsRes.error ?? inventoryRes.error ??
        currentOrdersRes.error ?? previousOrdersRes.error ?? currentBrandKpiRes.error ?? previousBrandKpiRes.error ?? catalogsRes.error;
      console.error('[GET /api/tenant/brands] query error:', err?.code, err?.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const snapshot = snapshotRes.data ?? null;
    const tenantBrands = (brandsRes.data ?? []) as TenantBrandDbRow[];
    const allTenantProducts = (tenantProductsRes.data ?? []) as Array<{ id: string; tenant_brand_id: string | null; master_product_id: string | null }>;
    const inventoryRows = (inventoryRes.data ?? []) as BrandInventoryRow[];
    const productToBrand = new Map<string, string>();
    for (const product of allTenantProducts) {
      if (product.tenant_brand_id) productToBrand.set(product.id, product.tenant_brand_id);
    }

    const currentOrderIds = ((currentOrdersRes.data ?? []) as BrandOrderRow[])
      .filter((row) => isOperationalOrderStatus(row.status))
      .map((row) => row.id);
    const previousOrderIds = ((previousOrdersRes.data ?? []) as BrandOrderRow[])
      .filter((row) => isOperationalOrderStatus(row.status))
      .map((row) => row.id);

    const [currentOrderItemsRes, previousOrderItemsRes] = isAssistant
      ? await Promise.all([
          currentOrderIds.length > 0
            ? db
                .schema('app')
                .from('order_items')
                .select('order_id, tenant_product_id, qty, line_total, unit_price')
                .in('order_id', currentOrderIds)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] as BrandOrderItemRow[], error: null }),
          previousOrderIds.length > 0
            ? db
                .schema('app')
                .from('order_items')
                .select('order_id, tenant_product_id, qty, line_total, unit_price')
                .in('order_id', previousOrderIds)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] as BrandOrderItemRow[], error: null }),
        ])
      : [
          { data: [] as BrandOrderItemRow[], error: null },
          { data: [] as BrandOrderItemRow[], error: null },
        ];

    if (currentOrderItemsRes.error || previousOrderItemsRes.error) {
      console.error('[GET /api/tenant/brands] order item query error:', currentOrderItemsRes.error ?? previousOrderItemsRes.error);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const visibleProductIds = new Set<string>();
    for (const row of inventoryRows) {
      if (row.tenant_product_id) visibleProductIds.add(row.tenant_product_id);
    }
    for (const row of (currentOrderItemsRes.data ?? []) as BrandOrderItemRow[]) {
      if (row.tenant_product_id) visibleProductIds.add(row.tenant_product_id);
    }
    for (const row of (previousOrderItemsRes.data ?? []) as BrandOrderItemRow[]) {
      if (row.tenant_product_id) visibleProductIds.add(row.tenant_product_id);
    }

    const tenantProducts = isAssistant
      ? allTenantProducts.filter((product) => visibleProductIds.has(product.id))
      : allTenantProducts;
    const visibleBrandIds = new Set(
      tenantProducts
        .map((product) => product.tenant_brand_id)
        .filter((value): value is string => Boolean(value)),
    );
    const scopedBrands = isAssistant
      ? tenantBrands.filter((brand) => visibleBrandIds.has(String(brand.id)))
      : tenantBrands;
    const brandIds = scopedBrands.map((brand) => String(brand.id));

    const masterBrandIds = scopedBrands
      .map((brand) => brand.master_brand_id as string | null)
      .filter((value): value is string => Boolean(value));
    const { data: catalogBrands } = masterBrandIds.length > 0
      ? await db
          .schema('catalog')
          .from('brands')
          .select('id, name, slug, logo_url, description, deleted_at')
          .in('id', masterBrandIds)
          .is('deleted_at', null)
      : { data: [] };
    const masterBrands = Object.fromEntries(
      ((catalogBrands ?? []) as Array<{ id: string; name: string; slug: string; logo_url: string | null; description: string | null }>)
        .map((brand) => [brand.id, brand]),
    );

    const scopedProductIds = new Set(tenantProducts.map((product) => product.id));
    const categorySetByBrand = new Map<string, Set<string>>();
    const masterProductIds = tenantProducts
      .map((product) => product.master_product_id)
      .filter((value): value is string => Boolean(value));
    const { data: categoryRows } = masterProductIds.length > 0
      ? await db
          .schema('catalog')
          .from('products')
          .select('id, category_id, categories(name), deleted_at')
          .in('id', masterProductIds)
          .is('deleted_at', null)
      : { data: [] };
    const masterProductToCategory = new Map<string, string>();
    for (const row of (categoryRows ?? []) as Array<{ id: string; categories: { name: string } | null }>) {
      if (row.categories?.name) masterProductToCategory.set(row.id, row.categories.name);
    }
    for (const product of tenantProducts) {
      const brandId = product.tenant_brand_id;
      if (!brandId) continue;
      const categoryName = product.master_product_id ? masterProductToCategory.get(product.master_product_id) ?? 'Uncategorized' : 'Uncategorized';
      const set = categorySetByBrand.get(brandId) ?? new Set<string>();
      set.add(categoryName);
      categorySetByBrand.set(brandId, set);
    }

    const skuCountByBrand = new Map<string, number>();
    for (const product of tenantProducts) {
      if (!product.tenant_brand_id) continue;
      skuCountByBrand.set(product.tenant_brand_id, (skuCountByBrand.get(product.tenant_brand_id) ?? 0) + 1);
    }

    const lowStockByBrand = new Map<string, number>();
    for (const row of inventoryRows) {
      if (row.reorder_point == null) continue;
      const brandId = productToBrand.get(row.tenant_product_id);
      if (!brandId || !visibleBrandIds.has(brandId)) continue;
      if (metricNumber(row.qty_available) <= metricNumber(row.reorder_point)) {
        lowStockByBrand.set(brandId, (lowStockByBrand.get(brandId) ?? 0) + 1);
      }
    }

    const currentKpiByBrand = new Map<string, { gmv: number; buyers: Set<string>; orders: Set<string> }>();
    const prevGmvByBrand = new Map<string, number>();

    if (isAssistant) {
      const currentOrderBuyerById = new Map(
        ((currentOrdersRes.data ?? []) as BrandOrderRow[])
          .filter((row) => isOperationalOrderStatus(row.status))
          .map((row) => [row.id, row.buyer_id]),
      );
      const prevOrderIdsSet = new Set(previousOrderIds);

      for (const row of (currentOrderItemsRes.data ?? []) as BrandOrderItemRow[]) {
        const brandId = productToBrand.get(row.tenant_product_id);
        if (!brandId || !visibleBrandIds.has(brandId)) continue;
        const existing = currentKpiByBrand.get(brandId) ?? { gmv: 0, buyers: new Set<string>(), orders: new Set<string>() };
        existing.gmv += row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
        existing.orders.add(row.order_id);
        const buyerId = currentOrderBuyerById.get(row.order_id);
        if (typeof buyerId === 'string' && buyerId.length > 0) existing.buyers.add(buyerId);
        currentKpiByBrand.set(brandId, existing);
      }

      for (const row of (previousOrderItemsRes.data ?? []) as BrandOrderItemRow[]) {
        if (!prevOrderIdsSet.has(row.order_id)) continue;
        const brandId = productToBrand.get(row.tenant_product_id);
        if (!brandId || !visibleBrandIds.has(brandId)) continue;
        const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
        prevGmvByBrand.set(brandId, (prevGmvByBrand.get(brandId) ?? 0) + revenue);
      }
    } else {
      for (const row of (currentBrandKpiRes.data ?? []) as BrandKpiRow[]) {
        const brandId = row.tenant_brand_id;
        if (!brandId || !visibleBrandIds.has(brandId)) continue;
        const existing = currentKpiByBrand.get(brandId) ?? { gmv: 0, buyers: new Set<string>(), orders: new Set<string>() };
        existing.gmv += metricNumber(row.gmv);
        const buyerCount = Math.max(0, Math.round(metricNumber(row.buyers_count)));
        for (let index = 0; index < buyerCount; index += 1) {
          existing.buyers.add(`${brandId}:${existing.buyers.size + 1}`);
        }
        currentKpiByBrand.set(brandId, existing);
      }

      for (const row of (previousBrandKpiRes.data ?? []) as BrandKpiRow[]) {
        const brandId = row.tenant_brand_id;
        if (!brandId || !visibleBrandIds.has(brandId)) continue;
        prevGmvByBrand.set(brandId, (prevGmvByBrand.get(brandId) ?? 0) + metricNumber(row.gmv));
      }
    }

    const scopedBuyerIds = isAssistant
      ? new Set(
          ((currentOrdersRes.data ?? []) as BrandOrderRow[])
            .concat((previousOrdersRes.data ?? []) as BrandOrderRow[])
            .map((row) => row.buyer_id)
            .filter((value): value is string => Boolean(value)),
        )
      : null;
    const totalBuyers = isAssistant
      ? scopedBuyerIds?.size ?? 0
      : (buyersRes.data ?? []).length;

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
      if (isAssistant && !(scopedBuyerIds?.has(buyer.id) ?? false)) continue;
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

    const publishedCatalogs = (catalogsRes.data ?? []) as Array<{ id: string; name: string; updated_at: string }>;
    const allCatalogIds = publishedCatalogs.map((catalog) => catalog.id);
    const monthCatalogIdSet = new Set(
      publishedCatalogs
        .filter((catalog) => catalog.updated_at >= period.current_start && catalog.updated_at < period.current_end_exclusive)
        .map((catalog) => catalog.id),
    );
    const { data: catalogItemsData, error: catalogItemsError } = allCatalogIds.length > 0
      ? await db
          .schema('app')
          .from('campaign_items')
          .select('campaign_id, tenant_product_id, deleted_at')
          .in('campaign_id', allCatalogIds)
          .is('deleted_at', null)
      : { data: [], error: null };

    if (catalogItemsError) {
      console.error('[GET /api/tenant/brands] catalog items error:', catalogItemsError.code, catalogItemsError.message);
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    const latestCatalogByBrand = new Map<string, { updated_at: string; name: string }>();
    const catalogTouchesMtdByBrand = new Map<string, number>();
    const catalogMetaById = new Map(publishedCatalogs.map((catalog) => [catalog.id, { updated_at: catalog.updated_at, name: catalog.name }]));
    for (const row of (catalogItemsData ?? []) as Array<{ campaign_id: string; tenant_product_id: string }>) {
      if (!scopedProductIds.has(row.tenant_product_id)) continue;
      const brandId = productToBrand.get(row.tenant_product_id);
      if (!brandId || !visibleBrandIds.has(brandId)) continue;
      const meta = catalogMetaById.get(row.campaign_id);
      if (meta) {
        const current = latestCatalogByBrand.get(brandId);
        if (!current || meta.updated_at > current.updated_at) latestCatalogByBrand.set(brandId, meta);
      }
      if (monthCatalogIdSet.has(row.campaign_id)) {
        catalogTouchesMtdByBrand.set(brandId, (catalogTouchesMtdByBrand.get(brandId) ?? 0) + 1);
      }
    }

    const portfolioGmvMtd = Array.from(currentKpiByBrand.values()).reduce((sum, entry) => sum + entry.gmv, 0);
    const portfolioGmvPrevMtd = Array.from(prevGmvByBrand.values()).reduce((sum, value) => sum + value, 0);
    const currentBuyerSet = new Set(
      ((currentOrdersRes.data ?? []) as BrandOrderRow[])
        .filter((row) => isOperationalOrderStatus(row.status) && typeof row.buyer_id === 'string' && row.buyer_id.length > 0)
        .map((row) => row.buyer_id as string),
    );
    const now = new Date();
    const brands: TenantBrandLandingRow[] = scopedBrands.map((row) => {
      const current = currentKpiByBrand.get(String(row.id));
      const gmvMtd = current?.gmv ?? 0;
      const gmvPrevMtd = prevGmvByBrand.get(String(row.id)) ?? 0;
      const growthPct = gmvPrevMtd > 0 ? Math.round(((gmvMtd - gmvPrevMtd) / gmvPrevMtd) * 100) : gmvMtd > 0 ? 100 : 0;
      const latestCatalog = latestCatalogByBrand.get(String(row.id)) ?? null;
      const catalogDaysAgo = latestCatalog
        ? Math.max(0, Math.floor((now.getTime() - new Date(latestCatalog.updated_at).getTime()) / (1000 * 60 * 60 * 24)))
        : null;
      const lowStockSkus = lowStockByBrand.get(String(row.id)) ?? 0;
      const catalogTouches = catalogTouchesMtdByBrand.get(String(row.id)) ?? 0;
      const alerts = [
        ...(lowStockSkus > 0 ? ['low_stock'] : []),
        ...(gmvMtd < gmvPrevMtd ? ['gmv_decline'] : []),
        ...(catalogTouches === 0 ? ['not_in_catalog_mtd'] : []),
      ];

      return {
        ...row,
        master_brand: row.master_brand_id ? masterBrands[row.master_brand_id] ?? null : null,
        gmv_mtd: gmvMtd,
        gmv_prev_mtd: gmvPrevMtd,
        growth_pct: growthPct,
        portfolio_share_pct: portfolioGmvMtd > 0 ? Math.round((gmvMtd / portfolioGmvMtd) * 100) : 0,
        sku_count: skuCountByBrand.get(String(row.id)) ?? 0,
        active_buyers_mtd: current?.buyers.size ?? 0,
        total_buyers: buyerAccessCountByBrand.get(String(row.id)) ?? totalBuyers,
        catalog_days_ago: catalogDaysAgo,
        categories: Array.from(categorySetByBrand.get(String(row.id)) ?? new Set(['Uncategorized'])),
        catalog_name: latestCatalog?.name ?? null,
        alerts,
      };
    });

    const activeCategories = (categoriesRes.data ?? [])
      .map((row: { name: string }) => row.name)
      .filter(Boolean);
    const categories = Array.from(new Set([...activeCategories, ...brands.flatMap((brand) => brand.categories)])).sort((a, b) => a.localeCompare(b));
    const filteredBrands = brands.filter((brand) => {
      const categoryOk = categoryFilter.length === 0 || categoryFilter.some((value) => brand.categories.includes(value));
      const cohortOk = cohortFilter.length === 0 || (brand.default_cohort_id ? cohortFilter.includes(brand.default_cohort_id) : false);
      const searchOk =
        !search ||
        [brand.display_name_override ?? brand.master_brand?.name ?? '', ...brand.categories, brand.catalog_name ?? '']
          .some((value) => value.toLowerCase().includes(search));
      return categoryOk && cohortOk && searchOk;
    });

    const byGmv = [...brands].sort((a, b) => b.gmv_mtd - a.gmv_mtd);
    const byGrowth = [...brands].sort((a, b) => b.growth_pct - a.growth_pct);
    const pageBrands = filteredBrands.slice(0, limit);
    const needsAttentionCount = brands.filter((brand) => brand.alerts.length > 0).length;
    const catalogFreshnessCount = brands.filter((brand) => (catalogTouchesMtdByBrand.get(brand.id) ?? 0) > 0).length;
    const monthCatalogDates = publishedCatalogs
      .filter((catalog) => monthCatalogIdSet.has(catalog.id))
      .map((catalog) => catalog.updated_at)
      .sort();
    const catalogFreshnessEarliestDays = monthCatalogDates[0]
      ? Math.max(0, Math.floor((now.getTime() - new Date(monthCatalogDates[0]).getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    return NextResponse.json({
      period,
      kpis: {
        portfolio_gmv_mtd: portfolioGmvMtd,
        portfolio_gmv_prev_mtd: portfolioGmvPrevMtd,
        brands_carried: isAssistant ? brands.length : (snapshot?.active_count ?? brands.length),
        buyers_with_orders_mtd: currentBuyerSet.size,
        total_buyers: totalBuyers,
        need_attention_count: needsAttentionCount,
        catalog_freshness_count: catalogFreshnessCount,
        total_campaigns: publishedCatalogs.length,
        catalog_freshness_earliest_days: catalogFreshnessEarliestDays,
      },
      todays_read: {
        needs_attention: brands
          .filter((brand) => brand.alerts.length > 0)
          .map((brand) => ({ id: brand.id, name: brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown brand', growth_pct: brand.growth_pct, alerts: brand.alerts })),
        top_performers: byGmv.slice(0, 3).map((brand) => ({ id: brand.id, name: brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown brand', gmv_mtd: brand.gmv_mtd })),
        top_risers: byGrowth.slice(0, 3).map((brand) => ({ id: brand.id, name: brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown brand', growth_pct: brand.growth_pct, gmv_mtd: brand.gmv_mtd, gmv_prev_mtd: brand.gmv_prev_mtd })),
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
