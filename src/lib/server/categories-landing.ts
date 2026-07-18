import type {
  CategoriesLandingResponse,
  CategoryCalloutRow,
  CategoryTableRow,
} from '@/hooks/useCategories';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';

export interface CategoriesLandingFilters {
  search: string;
  status: string[];
  products: string[];
  limit: number;
  offset: number;
  includeSummary: boolean;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

type CategoryMetricRow = {
  tenant_category_id: string;
  active_sku_count: number | string;
  oos_sku_count: number | string;
  low_stock_sku_count: number | string;
  brand_count: number | string;
  gmv_current: number | string;
  gmv_previous: number | string;
  units_current: number | string;
  buyers_current: number | string;
  avg_days_cover: number | string | null;
};

type CategorySummary = Pick<CategoriesLandingResponse, 'kpis' | 'callouts'>;

function withInitials(row: CategoryCalloutRow): CategoryCalloutRow {
  return { ...row, initials: getInitials(row.name) };
}

export async function getCategoriesLandingPayload(
  db: any,
  tenantId: string,
  periodInput: string | null | undefined,
  filters: CategoriesLandingFilters,
): Promise<CategoriesLandingResponse> {
  const period = getSellerLandingPeriodMeta('last90');
  const { search, status: statusFilter, products: productFilter, limit, offset, includeSummary } = filters;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]!;
  const hasProductsFilter = productFilter.includes('Has Products');
  const emptyFilter = productFilter.includes('Empty');
  const productMode = hasProductsFilter === emptyFilter ? 'all' : hasProductsFilter ? 'has_products' : 'empty';

  const rowCategoriesRes = await db
    .schema('app')
    .rpc('search_seller_category_landing_ids', {
      p_tenant_id: tenantId,
      p_query: search || null,
      p_statuses: statusFilter.length > 0 ? statusFilter : null,
      p_product_mode: productMode,
      p_limit: limit,
      p_offset: offset,
    });
  if (rowCategoriesRes.error) throw rowCategoriesRes.error;

  const rowCategoryResult = (rowCategoriesRes.data ?? []) as Array<{ id: string | null; total_count: number | string }>;
  const pageCategoryIds = rowCategoryResult.flatMap((row) => row.id ? [row.id] : []);
  const categoriesQuery = db
    .schema('app')
    .from('tenant_categories')
    .select('id, name, slug, is_active, deleted_at, created_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const emptyResult = Promise.resolve({ data: [], error: null });
  const [categoriesRes, metricsRes, summaryRes, productBrandingRes] = await Promise.all([
    pageCategoryIds.length > 0 ? categoriesQuery.in('id', pageCategoryIds) : emptyResult,
    pageCategoryIds.length > 0
      ? db.schema('app').rpc('get_seller_category_landing_page_metrics_v2', {
          p_tenant_id: tenantId,
          p_category_ids: pageCategoryIds,
          p_current_start: period.current_start.split('T')[0],
          p_current_end_exclusive: period.current_end_exclusive.split('T')[0],
          p_previous_start: period.previous_start.split('T')[0],
          p_previous_end_exclusive: period.previous_end_exclusive.split('T')[0],
          p_velocity_start: thirtyDaysAgoStr,
        })
      : emptyResult,
    includeSummary
      ? db.schema('app').rpc('get_seller_category_landing_summary_v2', {
          p_tenant_id: tenantId,
          p_current_start: period.current_start.split('T')[0],
          p_current_end_exclusive: period.current_end_exclusive.split('T')[0],
          p_previous_start: period.previous_start.split('T')[0],
          p_previous_end_exclusive: period.previous_end_exclusive.split('T')[0],
        })
      : Promise.resolve({ data: null, error: null }),
    // "Uncategorised active products" (doc-starred Landing Pulse metric) is not
    // exposed by get_seller_category_landing_summary_v2 as of the phase-9 rework
    // (its uncategorized_count field now means something else — see the kpis type
    // doc comment). Pull the real counts directly off tenant_products instead of
    // adding a new RPC, same plain-select pattern already used above for categories.
    includeSummary
      ? Promise.all([
          db.schema('app').from('tenant_products').select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true),
          db.schema('app').from('tenant_products').select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true).is('tenant_category_id', null),
        ])
      : Promise.resolve(null),
  ]);

  if (categoriesRes.error || metricsRes.error || summaryRes.error) {
    throw categoriesRes.error ?? metricsRes.error ?? summaryRes.error;
  }

  const rawCategories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    deleted_at: string | null;
    created_at: string;
  }>;
  const metricsByCategory = new Map(
    ((metricsRes.data ?? []) as CategoryMetricRow[]).map((row) => [row.tenant_category_id, row]),
  );

  const rows: CategoryTableRow[] = rawCategories.map((cat) => {
    const metric = metricsByCategory.get(cat.id);
    const gmv_mtd = Number(metric?.gmv_current ?? 0);
    const gmv_prev = Number(metric?.gmv_previous ?? 0);
    const growth_pct = gmv_prev > 0 ? Math.round(((gmv_mtd - gmv_prev) / gmv_prev) * 100) : 0;
    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      initials: getInitials(cat.name),
      is_active: cat.is_active,
      active_sku_count: Number(metric?.active_sku_count ?? 0),
      oos_sku_count: Number(metric?.oos_sku_count ?? 0),
      low_stock_sku_count: Number(metric?.low_stock_sku_count ?? 0),
      brand_count: Number(metric?.brand_count ?? 0),
      gmv_mtd,
      gmv_prev,
      growth_pct,
      units_mtd: Number(metric?.units_current ?? 0),
      buyers_count: Number(metric?.buyers_current ?? 0),
      avg_days_cover: metric?.avg_days_cover == null ? null : Number(metric.avg_days_cover),
    };
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const visibleRows = rowCategoryResult
    .map((row) => (row.id ? rowsById.get(row.id) : undefined))
    .filter((row): row is CategoryTableRow => Boolean(row));

  const rawSummary = summaryRes.data as CategorySummary | null;
  const activeProductCount = productBrandingRes ? Number(productBrandingRes[0]?.count ?? 0) : 0;
  const uncategorisedActiveProductCount = productBrandingRes ? Number(productBrandingRes[1]?.count ?? 0) : 0;
  const summary = rawSummary ? {
    kpis: {
      active_count: Number(rawSummary.kpis.active_count ?? 0),
      low_stock_count: Number(rawSummary.kpis.low_stock_count ?? 0),
      top_category_name: rawSummary.kpis.top_category_name ?? null,
      top_category_share_pct: Number(rawSummary.kpis.top_category_share_pct ?? 0),
      uncategorized_count: Number(rawSummary.kpis.uncategorized_count ?? 0),
      active_product_count: activeProductCount,
      uncategorised_active_product_count: uncategorisedActiveProductCount,
      categorised_active_product_count: Math.max(0, activeProductCount - uncategorisedActiveProductCount),
    },
    callouts: {
      stockout_risk: (rawSummary.callouts.stockout_risk ?? []).map(withInitials),
      top_performers: (rawSummary.callouts.top_performers ?? []).map(withInitials),
      fast_movers: (rawSummary.callouts.fast_movers ?? []).map(withInitials),
    },
  } : null;

  return {
    ...(includeSummary && summary ? summary : {}),
    rows: visibleRows,
    total: Number(rowCategoryResult[0]?.total_count ?? 0),
    limit,
    offset,
    nextOffset: rowCategoryResult.some((row) => row.id) && offset + rowCategoryResult.filter((row) => row.id).length < Number(rowCategoryResult[0]?.total_count ?? 0)
      ? offset + rowCategoryResult.filter((row) => row.id).length
      : null,
    period: period.selected,
  } as CategoriesLandingResponse;
}
