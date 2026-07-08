import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createTimer } from '@/lib/server-timing';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { CatalogComposerPayloadSchema, type CatalogComposerFilterState, type CatalogComposerTag } from '@/lib/zod';
import { revalidateSellerDashboardCache } from '@/lib/server/dashboard-cache';
import { queueCampaignPublishNotify } from '@/lib/server/campaign-publish-notify';
import { runCampaignPublishPreflight } from '@/lib/server/campaign-publish-preflight';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import {
  aggregateCampaignViewsByCampaign,
  buildCatalogAttributedMetrics,
  type CampaignEstimateRow,
  type CampaignOrderRow,
  type CampaignViewRow,
} from '@/lib/server/campaign-performance';
import { getInAppCreateFlags } from '@/lib/server/seller-features';
import { resolveCampaignLandingAudience } from '@/lib/server/campaign-broadcast';

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
  campaign_id: string;
  tenant_product_id: string;
}

interface TenantProductRow {
  id: string;
  internal_sku: string;
  name_override: string | null;
  tenant_brand_id: string | null;
  category_name: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  created_at: string;
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
  cached_member_count?: number | null;
}

interface CohortMemberRow {
  cohort_id: string;
  buyer_id: string;
}

interface OrderRow {
  id: string;
  campaign_id: string | null;
  total_amount: number | null;
  placed_at: string | null;
  created_at: string | null;
  status: string;
  buyer_id: string;
}

interface EstimateRow {
  id: string;
  campaign_id: string | null;
  total_amount: number | null;
  status: string;
  converted_to_order_id: string | null;
  created_at: string | null;
  buyer_id?: string;
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

function buildCatalogScopeValue(input: {
  scopeType: 'cohort' | 'buyer' | 'geography' | 'all';
  cohortId?: string | null;
  buyerId?: string | null;
  buyerIds?: string[];
  geography?: { state?: string; city?: string; zone?: string } | null;
  filters: CatalogComposerFilterState;
  tagOverrides?: Record<string, CatalogComposerTag | null>;
  priceSource?: 'price_list' | 'manual';
  priceListId?: string | null;
}) {
  const scope: Record<string, unknown> = {
    composer: {
      filters: input.filters,
      tag_overrides: input.tagOverrides ?? {},
      price_source: input.priceSource ?? 'manual',
      price_list_id: input.priceListId ?? null,
    },
  };

  if (input.scopeType === 'cohort' && input.cohortId) {
    scope.cohort_id = input.cohortId;
  } else if (input.scopeType === 'buyer' && input.buyerId) {
    scope.buyer_id = input.buyerId;
  } else if (input.scopeType === 'buyer' && input.buyerIds && input.buyerIds.length > 0) {
    scope.buyer_ids = input.buyerIds;
  } else if (input.scopeType === 'geography' && input.geography) {
    scope.geography = input.geography;
  }

  return scope;
}

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

async function ensureTenantProducts(
  db: any,
  tenantId: string,
  tenantProductIds: string[],
) {
  if (tenantProductIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await db
    .schema('app')
    .from('tenant_products')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', tenantProductIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error('Failed to validate selected products');
  }

  return new Set<string>(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

async function ensureTenantBuyers(db: any, tenantId: string, buyerIds: string[]) {
  if (buyerIds.length === 0) return new Set<string>();

  const { data, error } = await db
    .schema('app')
    .from('buyers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('id', buyerIds)
    .is('deleted_at', null);

  if (error) throw new Error('Failed to validate selected buyers');
  return new Set<string>(((data ?? []) as Array<{ id: string }>).map((row) => row.id));
}

async function ensureTenantPriceList(db: any, tenantId: string, priceListId: string | null | undefined) {
  if (!priceListId) return true;

  const { data, error } = await db
    .schema('app')
    .from('price_lists')
    .select('id')
    .eq('id', priceListId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error('Failed to validate price list');
  return Boolean(data);
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'catalogs_api', init, APP_GET_CACHE_CONTROL);
  };

  try {
    const claims = await getVerifiedClaims(req);

    if (!claims.tenant_id) {
      return timedJson({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return timedJson({ error: 'Server configuration error' }, { status: 500 });
    }

    const tenantId = claims.tenant_id;
    const db = supabaseAdmin;
    const now = new Date();
    const nowTs = now.getTime();
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'), now);
    const limit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);

    const [catalogsRes, ordersRes, prevOrdersRes, estimatesRes, prevEstimatesRes, viewsRes, cohortsRes, activeBuyersRes] = await Promise.all([
      db
        .schema('app')
        .from('campaigns')
        .select('id, name, scope_type, scope_value, valid_from, valid_to, status, created_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit),
      db
        .schema('app')
        .from('orders')
        .select('id, campaign_id, total_amount, placed_at, created_at, status, buyer_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .not('campaign_id', 'is', null)
        .gte('placed_at', period.current_start)
        .lt('placed_at', period.current_end_exclusive),
      db
        .schema('app')
        .from('orders')
        .select('id, campaign_id, total_amount, placed_at, created_at, status, buyer_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .not('campaign_id', 'is', null)
        .gte('placed_at', period.previous_start)
        .lt('placed_at', period.previous_end_exclusive),
      db
        .schema('app')
        .from('estimates')
        .select('id, campaign_id, total_amount, status, converted_to_order_id, created_at, buyer_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .not('campaign_id', 'is', null)
        .gte('created_at', period.current_start)
        .lt('created_at', period.current_end_exclusive),
      db
        .schema('app')
        .from('estimates')
        .select('id, campaign_id, total_amount, status, converted_to_order_id, created_at, buyer_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .not('campaign_id', 'is', null)
        .gte('created_at', period.previous_start)
        .lt('created_at', period.previous_end_exclusive),
      db
        .schema('app')
        .from('campaign_views')
        .select('campaign_id, buyer_id, viewed_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .gte('viewed_at', period.current_start)
        .lt('viewed_at', period.current_end_exclusive),
      db.schema('app').from('cohorts').select('id, name, cached_member_count').eq('tenant_id', tenantId).is('deleted_at', null),
      db
        .schema('app')
        .from('buyers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null),
    ]);

    if (
      catalogsRes.error
      || ordersRes.error
      || prevOrdersRes.error
      || estimatesRes.error
      || prevEstimatesRes.error
      || viewsRes.error
      || cohortsRes.error
      || activeBuyersRes.error
    ) {
      console.error(
        '[GET /api/tenant/catalogs] query error:',
        catalogsRes.error
          || ordersRes.error
          || prevOrdersRes.error
          || estimatesRes.error
          || prevEstimatesRes.error
          || viewsRes.error
          || cohortsRes.error
          || activeBuyersRes.error,
      );
      return timedJson({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
    }

    const catalogs = (catalogsRes.data ?? []) as CatalogRow[];
    const catalogIds = catalogs.map((catalog) => catalog.id);
    let items: CatalogItemRow[] = [];
    if (catalogIds.length > 0) {
      const itemsRes = await db
        .schema('app')
        .from('campaign_items')
        .select('campaign_id, tenant_product_id')
        .in('campaign_id', catalogIds)
        .is('deleted_at', null);

      if (itemsRes.error) {
        console.error('[GET /api/tenant/catalogs] items query error:', itemsRes.error);
        return timedJson({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
      }
      items = (itemsRes.data ?? []) as CatalogItemRow[];
    }
    const orders = (ordersRes.data ?? []) as OrderRow[];
    const prevOrders = (prevOrdersRes.data ?? []) as OrderRow[];
    const estimates = (estimatesRes.data ?? []) as EstimateRow[];
    const prevEstimates = (prevEstimatesRes.data ?? []) as EstimateRow[];
    const campaignViews = (viewsRes.data ?? []) as CampaignViewRow[];
    const cohorts = (cohortsRes.data ?? []) as CohortRow[];
    const viewsByCampaign = aggregateCampaignViewsByCampaign(campaignViews);

    const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));
    const activeBuyersCount = activeBuyersRes.count ?? 0;
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
        return timedJson({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
      }

      tenantProducts = (tenantProductsRes.data ?? []) as TenantProductRow[];
      const tenantBrandIds = Array.from(new Set(tenantProducts.map((product) => product.tenant_brand_id).filter(Boolean))) as string[];

      if (tenantBrandIds.length > 0) {
        const tenantBrandsRes = await db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override, master_brand_id')
          .in('id', tenantBrandIds)
          .is('deleted_at', null);

        if (tenantBrandsRes.error) {
          console.error('[GET /api/tenant/catalogs] tenant brands error:', tenantBrandsRes.error);
          return timedJson({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
        }

        tenantBrands = (tenantBrandsRes.data ?? []) as TenantBrandRow[];
        const masterBrandIds = Array.from(
          new Set(
            tenantBrands
              .map((brand) => brand.master_brand_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ),
        );
        if (masterBrandIds.length > 0) {
          const masterBrandsRes = await db
            .schema('catalog')
            .from('brands')
            .select('id, name')
            .in('id', masterBrandIds)
            .is('deleted_at', null);

          if (masterBrandsRes.error) {
            console.error('[GET /api/tenant/catalogs] master brands error:', masterBrandsRes.error);
            return timedJson({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
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
      if (!itemsByCatalog.has(item.campaign_id)) itemsByCatalog.set(item.campaign_id, []);
      itemsByCatalog.get(item.campaign_id)?.push(item);
    }

    const allOrderIds = Array.from(new Set([...orders, ...prevOrders].map((order) => order.id)));
    const allEstimateIds = Array.from(new Set([...estimates, ...prevEstimates].map((estimate) => estimate.id)));

    const [orderItemsRes, estimateItemsRes, createFlags] = await Promise.all([
      allOrderIds.length && tenantProductIds.length
        ? db
            .schema('app')
            .from('order_items')
            .select('order_id, tenant_product_id, qty, line_total, unit_price')
            .in('order_id', allOrderIds)
            .in('tenant_product_id', tenantProductIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      allEstimateIds.length && tenantProductIds.length
        ? db
            .schema('app')
            .from('estimate_items')
            .select('estimate_id, tenant_product_id, qty, line_total, unit_price')
            .in('estimate_id', allEstimateIds)
            .in('tenant_product_id', tenantProductIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [], error: null }),
      getInAppCreateFlags(tenantId),
    ]);

    if (orderItemsRes.error || estimateItemsRes.error) {
      console.error('[GET /api/tenant/catalogs] line items error:', orderItemsRes.error || estimateItemsRes.error);
      return timedJson({ error: 'Failed to fetch catalogs landing' }, { status: 500 });
    }

    const orderItemsRaw = (orderItemsRes.data ?? []) as Array<{
      order_id: string;
      tenant_product_id: string;
      qty: number | null;
      line_total: number | null;
      unit_price: number | null;
    }>;
    const estimateItemsRaw = (estimateItemsRes.data ?? []) as Array<{
      estimate_id: string;
      tenant_product_id: string;
      qty: number | null;
      line_total: number | null;
      unit_price: number | null;
    }>;
    const channelOptions = {
      includeOrders: createFlags.create_sales_orders,
      includeEstimates: createFlags.create_enquiries,
    };

    const productsByCampaign = new Map<string, Set<string>>();
    for (const item of items) {
      if (!productsByCampaign.has(item.campaign_id)) productsByCampaign.set(item.campaign_id, new Set());
      productsByCampaign.get(item.campaign_id)?.add(item.tenant_product_id);
    }

    const catalogRows = catalogs.map((catalog, index) => {
      const displayStatus = getDisplayStatus(catalog.status, catalog.valid_to, nowTs);
      const tone = getStatusTone(displayStatus);
      const catalogItems = itemsByCatalog.get(catalog.id) ?? [];
      const campaignProductIds = productsByCampaign.get(catalog.id) ?? new Set<string>();
      const conversionMetrics = buildCatalogAttributedMetrics(
        catalog.id,
        campaignProductIds,
        orders as CampaignOrderRow[],
        estimates as CampaignEstimateRow[],
        orderItemsRaw,
        estimateItemsRaw,
        channelOptions,
      );
      const viewMetrics = viewsByCampaign.get(catalog.id);
      const gmv = conversionMetrics.gmv;
      const conversionCount = conversionMetrics.conversionCount;
      const views = viewMetrics?.uniqueViewers ?? 0;
      const conversionPct = views > 0 ? Number(((conversionCount / views) * 100).toFixed(1)) : 0;
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
      const cohort = cohortId ? cohortById.get(cohortId) : null;
      const audience = resolveCampaignLandingAudience({
        scopeType: catalog.scope_type,
        scopeValue: catalog.scope_value,
        cohort: cohort ? { name: cohort.name, cached_member_count: cohort.cached_member_count } : null,
        allBuyersCount: activeBuyersCount,
      });
      const orderCount = conversionMetrics.orderCount;
      const estimateCount = conversionMetrics.estimateCount;
      const viewPct =
        audience.buyerCount != null && audience.buyerCount > 0
          ? Number(((views / audience.buyerCount) * 100).toFixed(1))
          : 0;
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
        cohort_name: audience.label,
        audience_count: audience.buyerCount,
        products_count: catalogItems.length,
        brands_count: brandSet.size,
        gmv,
        order_count: orderCount,
        estimate_count: estimateCount,
        orders: orderCount,
        conversions: conversionCount,
        views,
        view_pct: viewPct,
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
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiring7d = liveCatalogs.filter(
      (catalog) => catalog.valid_to != null && new Date(catalog.valid_to).getTime() <= nowTs + sevenDaysMs,
    ).length;
    const periodConversionMetrics = catalogs.reduce(
      (acc, catalog) => {
        const campaignProductIds = productsByCampaign.get(catalog.id) ?? new Set<string>();
        const metrics = buildCatalogAttributedMetrics(
          catalog.id,
          campaignProductIds,
          orders as CampaignOrderRow[],
          estimates as CampaignEstimateRow[],
          orderItemsRaw,
          estimateItemsRaw,
          channelOptions,
        );
        acc.gmv += metrics.gmv;
        acc.conversionCount += metrics.conversionCount;
        return acc;
      },
      { gmv: 0, conversionCount: 0 },
    );
    const prevPeriodConversionMetrics = catalogs.reduce(
      (acc, catalog) => {
        const campaignProductIds = productsByCampaign.get(catalog.id) ?? new Set<string>();
        const metrics = buildCatalogAttributedMetrics(
          catalog.id,
          campaignProductIds,
          prevOrders as CampaignOrderRow[],
          prevEstimates as CampaignEstimateRow[],
          orderItemsRaw,
          estimateItemsRaw,
          channelOptions,
        );
        acc.gmv += metrics.gmv;
        acc.conversionCount += metrics.conversionCount;
        return acc;
      },
      { gmv: 0, conversionCount: 0 },
    );
    const gmvMtd = periodConversionMetrics.gmv;
    const gmvPrevMtd = prevPeriodConversionMetrics.gmv;
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

    return timedJson({
      period,
      channels: {
        orders_enabled: createFlags.create_sales_orders,
        estimates_enabled: createFlags.create_enquiries,
      },
      kpis: {
        live_catalogs: liveCatalogs.length,
        draft_catalogs: draftCatalogs.length,
        ended_catalogs: endedCatalogs.length,
        expiring7d,
        gmv_mtd: gmvMtd,
        gmv_prev_mtd: gmvPrevMtd,
        gmv_growth_pct: gmvGrowthPct,
        avg_conversion_pct: avgConversion,
        orders_attributed_mtd: periodConversionMetrics.conversionCount,
        conversions_mtd: periodConversionMetrics.conversionCount,
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
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const parsed = CatalogComposerPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });

  const db = supabaseAdmin as any;
  const payload = parsed.data;

  if (payload.scope_type === 'cohort') {
    const { data: cohort, error: cohortError } = await db
      .schema('app')
      .from('cohorts')
      .select('id')
      .eq('id', payload.cohort_id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (cohortError) return NextResponse.json({ error: 'Failed to validate cohort' }, { status: 500 });
    if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 400 });
  }

  if (payload.scope_type === 'buyer') {
    const validBuyerIds = await ensureTenantBuyers(db, claims.tenant_id, payload.buyer_ids);
    if (validBuyerIds.size !== payload.buyer_ids.length) {
      return NextResponse.json({ error: 'One or more selected buyers are invalid' }, { status: 400 });
    }
  }

  if (payload.price_source === 'price_list') {
    const priceListOk = await ensureTenantPriceList(db, claims.tenant_id, payload.price_list_id);
    if (!priceListOk) {
      return NextResponse.json({ error: 'Pricelist not found' }, { status: 400 });
    }
  }

  const tenantProductIds = payload.items.map((item) => item.tenant_product_id);
  const validProductIds = await ensureTenantProducts(db, claims.tenant_id, tenantProductIds);
  if (validProductIds.size !== tenantProductIds.length) {
    return NextResponse.json({ error: 'One or more selected products are invalid' }, { status: 400 });
  }

  const status: CatalogStatus = payload.save_mode === 'publish' ? 'published' : 'draft';
  const shareToken = payload.save_mode === 'publish' ? generateShareToken() : null;
  const scopeValue = buildCatalogScopeValue({
    scopeType: payload.scope_type,
    cohortId: payload.cohort_id,
    buyerIds: payload.buyer_ids,
    filters: payload.filters,
    tagOverrides: payload.tag_overrides,
    priceSource: payload.price_source,
    priceListId: payload.price_list_id,
  });
  const buyerNote = (payload.buyer_note ?? payload.message)?.trim() || null;
  const isPublishing = payload.save_mode === 'publish';

  if (isPublishing && payload.notify_whatsapp) {
    const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
    if (!flagEnabled) {
      return NextResponse.json({ error: 'WhatsApp broadcast feature is not enabled' }, { status: 403 });
    }

    const preflight = await runCampaignPublishPreflight(db, {
      tenantId: claims.tenant_id,
      scopeType: payload.scope_type,
      scopeValue,
      notifyWhatsapp: true,
    });

    if (!preflight.can_notify) {
      return NextResponse.json(
        { error: preflight.blockers[0] ?? 'WhatsApp notify preflight failed', blockers: preflight.blockers },
        { status: 400 },
      );
    }

    if (payload.notify_scheduled_for && new Date(payload.notify_scheduled_for).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
    }
  }

  const { data: insertedCatalog, error: insertError } = await db
    .schema('app')
    .from('campaigns')
    .insert({
      tenant_id: claims.tenant_id,
      name: payload.name,
      scope_type: payload.scope_type,
      scope_value: scopeValue,
      valid_from: payload.valid_from.toISOString(),
      valid_to: payload.valid_to ? payload.valid_to.toISOString() : null,
      message: isPublishing ? buyerNote : (payload.message?.trim() || null),
      hero_image_url: payload.hero_image_url ?? null,
      status,
      share_token: shareToken,
      created_by: claims.sub,
      updated_by: claims.sub,
    })
    .select('id, status')
    .single();

  if (insertError || !insertedCatalog) {
    console.error('[POST /api/tenant/catalogs] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create catalog' }, { status: 500 });
  }

  if (payload.items.length > 0) {
    const { error: itemsError } = await db
      .schema('app')
      .from('campaign_items')
      .insert(
        payload.items.map((item) => ({
          campaign_id: insertedCatalog.id,
          tenant_product_id: item.tenant_product_id,
          display_order: item.display_order,
          price_override: item.price_override ?? null,
          created_by: claims.sub,
          updated_by: claims.sub,
        })),
      );

    if (itemsError) {
      console.error('[POST /api/tenant/catalogs] items error:', itemsError);
      return NextResponse.json({ error: 'Failed to create catalog items' }, { status: 500 });
    }
  }

  revalidateSellerDashboardCache(claims.tenant_id);

  let whatsappNotify: { broadcast_id: string; recipient_count: number; scheduled: boolean } | null = null;

  if (isPublishing && payload.notify_whatsapp) {
    try {
      whatsappNotify = await queueCampaignPublishNotify(db, {
        tenantId: claims.tenant_id,
        actorId: claims.sub ?? claims.tenant_id,
        campaignId: insertedCatalog.id,
        campaignName: payload.name,
        scopeType: payload.scope_type,
        scopeValue,
        buyerNote,
        scheduledFor: payload.notify_scheduled_for ?? null,
        heroImageUrl: null,
      });
    } catch (notifyError) {
      console.error('[POST /api/tenant/catalogs] WhatsApp notify failed after publish:', notifyError);
      return NextResponse.json(
        {
          error: notifyError instanceof Error ? notifyError.message : 'Campaign published but WhatsApp notify failed',
          catalog: insertedCatalog,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ catalog: insertedCatalog, whatsapp_notify: whatsappNotify });
}
