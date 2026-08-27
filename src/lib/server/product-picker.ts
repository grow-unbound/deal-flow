import { PAGE_SIZE } from '@/lib/pagination';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';

type DbClient = {
  schema: (name: 'app' | 'catalog') => {
    from: (table: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

export type ProductPickerQuickFilter =
  | 'selling_oos'
  | 'selling_low_stock'
  | 'selling_qtr'
  | 'not_selling_qtr'
  | 'enquire_no_sales'
  | 'top20';

export type ProductPickerRow = {
  id: string;
  display_name: string;
  internal_sku: string | null;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  mrp: number;
  base_selling_price: number | null;
  cost_price: number | null;
  qty_available: number;
  invoice_value: number;
  invoice_units: number;
  invoice_count: number;
};

export type ProductPickerResultset = {
  products: ProductPickerRow[];
  total: number;
  nextCursor: string | null;
};

function parseOffsetCursor(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

/**
 * Shared product-picker resultset for the Price List and Campaign Add/Edit forms' product
 * search-overlay pickers. Backed by app.search_picker_products (v4 metrics only) --
 * deliberately NOT the same data path as PriceListComposer.tsx / CatalogComposer.tsx's
 * merchandising grids (those keep using search_products_scoped / get_catalog_composer_product_metrics,
 * out of scope here and not touched).
 */
export async function getProductPickerResultset(
  db: DbClient,
  tenantId: string,
  options: {
    q?: string;
    limit?: number;
    cursor?: string | null;
    ids?: string[];
    brandIds?: string[];
    categoryIds?: string[];
    stockBucket?: 'in_stock' | 'low_stock' | 'out_of_stock' | null;
    status?: 'active' | 'dormant' | 'inactive' | null;
    quickFilters?: ProductPickerQuickFilter[];
  } = {},
): Promise<ProductPickerResultset> {
  const quarterMeta = getSellerLandingPeriodMeta('quarter');
  const currentQuarterStart = quarterMeta.current_start.slice(0, 10);
  const previousQuarterStart = quarterMeta.previous_start.slice(0, 10);
  const ids = options.ids?.slice(0, 250);
  const limit = ids?.length
    ? ids.length
    : Math.max(1, Math.min(options.limit ?? PAGE_SIZE.COMPOSER, PAGE_SIZE.MAX));
  const offset = ids?.length ? 0 : parseOffsetCursor(options.cursor);

  const { data, error } = await db.schema('app').rpc('search_picker_products', {
    p_tenant_id: tenantId,
    p_query: options.q?.trim() || null,
    p_ids: ids?.length ? ids : null,
    p_brand_ids: options.brandIds?.length ? options.brandIds : null,
    p_category_ids: options.categoryIds?.length ? options.categoryIds : null,
    p_stock_bucket: options.stockBucket ?? null,
    p_status: options.status ?? null,
    p_quick_filters: options.quickFilters?.length ? options.quickFilters : null,
    p_quarter_start: currentQuarterStart,
    p_prev_quarter_start: previousQuarterStart,
    p_default_low_stock_threshold: 10,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;

  const pageRows = (data ?? []) as Array<{
    tenant_product_id: string;
    display_name: string;
    internal_sku: string | null;
    brand_id: string | null;
    brand_name: string | null;
    category_id: string | null;
    category_name: string | null;
    mrp: number | null;
    base_selling_price: number | null;
    cost_price: number | null;
    qty_available: number | null;
    invoice_value: number | null;
    invoice_units: number | null;
    invoice_count: number | null;
    total_count: number | null;
  }>;
  const total = Number(pageRows[0]?.total_count ?? 0);

  return {
    products: pageRows.map((row) => ({
      id: row.tenant_product_id,
      display_name: row.display_name,
      internal_sku: row.internal_sku,
      brand_id: row.brand_id,
      brand_name: row.brand_name,
      category_id: row.category_id,
      category_name: row.category_name,
      mrp: Number(row.mrp ?? 0),
      base_selling_price: row.base_selling_price != null ? Number(row.base_selling_price) : null,
      cost_price: row.cost_price != null ? Number(row.cost_price) : null,
      qty_available: Number(row.qty_available ?? 0),
      invoice_value: Number(row.invoice_value ?? 0),
      invoice_units: Number(row.invoice_units ?? 0),
      invoice_count: Number(row.invoice_count ?? 0),
    })),
    total,
    nextCursor: ids?.length || offset + pageRows.length >= total
      ? null
      : String(offset + pageRows.length),
  };
}

/** Dimension lookups for the picker's advanced-filter dropdowns (Brands/Categories). Plain lookups, not aggregations. */
export async function getProductPickerFilterLookups(db: DbClient, tenantId: string) {
  const [brandsRes, categoriesRes] = await Promise.all([
    db
      .schema('app')
      .from('tenant_brands')
      .select('id, display_name_override, master_brand_id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    db
      .schema('app')
      .from('tenant_categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  if (brandsRes.error) throw brandsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;

  const tenantBrands = (brandsRes.data ?? []) as Array<{
    id: string;
    display_name_override: string | null;
    master_brand_id: string | null;
  }>;
  const masterBrandIds = Array.from(
    new Set(tenantBrands.map((brand) => brand.master_brand_id).filter(Boolean) as string[]),
  );
  const masterBrandsRes = masterBrandIds.length > 0
    ? await db.schema('catalog').from('brands').select('id, name').in('id', masterBrandIds)
    : { data: [], error: null };
  if (masterBrandsRes.error) throw masterBrandsRes.error;
  const masterBrandMap = new Map(
    ((masterBrandsRes.data ?? []) as Array<{ id: string; name: string }>).map((brand) => [brand.id, brand.name]),
  );

  return {
    brands: tenantBrands.map((brand) => ({
      id: brand.id,
      label: brand.display_name_override ?? (brand.master_brand_id ? masterBrandMap.get(brand.master_brand_id) ?? 'Unnamed brand' : 'Unnamed brand'),
    })),
    categories: ((categoriesRes.data ?? []) as Array<{ id: string; name: string }>).map((category) => ({
      id: category.id,
      label: category.name,
    })),
  };
}
