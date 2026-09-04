import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { createTimer } from '@/lib/server-timing';
import { resolveImportedProductTenantLinks } from '@/lib/server/tenant-product-source-resolution';
import { z } from 'zod';
import { PAGE_SIZE } from '@/lib/pagination';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming, parseRowsLimit } from '@/lib/server/bounded-get';
import { readArrayParam } from '@/lib/landing-filter-params';
import { getPostHogClient } from '@/lib/posthog-server';
import { searchScopedProducts } from '@/lib/server/scoped-product-search';
import { revalidatePublicCatalogCache } from '@/lib/server/public-catalog-cache';

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

type DbClient = {
  schema: (schemaName: string) => {
    from: (tableName: string) => any;
  };
};

type ProductSort =
  | 'invoice_value_desc'
  | 'invoice_value_asc'
  | 'invoice_units_desc'
  | 'order_value_desc'
  | 'estimate_value_desc'
  | 'stock_on_hand_asc';

type ProductFilterPreset = {
  sold_period?: string;
  not_sold_period?: string;
  stock?: 'out' | 'low' | 'available' | string;
  stock_lte?: number;
  stock_gt?: number;
  sort?: string;
};

type ProductCursor = {
  v: number;
  i: string;
};

type ProductIdentityRow = {
  id: string;
  tenant_id: string;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  master_product_id: string | null;
  internal_sku: string;
  name_override: string | null;
  mrp: number | string | null;
  base_selling_price: number | string | null;
  cost_price: number | string | null;
  default_uom: string | null;
  pack_size: number | string | null;
  hsn_code?: string | null;
  gst_rate?: number | string | null;
  description?: string | null;
  attributes_override?: Record<string, string> | null;
  image_urls: string[] | null;
  is_active: boolean;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
};

type ProductMetricRow = {
  tenant_product_id: string;
  invoice_units: number | string | null;
  invoice_value: number | string | null;
  invoice_count: number | string | null;
  invoice_buyer_count: number | string | null;
  estimate_units: number | string | null;
  estimate_value: number | string | null;
  estimate_count: number | string | null;
  order_units: number | string | null;
  order_value: number | string | null;
  order_count: number | string | null;
};

type BrandRow = { id: string; display_name_override: string | null; master_brand_id: string | null; logo_url?: string | null };
type CategoryRow = { id: string; name: string | null };
type MasterProductRow = {
  id: string;
  name: string | null;
  master_sku: string | null;
  brand_id: string | null;
  category_id: string | null;
  gst_rate?: number | string | null;
  hsn_code?: string | null;
  default_uom?: string | null;
  pack_size?: number | string | null;
  description?: string | null;
  image_urls?: string[] | null;
};
type MasterBrandRow = { id: string; name: string | null; logo_url?: string | null };

const PRODUCT_SCAN_LIMIT = 2000;
const PRODUCT_FILTER_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Dormant', label: 'Dormant' },
  { value: 'Inactive', label: 'Inactive' },
];
const STOCK_FILTER_OPTIONS = [
  { value: 'In stock', label: 'In stock' },
  { value: 'Low stock', label: 'Low stock' },
  { value: 'Out of stock', label: 'Out of stock' },
];

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseProductSort(value: string | null | undefined): ProductSort {
  if (
    value === 'invoice_value_asc' ||
    value === 'invoice_units_desc' ||
    value === 'order_value_desc' ||
    value === 'estimate_value_desc' ||
    value === 'stock_on_hand_asc'
  ) {
    return value;
  }
  return 'invoice_value_desc';
}

function parseProductPreset(raw: string | null): ProductFilterPreset | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ProductFilterPreset;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function decodeProductCursor(raw: string | null): ProductCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<ProductCursor>;
    if (typeof parsed.v !== 'number' || typeof parsed.i !== 'string') return null;
    return { v: parsed.v, i: parsed.i };
  } catch {
    return null;
  }
}

function encodeProductCursor(cursor: ProductCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function getQuarterPeriod(asOf = new Date()) {
  const month = asOf.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), quarterStartMonth, 1));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), quarterStartMonth + 3, 1));
  return {
    period_key: 'this_quarter',
    grain: 'quarter' as const,
    period_start: start.toISOString().slice(0, 10),
    period_end_exclusive: end.toISOString().slice(0, 10),
    label: 'This Quarter',
  };
}

function elapsedDaysInPeriod(periodStart: string, periodEndExclusive: string, asOf = new Date()): number {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEndExclusive}T00:00:00.000Z`);
  const cappedEnd = asOf < end ? asOf : end;
  return Math.max(1, Math.ceil((cappedEnd.getTime() - start.getTime()) / 86_400_000));
}

function normalizeSearch(value: string | null): string | null {
  const normalized = value?.replace(/[*(),]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function uniqueSortedOptions(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

async function fetchProductFilterLookups(db: DbClient, tenantId: string) {
  const [brandRes, categoryRes] = await Promise.all([
    db
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id, logo_url')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .limit(1000),
    db
      .schema('app')
      .from('tenant_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .limit(1000),
  ]);
  if (brandRes.error) throw brandRes.error;
  if (categoryRes.error) throw categoryRes.error;

  const brands = (brandRes.data ?? []) as BrandRow[];
  const masterIds = [...new Set(brands.map((row) => row.master_brand_id).filter((id): id is string => Boolean(id)))];
  const masterBrandById = new Map<string, MasterBrandRow>();
  if (masterIds.length > 0) {
    const masterRes = await db
      .schema('catalog')
      .from('brands')
      .select('id, name, logo_url')
      .in('id', masterIds)
      .is('deleted_at', null)
      .limit(masterIds.length);
    if (masterRes.error) throw masterRes.error;
    for (const row of (masterRes.data ?? []) as MasterBrandRow[]) masterBrandById.set(row.id, row);
  }

  const brandById = new Map<string, BrandRow & { name: string; logo_url: string | null }>();
  for (const row of brands) {
    const master = row.master_brand_id ? masterBrandById.get(row.master_brand_id) : null;
    brandById.set(row.id, {
      ...row,
      name: row.display_name_override?.trim() || master?.name?.trim() || 'Unknown brand',
      logo_url: row.logo_url ?? master?.logo_url ?? null,
    });
  }

  const categoryById = new Map<string, CategoryRow>();
  for (const row of (categoryRes.data ?? []) as CategoryRow[]) categoryById.set(row.id, row);
  return { brandById, categoryById };
}

async function fetchProductIdentities(db: DbClient, tenantId: string, searchIds: string[] | null): Promise<ProductIdentityRow[]> {
  let query = db
    .schema('app')
    .from('tenant_products')
    .select('id, tenant_id, tenant_brand_id, tenant_category_id, master_product_id, internal_sku, name_override, mrp, base_selling_price, cost_price, default_uom, pack_size, hsn_code, gst_rate, description, attributes_override, image_urls, is_active, external_ref, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(PRODUCT_SCAN_LIMIT);
  if (searchIds) {
    if (searchIds.length === 0) return [];
    query = query.in('id', searchIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductIdentityRow[];
}

/** Indexed candidate-id lookup for the free-text search box (search_vector/trigram-backed via search_products_scoped). */
async function resolveProductSearchIds(db: DbClient, tenantId: string, search: string | null): Promise<string[] | null> {
  if (!search) return null;
  const { rows } = await searchScopedProducts({
    db: db as any,
    tenantId,
    query: search,
    limit: PRODUCT_SCAN_LIMIT,
    sort: 'relevance',
  });
  return rows.map((row) => row.tenant_product_id);
}

async function fetchMasterProducts(db: DbClient, masterIds: string[]) {
  const map = new Map<string, MasterProductRow>();
  if (masterIds.length === 0) return map;
  const { data, error } = await db
    .schema('catalog')
    .from('products')
    .select('id, name, master_sku, brand_id, category_id, gst_rate, hsn_code, default_uom, pack_size, description, image_urls')
    .in('id', masterIds)
    .is('deleted_at', null)
    .limit(masterIds.length);
  if (error) throw error;
  for (const row of (data ?? []) as MasterProductRow[]) map.set(row.id, row);
  return map;
}

async function fetchProductMetrics(db: DbClient, tenantId: string, productIds: string[], period: ReturnType<typeof getQuarterPeriod>) {
  const map = new Map<string, ProductMetricRow>();
  if (productIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('metrics_product_period_summary')
    .select('tenant_product_id, invoice_units, invoice_value, invoice_count, invoice_buyer_count, estimate_units, estimate_value, estimate_count, order_units, order_value, order_count')
    .eq('tenant_id', tenantId)
    .eq('grain', period.grain)
    .eq('period_start', period.period_start)
    .is('deleted_at', null)
    .in('tenant_product_id', productIds)
    .limit(productIds.length);
  if (error) throw error;
  for (const row of (data ?? []) as ProductMetricRow[]) map.set(row.tenant_product_id, row);
  return map;
}

async function fetchInventoryByProduct(db: DbClient, productIds: string[]) {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;
  const { data, error } = await db
    .schema('app')
    .from('tenant_inventory')
    .select('tenant_product_id, qty_available')
    .in('tenant_product_id', productIds)
    .is('deleted_at', null)
    .limit(Math.max(productIds.length * 4, productIds.length));
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ tenant_product_id: string; qty_available: number | string | null }>) {
    map.set(row.tenant_product_id, (map.get(row.tenant_product_id) ?? 0) + toNumber(row.qty_available));
  }
  return map;
}

function sortValue(row: Record<string, unknown>, sort: ProductSort): number {
  if (sort === 'invoice_value_asc' || sort === 'invoice_value_desc') return toNumber(row.invoice_value as number);
  if (sort === 'invoice_units_desc') return toNumber(row.invoice_units as number);
  if (sort === 'order_value_desc') return toNumber(row.order_value as number);
  if (sort === 'estimate_value_desc') return toNumber(row.estimate_value as number);
  return toNumber(row.on_hand as number);
}

function compareProducts(a: Record<string, unknown>, b: Record<string, unknown>, sort: ProductSort): number {
  const av = sortValue(a, sort);
  const bv = sortValue(b, sort);
  if (sort === 'invoice_value_asc' || sort === 'stock_on_hand_asc') {
    if (av !== bv) return av - bv;
  } else if (av !== bv) {
    return bv - av;
  }
  return String(a.id).localeCompare(String(b.id));
}

function passesKeyset(row: Record<string, unknown>, sort: ProductSort, cursor: ProductCursor | null): boolean {
  if (!cursor) return true;
  const value = sortValue(row, sort);
  if (sort === 'invoice_value_asc' || sort === 'stock_on_hand_asc') {
    return value > cursor.v || (value === cursor.v && String(row.id) > cursor.i);
  }
  return value < cursor.v || (value === cursor.v && String(row.id) > cursor.i);
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

    const tenantId = claims.tenant_id;
    const db = supabaseAdmin as any; // supabase client typed generically for multi-schema queries
    const period = getQuarterPeriod();

    const reqLimit = parseRowsLimit(req.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER);
    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const search = normalizeSearch(req.nextUrl.searchParams.get('search'));
    const brandParams = readArrayParam(req.nextUrl.searchParams, 'brand');
    const categoryParams = readArrayParam(req.nextUrl.searchParams, 'category');
    const statusParams = readArrayParam(req.nextUrl.searchParams, 'status');
    const stockParams = readArrayParam(req.nextUrl.searchParams, 'stock');
    const preset = parseProductPreset(req.nextUrl.searchParams.get('filter_preset'));
    const sort = parseProductSort(preset?.sort ?? req.nextUrl.searchParams.get('sort'));
    const decodedCursor = decodeProductCursor(cursorParam);
    const periodDays = elapsedDaysInPeriod(period.period_start, period.period_end_exclusive);

    const [{ brandById, categoryById }, searchIds] = await Promise.all([
      fetchProductFilterLookups(db, tenantId),
      resolveProductSearchIds(db, tenantId, search),
    ]);
    const identities = await fetchProductIdentities(db, tenantId, searchIds);
    const masterIds = [...new Set(identities.map((row) => row.master_product_id).filter((id): id is string => Boolean(id)))];
    const productIds = identities.map((row) => row.id);
    const [masterById, metricsByProduct, inventoryByProduct] = await Promise.all([
      fetchMasterProducts(db, masterIds),
      fetchProductMetrics(db, tenantId, productIds, period),
      fetchInventoryByProduct(db, productIds),
    ]);

    const selectedStatus = new Set(statusParams);
    if (preset?.sold_period && !selectedStatus.has('Active')) selectedStatus.add('Active');
    if (preset?.not_sold_period && !selectedStatus.has('Dormant')) selectedStatus.add('Dormant');
    const selectedStock = new Set(stockParams);
    if (preset?.stock === 'out') selectedStock.add('Out of stock');
    if (preset?.stock === 'low' || typeof preset?.stock_lte === 'number') selectedStock.add('Low stock');
    if (typeof preset?.stock_gt === 'number') selectedStock.add('In stock');

    const hydrated = identities.map((row) => {
      const metric = metricsByProduct.get(row.id);
      const masterProduct = row.master_product_id ? masterById.get(row.master_product_id) ?? null : null;
      const brand = row.tenant_brand_id ? brandById.get(row.tenant_brand_id) ?? null : null;
      const category = row.tenant_category_id ? categoryById.get(row.tenant_category_id) ?? null : null;
      const invoiceUnits = toNumber(metric?.invoice_units);
      const invoiceValue = toNumber(metric?.invoice_value);
      const onHand = inventoryByProduct.get(row.id) ?? 0;
      const daysCover = invoiceUnits > 0 ? onHand / (invoiceUnits / periodDays) : null;
      const displayName = row.name_override?.trim() || masterProduct?.name?.trim() || row.internal_sku;

      return {
        ...row,
        mrp: row.mrp == null ? null : toNumber(row.mrp),
        base_selling_price: row.base_selling_price == null ? null : toNumber(row.base_selling_price),
        cost_price: row.cost_price == null ? null : toNumber(row.cost_price),
        pack_size: row.pack_size == null ? null : toNumber(row.pack_size),
        gst_rate: row.gst_rate == null ? null : toNumber(row.gst_rate),
        master_product: masterProduct ? {
          id: masterProduct.id,
          name: masterProduct.name ?? displayName,
          master_sku: masterProduct.master_sku ?? row.internal_sku,
          brand_id: masterProduct.brand_id ?? '',
          brand_name: brand?.name ?? null,
          brand_logo_url: brand?.logo_url ?? null,
          gst_rate: masterProduct.gst_rate == null ? null : toNumber(masterProduct.gst_rate),
          hsn_code: masterProduct.hsn_code ?? null,
          default_uom: masterProduct.default_uom ?? null,
          pack_size: masterProduct.pack_size == null ? null : toNumber(masterProduct.pack_size),
          description: masterProduct.description ?? null,
          image_urls: masterProduct.image_urls ?? null,
          category_name: category?.name ?? null,
        } : null,
        display_name: displayName,
        brand_name: brand?.name ?? null,
        category_name: category?.name ?? null,
        image_urls: row.image_urls?.length ? row.image_urls : masterProduct?.image_urls ?? null,
        on_hand: onHand,
        days_cover: daysCover,
        invoice_units: invoiceUnits,
        invoice_value: invoiceValue,
        invoice_count: toNumber(metric?.invoice_count),
        invoice_buyer_count: toNumber(metric?.invoice_buyer_count),
        estimate_units: toNumber(metric?.estimate_units),
        estimate_value: toNumber(metric?.estimate_value),
        estimate_count: toNumber(metric?.estimate_count),
        order_units: toNumber(metric?.order_units),
        order_value: toNumber(metric?.order_value),
        order_count: toNumber(metric?.order_count),
        units_mtd: invoiceUnits,
        gmv_mtd: invoiceValue,
      };
    });

    const filtered = hydrated.filter((product) => {
      const sold = Number(product.invoice_count) > 0 || Number(product.invoice_units) > 0;
      const statusMatch =
        selectedStatus.size === 0 ||
        [...selectedStatus].some((status) => {
          if (status === 'Active') return product.is_active && sold;
          if (status === 'Dormant') return product.is_active && !sold;
          if (status === 'Inactive') return !product.is_active;
          return false;
        });
      if (!statusMatch) return false;

      const stockMatch =
        selectedStock.size === 0 ||
        [...selectedStock].some((stock) => {
          const onHand = Number(product.on_hand ?? 0);
          const daysCover = product.days_cover ?? null;
          if (stock === 'Out of stock') return onHand === 0;
          if (stock === 'Low stock') return onHand > 0 && daysCover != null && daysCover <= 14;
          if (stock === 'In stock') return onHand > 0 && (daysCover == null || daysCover > 14);
          return false;
        });
      if (!stockMatch) return false;

      if (brandParams.length > 0 && (!product.brand_name || !brandParams.includes(product.brand_name))) return false;
      if (categoryParams.length > 0 && (!product.category_name || !categoryParams.includes(product.category_name))) return false;
      return true;
    }).sort((a, b) => compareProducts(a, b, sort));

    const afterCursor = filtered.filter((row) => passesKeyset(row, sort, decodedCursor));
    const pageRows = afterCursor.slice(0, reqLimit);
    const hasNext = afterCursor.length > reqLimit;
    const last = pageRows.at(-1);

    return timedJson({
      period,
      period_key: period.period_key,
      grain: period.grain,
      products: pageRows,
      total: filtered.length,
      limit: reqLimit,
      nextCursor: hasNext && last ? encodeProductCursor({ v: sortValue(last, sort), i: last.id }) : null,
      sort,
      filters: {
        groups: [
          { key: 'brand', label: 'Brand', options: uniqueSortedOptions(hydrated.map((row) => row.brand_name)) },
          { key: 'category', label: 'Category', options: uniqueSortedOptions(hydrated.map((row) => row.category_name)) },
          { key: 'status', label: 'Status', options: PRODUCT_FILTER_OPTIONS },
          { key: 'stock', label: 'Stock', options: STOCK_FILTER_OPTIONS },
        ],
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
    // Master-linked products/brands: copy gst_rate/hsn_code/image_urls (and,
    // via ensureTenantBrandForCatalogBrand, the brand's logo_url) from the
    // catalog master onto the tenant row now, when the seller didn't provide
    // one — so buyer-facing reads never need a live catalog.* join for these.
    let resolvedGstRate = gst_rate ?? null;
    let resolvedHsnCode = hsn_code ?? null;
    let resolvedImageUrls = image_urls ?? [];

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
        resolvedGstRate = resolvedGstRate ?? importedLinks.gst_rate;
        resolvedHsnCode = resolvedHsnCode ?? importedLinks.hsn_code;
        resolvedImageUrls = resolvedImageUrls.length > 0 ? resolvedImageUrls : (importedLinks.image_urls ?? []);
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
        hsn_code: resolvedHsnCode,
        gst_rate: resolvedGstRate,
        description: description ?? null,
        tenant_category_id: resolvedTenantCategoryId,
        attributes_override: attributes ?? {},
        image_urls: resolvedImageUrls,
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

    try {
      const ph = getPostHogClient();
      ph.capture({
        distinctId: claims.sub ?? claims.tenant_id,
        event: 'product_created',
        properties: {
          tenant_id: tenantId,
          seller_id: claims.sub,
          tenant_product_id: inserted.id,
          tenant_brand_id: resolvedTenantBrandId,
          tenant_category_id: resolvedTenantCategoryId,
          source_type: master_product_id ? 'master_catalog' : 'custom',
          has_image: (image_urls ?? []).length > 0,
          has_cost_price: effectiveCostPrice != null,
          gst_rate: gst_rate ?? null,
          role: claims.role,
        },
      });
      await ph.flush();
    } catch {
      // Analytics is non-blocking for product creation.
    }

    revalidatePublicCatalogCache(tenantId);
    return NextResponse.json({ product: inserted }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tenant/products] Unexpected error:', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
