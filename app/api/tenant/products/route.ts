import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { createTimer } from '@/lib/server-timing';
import { resolveImportedProductTenantLinks } from '@/lib/server/tenant-product-source-resolution';
import { z } from 'zod';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam, type LandingFilterMeta } from '@/lib/landing-filter-params';
import { chunkArray, POSTGREST_IN_CHUNK_SIZE } from '@/lib/server/warehouse-data';

const AddProductSchema = z.object({
  master_product_id: z.string().uuid('Invalid product ID').optional().nullable(),
  internal_sku: z.string().min(1, 'Internal SKU is required'),
  name: z.string().min(1).optional(),
  mrp: z.coerce.number().positive('MRP must be positive'),
  base_selling_price: z.coerce.number().positive('Base selling price must be positive'),
  cost_price: z.coerce.number().positive().optional().nullable(),
  tenant_brand_id: z.string().uuid().optional(),
  name_override: z.string().optional(),
  default_uom: z.string().optional(),
  pack_size: z.coerce.number().positive().optional().nullable(),
  hsn_code: z.string().optional(),
  gst_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  description: z.string().optional(),
  category_name: z.string().optional(),
  tenant_category_id: z.string().uuid().optional().nullable(),
  attributes: z.record(z.string()).optional().default({}),
  image_urls: z.array(z.string().url()).optional().default([]),
});

type ProductMetricRow = {
  tenant_product_id: string;
  units_sold?: number | null;
  revenue?: number | null;
};

type InventoryMetricRow = {
  tenant_product_id: string;
  qty_available?: number | null;
};

type InvoiceMetricRow = {
  id: string;
  status: string | null;
};

type InvoiceItemMetricRow = {
  invoice_id: string;
  tenant_product_id: string;
  qty?: number | null;
};

type SummaryProductSeedRow = {
  id: string;
  tenant_brand_id: string | null;
  tenant_category_id?: string | null;
  master_product_id: string | null;
  internal_sku: string;
  name_override: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
};

type OrderMetricRow = {
  id: string;
  status: string | null;
};

type OrderItemMetricRow = {
  order_id: string;
  tenant_product_id: string;
  qty?: number | null;
  line_total?: number | null;
  unit_price?: number | null;
};

type InventoryScopeRow = {
  tenant_product_id: string;
  qty_available?: number | null;
  location_id?: string | null;
};

type ProductRowDetail = {
  id: string;
  tenant_id: string;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  master_product_id: string | null;
  internal_sku: string;
  name_override: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[] | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
};

const NO_ACCESS_ID = '00000000-0000-0000-0000-000000000000';

type PostgrestListResult<T> = { data: T[] | null; error: unknown };

async function fetchRowsInChunks<T>(
  ids: string[],
  fetchChunk: (chunk: string[]) => Promise<PostgrestListResult<T>>,
): Promise<PostgrestListResult<T>> {
  if (ids.length === 0) {
    return { data: [], error: null };
  }

  const rows: T[] = [];
  for (const chunk of chunkArray(ids, POSTGREST_IN_CHUNK_SIZE)) {
    const result = await fetchChunk(chunk);
    if (result.error) {
      return { data: null, error: result.error };
    }
    rows.push(...(result.data ?? []));
  }

  return { data: rows, error: null };
}

async function loadTenantInventoryForTenant(
  db: any,
  tenantId: string,
): Promise<PostgrestListResult<InventoryMetricRow>> {
  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available, tenant_products!inner(tenant_id)')
    .eq('tenant_products.tenant_id', tenantId)
    .is('deleted_at', null);

  if (error) {
    return { data: null, error };
  }

  return {
    data: ((data ?? []) as Array<{ tenant_product_id: string; qty_available?: number | null }>).map((row) => ({
      tenant_product_id: row.tenant_product_id,
      qty_available: row.qty_available,
    })),
    error: null,
  };
}

function metricNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function isOperationalOrderStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? '').toLowerCase();
  return !['void', 'cancelled', 'rejected', 'archived'].includes(normalized);
}

function getIstDayDaysAgo(daysAgo: number, now = new Date()): string {
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  istNow.setHours(0, 0, 0, 0);
  istNow.setDate(istNow.getDate() - daysAgo);
  const year = istNow.getFullYear();
  const month = `${istNow.getMonth() + 1}`.padStart(2, '0');
  const day = `${istNow.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function GET(req: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    return jsonWithServerTiming(body, timer, 'products_api', init, APP_GET_CACHE_CONTROL);
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

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries
    const isAssistant = claims.role === 'seller_assistant';
    const assistantLocationIds = isAssistant ? (claims.location_ids ?? []).filter(Boolean) : [];
    const period = getSellerLandingPeriodMeta(req.nextUrl.searchParams.get('period'));

    const reqLimit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const search = req.nextUrl.searchParams.get('search')?.trim() || null;
    const brandId = req.nextUrl.searchParams.get('brand_id') || null;
    const brandParams = readArrayParam(req.nextUrl.searchParams, 'brand');
    const categoryParams = readArrayParam(req.nextUrl.searchParams, 'category');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const stockParams = readArrayParam(req.nextUrl.searchParams, 'stock');
    const scopeInventoryRes = isAssistant
      ? assistantLocationIds.length > 0
        ? await db
            .schema('app')
            .from('tenant_inventory')
            .select('tenant_product_id, qty_available, location_id')
            .in('location_id', assistantLocationIds)
            .is('deleted_at', null)
        : { data: [] as InventoryScopeRow[], error: null }
      : { data: [] as InventoryScopeRow[], error: null };

    if (scopeInventoryRes.error) {
      console.error('[GET /api/tenant/products] assistant scope inventory error:', scopeInventoryRes.error.code, scopeInventoryRes.error.message);
      return timedJson({ error: 'Failed to resolve product scope' }, { status: 500 });
    }

    const scopedInventoryRows = (scopeInventoryRes.data ?? []) as InventoryScopeRow[];
    const scopedProductIds = Array.from(
      new Set(scopedInventoryRows.map((row) => row.tenant_product_id).filter((value): value is string => Boolean(value))),
    );

    // Fetch snapshot for total counts (O(1)) alongside enrichment queries
    const { data: snapshotRow } = await db
      .schema('app')
      .from('products_snapshot')
      .select('total_count, active_count, low_stock_count')
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    let summaryProductsQuery = db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, tenant_category_id, master_product_id, internal_sku, name_override, image_urls, is_active, created_at')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null);

    if (isAssistant) {
      summaryProductsQuery = summaryProductsQuery.in('id', scopedProductIds.length > 0 ? scopedProductIds : [NO_ACCESS_ID]);
    }

    const summaryProductsRes = await summaryProductsQuery;

    if (summaryProductsRes.error) {
      console.error('[GET /api/tenant/products] summary products error:', summaryProductsRes.error.code, summaryProductsRes.error.message);
      return timedJson({ error: 'Failed to fetch products summary' }, { status: 500 });
    }

    const summaryProducts = (summaryProductsRes.data ?? []) as SummaryProductSeedRow[];
    const summaryProductIds = summaryProducts.map((row) => row.id);
    const summaryProductIdSet = new Set(summaryProductIds);

    let rowUniverseQuery = db
      .schema('app')
      .from('tenant_products')
      .select('id, tenant_brand_id, tenant_category_id, master_product_id, internal_sku, name_override, image_urls, is_active, created_at')
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (isAssistant) {
      rowUniverseQuery = rowUniverseQuery.in('id', scopedProductIds.length > 0 ? scopedProductIds : [NO_ACCESS_ID]);
    }

    if (search) {
      rowUniverseQuery = rowUniverseQuery.textSearch('search_vector', search, { type: 'websearch' });
    }

    if (brandId) {
      rowUniverseQuery = rowUniverseQuery.eq('tenant_brand_id', brandId);
    }

    if (statusParams.length > 0) {
      const wantsActive = statusParams.includes('Active');
      const wantsInactive = statusParams.includes('Inactive');
      if (wantsActive && !wantsInactive) rowUniverseQuery = rowUniverseQuery.eq('is_active', true);
      if (wantsInactive && !wantsActive) rowUniverseQuery = rowUniverseQuery.eq('is_active', false);
    }

    const rowUniverseRes = await rowUniverseQuery;

    if (rowUniverseRes.error) {
      console.error('[GET /api/tenant/products] row universe error:', rowUniverseRes.error.code, rowUniverseRes.error.message);
      return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
    }

    const rowUniverseSeedProducts = (rowUniverseRes.data ?? []) as SummaryProductSeedRow[];

    // Fetch master product details for enrichment
    const masterProductIds = rowUniverseSeedProducts
      .map((r) => r.master_product_id)
      .filter((id): id is string => id != null);
    const tenantBrandIds = rowUniverseSeedProducts
      .map((r) => r.tenant_brand_id)
      .filter((id): id is string => id != null);
    const tenantCategoryIds = rowUniverseSeedProducts
      .map((r) => r.tenant_category_id ?? null)
      .filter((id): id is string => id != null);

    let masterProducts: Record<
      string,
      {
        id: string;
        name: string;
        master_sku: string;
        category_name: string | null;
        image_urls: string[] | null;
        brand_id: string;
        brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
      }
    > = {};
    let tenantBrands: Record<string, { id: string; display_name_override: string | null; master_brand_id: string | null }> = {};
    let tenantCategories: Record<string, { id: string; name: string | null }> = {};
    let masterBrands: Record<string, { id: string; name: string }> = {};
    let activeBrandRows: Array<{ id: string; display_name_override: string | null; master_brand_id: string | null }> = [];
    let activeCategoryRows: Array<{ id: string; name: string | null; is_active?: boolean | null }> = [];

    if (masterProductIds.length > 0) {
      type CatalogProductRow = {
        id: string;
        name: string;
        master_sku: string;
        image_urls: string[] | null;
        categories: { name: string } | null;
        brand_id: string;
        brands: { id: string; name: string; slug: string; logo_url: string | null } | null;
      };

      const catalogProductsRes = await fetchRowsInChunks<CatalogProductRow>(
        masterProductIds,
        async (productChunk) =>
          db
            .schema('catalog')
            .from('products')
            .select('id, name, master_sku, image_urls, category_id, categories(name), brand_id, brands!inner(id, name, slug, logo_url)')
            .in('id', productChunk),
      );

      if (catalogProductsRes.error) {
        console.error('[GET /api/tenant/products] catalog products error:', catalogProductsRes.error);
        return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
      }

      masterProducts = Object.fromEntries(
        (catalogProductsRes.data ?? []).map((p) => [p.id, { ...p, category_name: p.categories?.name ?? null }]),
      );
    }

    if (tenantBrandIds.length > 0) {
      type TenantBrandLookupRow = {
        id: string;
        display_name_override: string | null;
        master_brand_id: string | null;
      };

      const tenantBrandsRes = await fetchRowsInChunks<TenantBrandLookupRow>(
        tenantBrandIds,
        async (brandChunk) =>
          db
            .schema('app')
            .from('tenant_brands')
            .select('id, display_name_override, master_brand_id, deleted_at')
            .in('id', brandChunk)
            .is('deleted_at', null),
      );

      if (tenantBrandsRes.error) {
        console.error('[GET /api/tenant/products] tenant brands error:', tenantBrandsRes.error);
        return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
      }

      tenantBrands = Object.fromEntries((tenantBrandsRes.data ?? []).map((row) => [row.id, row]));

      const masterBrandIds = (tenantBrandsRes.data ?? [])
        .map((row) => row.master_brand_id)
        .filter((id): id is string => id != null);
      if (masterBrandIds.length > 0) {
        type MasterBrandLookupRow = { id: string; name: string };

        const masterBrandsRes = await fetchRowsInChunks<MasterBrandLookupRow>(
          masterBrandIds,
          async (brandChunk) =>
            db
              .schema('catalog')
              .from('brands')
              .select('id, name, deleted_at')
              .in('id', brandChunk)
              .is('deleted_at', null),
        );

        if (masterBrandsRes.error) {
          console.error('[GET /api/tenant/products] master brands error:', masterBrandsRes.error);
          return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
        }

        masterBrands = Object.fromEntries((masterBrandsRes.data ?? []).map((row) => [row.id, row]));
      }
    }

    if (tenantCategoryIds.length > 0) {
      type TenantCategoryLookupRow = { id: string; name: string | null };

      const tenantCategoryRes = await fetchRowsInChunks<TenantCategoryLookupRow>(
        tenantCategoryIds,
        async (categoryChunk) =>
          db
            .schema('app')
            .from('tenant_categories')
            .select('id, name')
            .in('id', categoryChunk)
            .is('deleted_at', null),
      );

      if (tenantCategoryRes.error) {
        console.error('[GET /api/tenant/products] tenant categories error:', tenantCategoryRes.error);
        return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
      }

      tenantCategories = Object.fromEntries((tenantCategoryRes.data ?? []).map((row) => [row.id, row]));
    }

    const [{ data: activeBrandsData }, { data: activeCategoriesData }] = await Promise.all([
      db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override, master_brand_id')
        .eq('tenant_id', claims.tenant_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      db
        .schema('app')
        .from('tenant_categories')
        .select('id, name, is_active')
        .eq('tenant_id', claims.tenant_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
    ]);

    const scopedBrandIds = new Set(
      summaryProducts
        .filter((row) => row.is_active)
        .map((row) => row.tenant_brand_id)
        .filter((value): value is string => Boolean(value)),
    );
    const scopedCategoryIds = new Set(
      summaryProducts
        .filter((row) => row.is_active)
        .map((row) => row.tenant_category_id ?? null)
        .filter((value): value is string => Boolean(value)),
    );

    activeBrandRows = ((activeBrandsData ?? []) as Array<{ id: string; display_name_override: string | null; master_brand_id: string | null }>)
      .filter((row) => !isAssistant || scopedBrandIds.has(row.id));
    activeCategoryRows = ((activeCategoriesData ?? []) as Array<{ id: string; name: string | null; is_active?: boolean | null }>)
      .filter((row) => row.is_active !== false)
      .filter((row) => scopedCategoryIds.has(row.id))
      .filter((row) => !isAssistant || scopedCategoryIds.has(row.id));

    const activeMasterBrandIds = Array.from(
      new Set(
        activeBrandRows
          .map((row) => row.master_brand_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ).filter((brandId) => !masterBrands[brandId]);

    if (activeMasterBrandIds.length > 0) {
      const activeMasterBrandsRes = await fetchRowsInChunks<{ id: string; name: string }>(
        activeMasterBrandIds,
        async (brandChunk) =>
          db
            .schema('catalog')
            .from('brands')
            .select('id, name')
            .in('id', brandChunk)
            .is('deleted_at', null),
      );

      if (activeMasterBrandsRes.error) {
        console.error('[GET /api/tenant/products] active master brands error:', activeMasterBrandsRes.error);
        return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
      }

      Object.assign(
        masterBrands,
        Object.fromEntries((activeMasterBrandsRes.data ?? []).map((row) => [row.id, row])),
      );
    }

    const inventoryByProduct = new Map<string, number>();
    const units30dByProduct = new Map<string, number>();
    const unitsMtdByProduct = new Map<string, number>();
    const gmvMtdByProduct = new Map<string, number>();
    const gmvPrevByProduct = new Map<string, number>();

    const currentStartDay = period.current_start.slice(0, 10);
    const currentEndDay = period.current_end_exclusive.slice(0, 10);
    const previousStartDay = period.previous_start.slice(0, 10);
    const previousEndDay = period.previous_end_exclusive.slice(0, 10);

    const velocityStartDay = getIstDayDaysAgo(29);
    const velocityEndExclusiveDay = getIstDayDaysAgo(-1);

    const [
      summaryInventoryRes,
      mtdKpiRes,
      prevKpiRes,
      recentInvoicesRes,
    ] = await Promise.all([
      !isAssistant
        ? loadTenantInventoryForTenant(db, claims.tenant_id)
        : Promise.resolve({ data: [] as InventoryMetricRow[], error: null }),
      !isAssistant
        ? db
            .schema('app')
            .from('kpi_product_daily')
            .select('tenant_product_id, units_sold, revenue')
            .eq('tenant_id', claims.tenant_id)
            .gte('day', currentStartDay)
            .lt('day', currentEndDay)
        : Promise.resolve({ data: [] as ProductMetricRow[], error: null }),
      !isAssistant
        ? db
            .schema('app')
            .from('kpi_product_daily')
            .select('tenant_product_id, revenue')
            .eq('tenant_id', claims.tenant_id)
            .gte('day', previousStartDay)
            .lt('day', previousEndDay)
        : Promise.resolve({ data: [] as ProductMetricRow[], error: null }),
      isAssistant
        ? (
            assistantLocationIds.length > 0
              ? db
                  .schema('app')
                  .from('invoices')
                  .select('id, status')
                  .eq('tenant_id', claims.tenant_id)
                  .in('location_id', assistantLocationIds)
                  .gte('invoice_date', velocityStartDay)
                  .lt('invoice_date', velocityEndExclusiveDay)
                  .is('deleted_at', null)
              : Promise.resolve({ data: [] as InvoiceMetricRow[], error: null })
          )
        : db
            .schema('app')
            .from('invoices')
            .select('id, status')
            .eq('tenant_id', claims.tenant_id)
            .gte('invoice_date', velocityStartDay)
            .lt('invoice_date', velocityEndExclusiveDay)
            .is('deleted_at', null),
    ]);

    if (summaryInventoryRes.error || mtdKpiRes.error || prevKpiRes.error || recentInvoicesRes.error) {
      console.error('[GET /api/tenant/products] metric query failure', summaryInventoryRes.error || mtdKpiRes.error || prevKpiRes.error || recentInvoicesRes.error);
      return timedJson({ error: 'Failed to fetch product metrics' }, { status: 500 });
    }

    const inventoryMetricRows = isAssistant
      ? scopedInventoryRows.filter((row) => summaryProductIdSet.has(row.tenant_product_id))
      : ((summaryInventoryRes.data ?? []) as InventoryMetricRow[]);

    for (const row of inventoryMetricRows) {
      const qty = metricNumber(row.qty_available);
      inventoryByProduct.set(row.tenant_product_id, (inventoryByProduct.get(row.tenant_product_id) ?? 0) + qty);
    }

    for (const row of (mtdKpiRes.data ?? []) as ProductMetricRow[]) {
      if (!summaryProductIdSet.has(row.tenant_product_id)) continue;
      const units = metricNumber(row.units_sold);
      const revenue = metricNumber(row.revenue);
      unitsMtdByProduct.set(
        row.tenant_product_id,
        (unitsMtdByProduct.get(row.tenant_product_id) ?? 0) + units,
      );
      gmvMtdByProduct.set(
        row.tenant_product_id,
        (gmvMtdByProduct.get(row.tenant_product_id) ?? 0) + revenue,
      );
    }

    for (const row of (prevKpiRes.data ?? []) as ProductMetricRow[]) {
      if (!summaryProductIdSet.has(row.tenant_product_id)) continue;
      const revenue = metricNumber(row.revenue);
      gmvPrevByProduct.set(
        row.tenant_product_id,
        (gmvPrevByProduct.get(row.tenant_product_id) ?? 0) + revenue,
      );
    }

    if (isAssistant) {
      const [currentOrdersRes, prevOrdersRes] = await Promise.all([
        assistantLocationIds.length > 0
          ? db
              .schema('app')
              .from('orders')
              .select('id, status')
              .eq('tenant_id', claims.tenant_id)
              .in('location_id', assistantLocationIds)
              .gte('order_date', period.current_start)
              .lt('order_date', period.current_end_exclusive)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as OrderMetricRow[], error: null }),
        assistantLocationIds.length > 0
          ? db
              .schema('app')
              .from('orders')
              .select('id, status')
              .eq('tenant_id', claims.tenant_id)
              .in('location_id', assistantLocationIds)
              .gte('order_date', period.previous_start)
              .lt('order_date', period.previous_end_exclusive)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as OrderMetricRow[], error: null }),
      ]);

      if (currentOrdersRes.error || prevOrdersRes.error) {
        console.error('[GET /api/tenant/products] assistant order scope failure', currentOrdersRes.error || prevOrdersRes.error);
        return timedJson({ error: 'Failed to fetch product metrics' }, { status: 500 });
      }

      const currentOrderIds = ((currentOrdersRes.data ?? []) as OrderMetricRow[])
        .filter((row) => isOperationalOrderStatus(row.status))
        .map((row) => row.id);
      const previousOrderIds = ((prevOrdersRes.data ?? []) as OrderMetricRow[])
        .filter((row) => isOperationalOrderStatus(row.status))
        .map((row) => row.id);

      const [currentItemsRes, previousItemsRes] = await Promise.all([
        currentOrderIds.length > 0
          ? fetchRowsInChunks<OrderItemMetricRow>(currentOrderIds, async (orderChunk) =>
              db
                .schema('app')
                .from('order_items')
                .select('order_id, tenant_product_id, qty, line_total, unit_price')
                .in('order_id', orderChunk)
                .is('deleted_at', null),
            )
          : Promise.resolve({ data: [] as OrderItemMetricRow[], error: null }),
        previousOrderIds.length > 0
          ? fetchRowsInChunks<OrderItemMetricRow>(previousOrderIds, async (orderChunk) =>
              db
                .schema('app')
                .from('order_items')
                .select('order_id, tenant_product_id, qty, line_total, unit_price')
                .in('order_id', orderChunk)
                .is('deleted_at', null),
            )
          : Promise.resolve({ data: [] as OrderItemMetricRow[], error: null }),
      ]);

      if (currentItemsRes.error || previousItemsRes.error) {
        console.error('[GET /api/tenant/products] assistant order-item scope failure', currentItemsRes.error || previousItemsRes.error);
        return timedJson({ error: 'Failed to fetch product metrics' }, { status: 500 });
      }

      for (const row of (currentItemsRes.data ?? []) as OrderItemMetricRow[]) {
        if (!summaryProductIdSet.has(row.tenant_product_id)) continue;
        const units = metricNumber(row.qty);
        const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
        unitsMtdByProduct.set(row.tenant_product_id, (unitsMtdByProduct.get(row.tenant_product_id) ?? 0) + units);
        gmvMtdByProduct.set(row.tenant_product_id, (gmvMtdByProduct.get(row.tenant_product_id) ?? 0) + revenue);
      }

      for (const row of (previousItemsRes.data ?? []) as OrderItemMetricRow[]) {
        if (!summaryProductIdSet.has(row.tenant_product_id)) continue;
        const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
        gmvPrevByProduct.set(row.tenant_product_id, (gmvPrevByProduct.get(row.tenant_product_id) ?? 0) + revenue);
      }
    }

    const recentInvoiceIds = ((recentInvoicesRes.data ?? []) as InvoiceMetricRow[])
      .filter((row) => !['draft', 'void', 'cancelled', 'rejected', 'archived'].includes((row.status ?? '').toLowerCase()))
      .map((row) => row.id);

    if (recentInvoiceIds.length > 0) {
      const recentInvoiceItemsRes = await fetchRowsInChunks<InvoiceItemMetricRow>(
        recentInvoiceIds,
        async (invoiceChunk) =>
          db
            .schema('app')
            .from('invoice_items')
            .select('invoice_id, tenant_product_id, qty')
            .in('invoice_id', invoiceChunk)
            .is('deleted_at', null),
      );

      if (recentInvoiceItemsRes.error) {
        console.error('[GET /api/tenant/products] invoice velocity query failure', recentInvoiceItemsRes.error);
        return timedJson({ error: 'Failed to fetch invoice velocity' }, { status: 500 });
      }

      for (const row of recentInvoiceItemsRes.data ?? []) {
        if (!summaryProductIdSet.has(row.tenant_product_id)) continue;
        units30dByProduct.set(
          row.tenant_product_id,
          (units30dByProduct.get(row.tenant_product_id) ?? 0) + metricNumber(row.qty),
        );
      }
    }

    const role = claims.role;
    const activeBrandNameById = new Map(
      activeBrandRows.map((row) => [
        row.id,
        row.display_name_override ?? (row.master_brand_id ? masterBrands[row.master_brand_id]?.name ?? null : null),
      ]),
    );

    const summarizeProduct = (
      row: {
        id: string;
        tenant_brand_id: string | null;
        master_product_id: string | null;
        internal_sku: string;
        name_override: string | null;
      },
    ) => {
      const onHand = Math.max(0, Math.round(inventoryByProduct.get(row.id) ?? 0));
      const unitsMtd = Math.max(0, Math.round(unitsMtdByProduct.get(row.id) ?? 0));
      const gmvMtd = metricNumber(gmvMtdByProduct.get(row.id));
      const gmvPrev = metricNumber(gmvPrevByProduct.get(row.id));
      const trailingInvoiceVelocity = metricNumber(units30dByProduct.get(row.id)) / 30;
      const daysCover = onHand === 0 ? 0 : trailingInvoiceVelocity > 0 ? Math.max(0, Math.round(onHand / trailingInvoiceVelocity)) : null;
      const growthPct = gmvPrev > 0 ? Math.round(((gmvMtd - gmvPrev) / gmvPrev) * 100) : gmvMtd > 0 ? 100 : 0;
      const statusTone = onHand === 0
        ? 'danger'
        : daysCover != null && daysCover < 14
          ? 'warning'
          : daysCover == null
            ? 'neutral'
            : 'success';
      const statusLabel = onHand === 0
        ? 'Out of stock'
        : daysCover != null && daysCover < 14
          ? 'Low stock'
          : daysCover == null
            ? 'Insufficient velocity'
            : 'On pace';

      return {
        onHand,
        unitsMtd,
        gmvMtd,
        gmvPrev,
        daysCover,
        growthPct,
        statusTone,
        statusLabel,
        brandName: row.tenant_brand_id ? activeBrandNameById.get(row.tenant_brand_id) ?? null : null,
      };
    };

    const summaryMetricsByProductId = new Map(
      summaryProducts.map((row) => [row.id, summarizeProduct(row)]),
    );

    const brandOptions = Array.from(
      new Set(
        activeBrandRows
          .map((row) => {
            if (row.display_name_override) return row.display_name_override;
            return row.master_brand_id ? masterBrands[row.master_brand_id]?.name ?? null : null;
          })
          .filter(Boolean) as string[],
      ),
    ).sort();
    const categoryOptions = activeCategoryRows.map((row) => row.name).filter(Boolean).sort() as string[];
    const statusOptions = ['Active', 'Inactive'];
    const matchesRowFilters = (row: { brand_name?: string | null; category_name?: string | null; is_active?: boolean; on_hand?: number; days_cover?: number | null }) => {
      const brandMatch = brandParams.length === 0 || (row.brand_name ? brandParams.includes(row.brand_name) : false);
      const categoryMatch = categoryParams.length === 0 || (row.category_name ? categoryParams.includes(row.category_name) : false);
      const statusMatch =
        statusParams.length === 0 ||
        statusParams.some((value) => {
          if (value === 'Active') return row.is_active === true;
          if (value === 'Inactive') return row.is_active === false;
          return false;
        });
      const stockMatch =
        stockParams.length === 0 ||
        stockParams.some((value) => {
          const onHand = Number(row.on_hand ?? 0);
          const daysCover = row.days_cover ?? null;
          if (value === 'Out of stock') return onHand === 0;
          if (value === 'Low stock') return onHand > 0 && daysCover != null && daysCover < 14;
          if (value === 'In stock') return onHand > 0 && (daysCover == null || daysCover >= 14);
          return false;
        });
      return brandMatch && categoryMatch && statusMatch && stockMatch;
    };

    const summaryUniverse = summaryProducts.map((row, index) => {
      const metrics = summaryMetricsByProductId.get(row.id) ?? summarizeProduct(row);
      return {
        id: row.id,
        display_name: row.name_override ?? row.internal_sku,
        brand_name: metrics.brandName,
        on_hand: metrics.onHand,
        days_cover: metrics.daysCover,
        units_mtd: metrics.unitsMtd,
        gmv_mtd: metrics.gmvMtd,
        growth_pct: metrics.growthPct,
        status_label: metrics.statusLabel,
        status_tone: metrics.statusTone as 'success' | 'warning' | 'danger' | 'neutral',
        read_index: index,
      };
    });

    const filteredRowUniverse = rowUniverseSeedProducts
      .map((row) => {
        const master = row.master_product_id ? masterProducts[row.master_product_id] : null;
        const tenantBrand = row.tenant_brand_id ? tenantBrands[row.tenant_brand_id] : null;
        const tenantCategory = row.tenant_category_id ? tenantCategories[row.tenant_category_id] : null;
        const masterBrand = tenantBrand?.master_brand_id ? masterBrands[tenantBrand.master_brand_id] : null;
        const metrics = summaryMetricsByProductId.get(row.id) ?? summarizeProduct(row);
        return {
          id: row.id,
          created_at: row.created_at,
          brand_name:
            tenantBrand?.display_name_override ??
            masterBrand?.name ??
            master?.brands?.name ??
            metrics.brandName ??
            null,
          category_name: tenantCategory?.name ?? master?.category_name ?? 'Uncategorized',
          is_active: row.is_active,
          on_hand: metrics.onHand,
          days_cover: metrics.daysCover,
        };
      })
      .filter(matchesRowFilters);

    const parsedCursor = cursorParam
      ? (JSON.parse(Buffer.from(cursorParam, 'base64url').toString()) as { t: string; i: string })
      : null;
    const visibleRowUniverse = parsedCursor
      ? filteredRowUniverse.filter(
          (row) =>
            row.created_at < parsedCursor.t ||
            (row.created_at === parsedCursor.t && row.id < parsedCursor.i),
        )
      : filteredRowUniverse;
    const pageRowUniverse = visibleRowUniverse.slice(0, reqLimit);
    const nextCursor =
      visibleRowUniverse.length > reqLimit && pageRowUniverse.length > 0
        ? Buffer.from(
            JSON.stringify({
              t: pageRowUniverse[pageRowUniverse.length - 1]?.created_at,
              i: pageRowUniverse[pageRowUniverse.length - 1]?.id,
            }),
          ).toString('base64url')
        : null;

    const pageProductIds = pageRowUniverse.map((row) => row.id);
    const pageProductIdSet = new Set(pageProductIds);
    let pageProducts: ProductRowDetail[] = [];
    const pageInventoryByProduct = new Map<string, number>();
    const pageUnits30dByProduct = new Map<string, number>();
    const pageUnitsMtdByProduct = new Map<string, number>();
    const pageGmvMtdByProduct = new Map<string, number>();
    const pageGmvPrevByProduct = new Map<string, number>();

    if (pageProductIds.length > 0) {
      const [pageProductsRes, pageInventoryRes, pageCurrentKpiRes, pagePrevKpiRes] = await Promise.all([
        db
          .schema('app')
          .from('tenant_products')
          .select(`
            id,
            tenant_id,
            tenant_brand_id,
            tenant_category_id,
            master_product_id,
            internal_sku,
            name_override,
            mrp,
            base_selling_price,
            cost_price,
            default_uom,
            pack_size,
            image_urls,
            is_active,
            external_ref,
            created_at,
            updated_at
          `)
          .eq('tenant_id', claims.tenant_id)
          .in('id', pageProductIds)
          .is('deleted_at', null),
        isAssistant
          ? Promise.resolve({
              data: scopedInventoryRows.filter((row) => pageProductIdSet.has(row.tenant_product_id)),
              error: null,
            })
          : db
              .schema('app')
              .from('tenant_inventory')
              .select('tenant_product_id, qty_available')
              .in('tenant_product_id', pageProductIds)
              .is('deleted_at', null),
        !isAssistant
          ? db
              .schema('app')
              .from('kpi_product_daily')
              .select('tenant_product_id, units_sold, revenue')
              .eq('tenant_id', claims.tenant_id)
              .in('tenant_product_id', pageProductIds)
              .gte('day', currentStartDay)
              .lt('day', currentEndDay)
          : Promise.resolve({ data: [] as ProductMetricRow[], error: null }),
        !isAssistant
          ? db
              .schema('app')
              .from('kpi_product_daily')
              .select('tenant_product_id, revenue')
              .eq('tenant_id', claims.tenant_id)
              .in('tenant_product_id', pageProductIds)
              .gte('day', previousStartDay)
              .lt('day', previousEndDay)
          : Promise.resolve({ data: [] as ProductMetricRow[], error: null }),
      ]);

      if (pageProductsRes.error || pageInventoryRes.error || pageCurrentKpiRes.error || pagePrevKpiRes.error) {
        const error = pageProductsRes.error || pageInventoryRes.error || pageCurrentKpiRes.error || pagePrevKpiRes.error;
        console.error('[GET /api/tenant/products] page detail error:', error?.code, error?.message);
        return timedJson({ error: 'Failed to fetch products' }, { status: 500 });
      }

      const pageProductsById = new Map(
        ((pageProductsRes.data ?? []) as ProductRowDetail[]).map((row) => [row.id, row]),
      );
      pageProducts = pageProductIds
        .map((id) => pageProductsById.get(id))
        .filter((row): row is ProductRowDetail => Boolean(row));

      for (const row of (pageInventoryRes.data ?? []) as InventoryMetricRow[]) {
        const qty = metricNumber(row.qty_available);
        pageInventoryByProduct.set(row.tenant_product_id, (pageInventoryByProduct.get(row.tenant_product_id) ?? 0) + qty);
      }

      for (const row of (pageCurrentKpiRes.data ?? []) as ProductMetricRow[]) {
        const units = metricNumber(row.units_sold);
        const revenue = metricNumber(row.revenue);
        pageUnitsMtdByProduct.set(row.tenant_product_id, (pageUnitsMtdByProduct.get(row.tenant_product_id) ?? 0) + units);
        pageGmvMtdByProduct.set(row.tenant_product_id, (pageGmvMtdByProduct.get(row.tenant_product_id) ?? 0) + revenue);
      }

      for (const row of (pagePrevKpiRes.data ?? []) as ProductMetricRow[]) {
        const revenue = metricNumber(row.revenue);
        pageGmvPrevByProduct.set(row.tenant_product_id, (pageGmvPrevByProduct.get(row.tenant_product_id) ?? 0) + revenue);
      }

      if (isAssistant) {
        const [pageCurrentOrdersRes, pagePrevOrdersRes] = await Promise.all([
          assistantLocationIds.length > 0
            ? db
                .schema('app')
                .from('orders')
                .select('id, status')
                .eq('tenant_id', claims.tenant_id)
                .in('location_id', assistantLocationIds)
                .gte('order_date', period.current_start)
                .lt('order_date', period.current_end_exclusive)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] as OrderMetricRow[], error: null }),
          assistantLocationIds.length > 0
            ? db
                .schema('app')
                .from('orders')
                .select('id, status')
                .eq('tenant_id', claims.tenant_id)
                .in('location_id', assistantLocationIds)
                .gte('order_date', period.previous_start)
                .lt('order_date', period.previous_end_exclusive)
                .is('deleted_at', null)
            : Promise.resolve({ data: [] as OrderMetricRow[], error: null }),
        ]);

        if (pageCurrentOrdersRes.error || pagePrevOrdersRes.error) {
          console.error('[GET /api/tenant/products] assistant page order scope failure', pageCurrentOrdersRes.error || pagePrevOrdersRes.error);
          return timedJson({ error: 'Failed to fetch product metrics' }, { status: 500 });
        }

        const pageCurrentOrderIds = ((pageCurrentOrdersRes.data ?? []) as OrderMetricRow[])
          .filter((row) => isOperationalOrderStatus(row.status))
          .map((row) => row.id);
        const pagePreviousOrderIds = ((pagePrevOrdersRes.data ?? []) as OrderMetricRow[])
          .filter((row) => isOperationalOrderStatus(row.status))
          .map((row) => row.id);

        const [pageCurrentItemsRes, pagePreviousItemsRes] = await Promise.all([
          pageCurrentOrderIds.length > 0
            ? fetchRowsInChunks<OrderItemMetricRow>(pageCurrentOrderIds, async (orderChunk) =>
                db
                  .schema('app')
                  .from('order_items')
                  .select('order_id, tenant_product_id, qty, line_total, unit_price')
                  .in('order_id', orderChunk)
                  .in('tenant_product_id', pageProductIds)
                  .is('deleted_at', null),
              )
            : Promise.resolve({ data: [] as OrderItemMetricRow[], error: null }),
          pagePreviousOrderIds.length > 0
            ? fetchRowsInChunks<OrderItemMetricRow>(pagePreviousOrderIds, async (orderChunk) =>
                db
                  .schema('app')
                  .from('order_items')
                  .select('order_id, tenant_product_id, qty, line_total, unit_price')
                  .in('order_id', orderChunk)
                  .in('tenant_product_id', pageProductIds)
                  .is('deleted_at', null),
              )
            : Promise.resolve({ data: [] as OrderItemMetricRow[], error: null }),
        ]);

        if (pageCurrentItemsRes.error || pagePreviousItemsRes.error) {
          console.error('[GET /api/tenant/products] assistant page order-item scope failure', pageCurrentItemsRes.error || pagePreviousItemsRes.error);
          return timedJson({ error: 'Failed to fetch product metrics' }, { status: 500 });
        }

        for (const row of (pageCurrentItemsRes.data ?? []) as OrderItemMetricRow[]) {
          const units = metricNumber(row.qty);
          const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
          pageUnitsMtdByProduct.set(row.tenant_product_id, (pageUnitsMtdByProduct.get(row.tenant_product_id) ?? 0) + units);
          pageGmvMtdByProduct.set(row.tenant_product_id, (pageGmvMtdByProduct.get(row.tenant_product_id) ?? 0) + revenue);
        }

        for (const row of (pagePreviousItemsRes.data ?? []) as OrderItemMetricRow[]) {
          const revenue = row.line_total != null ? metricNumber(row.line_total) : metricNumber(row.qty) * metricNumber(row.unit_price);
          pageGmvPrevByProduct.set(row.tenant_product_id, (pageGmvPrevByProduct.get(row.tenant_product_id) ?? 0) + revenue);
        }
      }

      const pageVelocityInvoicesQuery = isAssistant
        ? (
            assistantLocationIds.length > 0
              ? db
                  .schema('app')
                  .from('invoices')
                  .select('id, status')
                  .eq('tenant_id', claims.tenant_id)
                  .in('location_id', assistantLocationIds)
                  .gte('invoice_date', velocityStartDay)
                  .lt('invoice_date', velocityEndExclusiveDay)
                  .is('deleted_at', null)
              : Promise.resolve({ data: [] as InvoiceMetricRow[], error: null })
          )
        : db
            .schema('app')
            .from('invoices')
            .select('id, status')
            .eq('tenant_id', claims.tenant_id)
            .gte('invoice_date', velocityStartDay)
            .lt('invoice_date', velocityEndExclusiveDay)
            .is('deleted_at', null);

      const pageVelocityInvoices = await pageVelocityInvoicesQuery;

      if (pageVelocityInvoices.error) {
        console.error('[GET /api/tenant/products] page invoice velocity query failure', pageVelocityInvoices.error);
        return timedJson({ error: 'Failed to fetch invoice velocity' }, { status: 500 });
      }

      const pageRecentInvoiceIds = ((pageVelocityInvoices.data ?? []) as InvoiceMetricRow[])
        .filter((row) => !['draft', 'void', 'cancelled', 'rejected', 'archived'].includes((row.status ?? '').toLowerCase()))
        .map((row) => row.id);

      if (pageRecentInvoiceIds.length > 0) {
        const pageInvoiceItemsRes = await fetchRowsInChunks<InvoiceItemMetricRow>(
          pageRecentInvoiceIds,
          async (invoiceChunk) =>
            db
              .schema('app')
              .from('invoice_items')
              .select('invoice_id, tenant_product_id, qty')
              .in('invoice_id', invoiceChunk)
              .in('tenant_product_id', pageProductIds)
              .is('deleted_at', null),
        );

        if (pageInvoiceItemsRes.error) {
          console.error('[GET /api/tenant/products] page invoice-item velocity query failure', pageInvoiceItemsRes.error);
          return timedJson({ error: 'Failed to fetch invoice velocity' }, { status: 500 });
        }

        for (const row of pageInvoiceItemsRes.data ?? []) {
          pageUnits30dByProduct.set(
            row.tenant_product_id,
            (pageUnits30dByProduct.get(row.tenant_product_id) ?? 0) + metricNumber(row.qty),
          );
        }
      }
    }

    const summarizePageProduct = (
      row: {
        id: string;
        tenant_brand_id: string | null;
        master_product_id: string | null;
        internal_sku: string;
        name_override: string | null;
      },
    ) => {
      const onHand = Math.max(0, Math.round(pageInventoryByProduct.get(row.id) ?? 0));
      const unitsMtd = Math.max(0, Math.round(pageUnitsMtdByProduct.get(row.id) ?? 0));
      const gmvMtd = metricNumber(pageGmvMtdByProduct.get(row.id));
      const gmvPrev = metricNumber(pageGmvPrevByProduct.get(row.id));
      const trailingInvoiceVelocity = metricNumber(pageUnits30dByProduct.get(row.id)) / 30;
      const daysCover = onHand === 0 ? 0 : trailingInvoiceVelocity > 0 ? Math.max(0, Math.round(onHand / trailingInvoiceVelocity)) : null;
      const growthPct = gmvPrev > 0 ? Math.round(((gmvMtd - gmvPrev) / gmvPrev) * 100) : gmvMtd > 0 ? 100 : 0;
      const statusTone = onHand === 0
        ? 'danger'
        : daysCover != null && daysCover < 14
          ? 'warning'
          : daysCover == null
            ? 'neutral'
            : 'success';
      const statusLabel = onHand === 0
        ? 'Out of stock'
        : daysCover != null && daysCover < 14
          ? 'Low stock'
          : daysCover == null
            ? 'Insufficient velocity'
            : 'On pace';

      return {
        onHand,
        unitsMtd,
        gmvMtd,
        gmvPrev,
        daysCover,
        growthPct,
        statusTone,
        statusLabel,
        brandName: row.tenant_brand_id ? activeBrandNameById.get(row.tenant_brand_id) ?? null : null,
      };
    };

    const products = pageProducts.map((row) => {
      const master = row.master_product_id ? masterProducts[row.master_product_id] : null;
      const tenantBrand = row.tenant_brand_id ? tenantBrands[row.tenant_brand_id] : null;
      const tenantCategory = row.tenant_category_id ? tenantCategories[row.tenant_category_id] : null;
      const masterBrand = tenantBrand?.master_brand_id ? masterBrands[tenantBrand.master_brand_id] : null;
      const metrics = summarizePageProduct(row);
      const brandName =
        tenantBrand?.display_name_override ??
        masterBrand?.name ??
        master?.brands?.name ??
        metrics.brandName ??
        null;
      const enriched = {
        ...row,
        image_urls: row.image_urls?.length ? row.image_urls : (master?.image_urls ?? null),
        master_product: master ?? null,
        display_name: row.name_override ?? master?.name ?? row.internal_sku,
        brand_name: brandName,
        category_name: tenantCategory?.name ?? master?.category_name ?? 'Uncategorized',
        on_hand: metrics.onHand,
        days_cover: metrics.daysCover,
        units_mtd: metrics.unitsMtd,
        gmv_mtd: metrics.gmvMtd,
        growth_pct: metrics.growthPct,
        status_label: metrics.statusLabel,
        status_tone: metrics.statusTone as 'success' | 'warning' | 'danger' | 'neutral',
      };

      if (role === 'seller_assistant') {
        const { cost_price: _stripped, ...rest } = enriched;
        void _stripped;
        return rest;
      }

      return enriched;
    });

    const revenueMtd = Array.from(gmvMtdByProduct.values()).reduce((sum, value) => sum + metricNumber(value), 0);
    const revenuePrev = Array.from(gmvPrevByProduct.values()).reduce((sum, value) => sum + metricNumber(value), 0);
    const revenueGrowth = revenuePrev > 0 ? Math.round(((revenueMtd - revenuePrev) / revenuePrev) * 100) : revenueMtd > 0 ? 100 : 0;
    const unitsMtdTotal = Array.from(unitsMtdByProduct.values()).reduce((sum, value) => sum + metricNumber(value), 0);
    const activeCount = Number(isAssistant ? summaryProducts.filter((row) => row.is_active).length : (snapshotRow?.active_count ?? summaryProducts.filter((row) => row.is_active).length));
    const totalCount = Number(isAssistant ? summaryProducts.length : (snapshotRow?.total_count ?? summaryProducts.length));
    const archivedCount = Math.max(0, totalCount - activeCount);
    const outOfStock = summaryUniverse.filter((row) => row.on_hand === 0).length;
    const lowStock = Number(
      isAssistant
        ? summaryUniverse.filter((row) => row.on_hand > 0 && row.days_cover != null && row.days_cover < 14).length
        : (snapshotRow?.low_stock_count ?? summaryUniverse.filter((row) => row.on_hand > 0 && row.days_cover != null && row.days_cover < 14).length),
    );

    const attention = summaryUniverse
      .filter((row) => row.status_tone === 'danger' || row.status_tone === 'warning' || Number(row.growth_pct ?? 0) < 0)
      .slice(0, 3);
    const topPerformers = [...summaryUniverse]
      .sort((a, b) => Number(b.gmv_mtd ?? 0) - Number(a.gmv_mtd ?? 0))
      .slice(0, 2);
    const topRisers = [...summaryUniverse]
      .sort((a, b) => Number(b.growth_pct ?? 0) - Number(a.growth_pct ?? 0))
      .slice(0, 2);

    const toReadItem = (row: any, index: number) => ({
      id: row.id,
      name: row.display_name,
      brand: row.brand_name ?? 'Unknown brand',
      brand_initials: (row.brand_name ?? 'Unknown brand')
        .split(' ')
        .map((chunk: string) => chunk[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      brand_hue: (['teal', 'ember', 'cream'][index % 3] ?? 'cream') as 'teal' | 'ember' | 'cream',
      on_hand: Number(row.on_hand ?? 0),
      days_cover: row.days_cover == null ? null : Number(row.days_cover),
      growth_pct: Number(row.growth_pct ?? 0),
      units_mtd: Number(row.units_mtd ?? 0),
      gmv_mtd: Number(row.gmv_mtd ?? 0),
      status: {
        label: row.status_label ?? 'On pace',
        tone: row.status_tone ?? 'neutral',
      },
    });

    const filters: LandingFilterMeta = {
      groups: [
        { key: 'brand', label: 'Brand', options: brandOptions.map((value) => ({ value, label: value })) },
        { key: 'category', label: 'Category', options: categoryOptions.map((value) => ({ value, label: value })) },
        { key: 'status', label: 'Status', options: statusOptions.map((value) => ({ value, label: value })) },
        { key: 'stock', label: 'Stock', options: ['In stock', 'Low stock', 'Out of stock'].map((value) => ({ value, label: value })) },
      ],
    };
    return timedJson({
      period,
      products,
      brands: brandOptions,
      filters,
      nextCursor,
      total: filteredRowUniverse.length,
      kpis: {
        active_skus: activeCount,
        total_skus: totalCount,
        archived_skus: archivedCount,
        out_of_stock: outOfStock,
        low_stock: lowStock,
        units_mtd: unitsMtdTotal,
        revenue_mtd: revenueMtd,
        revenue_prev_mtd: revenuePrev,
        revenue_growth_pct: revenueGrowth,
      },
      todays_read: {
        needs_attention: attention.map(toReadItem),
        top_performers: topPerformers.map(toReadItem),
        top_risers: topRisers.map(toReadItem),
      },
    });
  } catch (err) {
    console.error('[GET /api/tenant/products] Unexpected error:', err);
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
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

    const body = await req.json();
    const parsed = AddProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      master_product_id,
      internal_sku,
      name,
      mrp,
      base_selling_price,
      cost_price,
      tenant_brand_id: providedTenantBrandId,
      name_override,
      default_uom,
      pack_size,
      hsn_code,
      gst_rate,
      description,
      tenant_category_id,
      attributes,
      image_urls,
    } = parsed.data;

    // For custom products (master_product_id = null), tenant_brand_id is required
    if (!master_product_id && !providedTenantBrandId) {
      return NextResponse.json(
        { error: 'tenant_brand_id is required for custom products' },
        { status: 400 }
      );
    }

    // seller_assistant cannot set cost_price
    const effectiveCostPrice =
      claims.role === 'seller_assistant' ? null : (cost_price ?? null);

    const tenantId = claims.tenant_id;
    const actorUserId = claims.sub ?? claims.tenant_id;

    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries

    // Check internal_sku uniqueness within tenant
    const { data: existing } = await db
      .schema('app')
      .from('tenant_products')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('internal_sku', internal_sku)
      .is('is_active', true)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This SKU already exists in your product list.' },
        { status: 409 }
      );
    }

    let resolvedTenantBrandId = providedTenantBrandId ?? null;
    let resolvedTenantCategoryId = tenant_category_id ?? null;

    if (master_product_id) {
      let importedLinks: Awaited<ReturnType<typeof resolveImportedProductTenantLinks>> = null;
      try {
        importedLinks = await resolveImportedProductTenantLinks(db, tenantId, actorUserId, master_product_id, {
          tenant_brand_id: resolvedTenantBrandId,
          tenant_category_id: resolvedTenantCategoryId,
        });
      } catch (resolutionError) {
        console.error('[POST /api/tenant/products] failed to resolve imported product links:', resolutionError);
        return NextResponse.json(
          { error: 'Failed to resolve imported brand/category links' },
          { status: 500 },
        );
      }

      if (importedLinks) {
        resolvedTenantBrandId = importedLinks.tenant_brand_id;
        resolvedTenantCategoryId = importedLinks.tenant_category_id;
      }
    }

    const { data: inserted, error: insertError } = await db
      .schema('app')
      .from('tenant_products')
      .insert({
        tenant_id: tenantId,
        tenant_brand_id: resolvedTenantBrandId,
        master_product_id: master_product_id ?? null,
        internal_sku,
        name_override: name_override?.trim() || name?.trim() || null,
        mrp,
        base_selling_price,
        cost_price: effectiveCostPrice,
        default_uom: default_uom ?? null,
        pack_size: pack_size ?? null,
        hsn_code: hsn_code ?? null,
        gst_rate: gst_rate ?? null,
        description: description ?? null,
        tenant_category_id: resolvedTenantCategoryId,
        attributes_override: attributes ?? {},
        image_urls: image_urls ?? [],
        is_active: true,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation (race condition on internal_sku)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'This SKU already exists in your product list.' },
          { status: 409 }
        );
      }
      console.error('[POST /api/tenant/products] DB error:', insertError.code, insertError.message);
      return NextResponse.json(
        { error: 'Failed to add product', code: insertError.code, detail: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ product: inserted }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tenant/products] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
