import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { searchScopedProducts } from '@/lib/server/scoped-product-search';

const DEFAULT_COMPOSER_LIMIT = PAGE_SIZE.COMPOSER;
const METADATA_LOOKUP_LIMIT = PAGE_SIZE.MAX;
const SELECTED_PRODUCTS_LIMIT = 250;

type PriceListProductAvailability = 'show_all' | 'in_stock' | 'low_stock' | 'out_of_stock';

function readMultiParam(params: URLSearchParams, key: string, max: number) {
  return Array.from(new Set(
    params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean),
  )).slice(0, max);
}

function chunkIds(ids: string[], size: number) {
  return Array.from({ length: Math.ceil(ids.length / size) }, (_, index) =>
    ids.slice(index * size, (index + 1) * size));
}

function parseOffsetCursor(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

/**
 * GET /api/tenant/products/composer
 * Returns a bounded, filtered product page plus server-computed full-scope
 * facet counts for composer product pickers.
 */
export async function GET(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantId = claims.tenant_id;
  const canViewCost = claims.role === 'seller_admin';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const params = req.nextUrl.searchParams;
  const search = params.get('q')?.trim() ?? '';
  const brandLabels = readMultiParam(params, 'brand', METADATA_LOOKUP_LIMIT);
  const categoryLabels = readMultiParam(params, 'category', METADATA_LOOKUP_LIMIT);
  const brandIdsFromParams = readMultiParam(params, 'brand_id', METADATA_LOOKUP_LIMIT);
  const categoryIdsFromParams = readMultiParam(params, 'category_id', METADATA_LOOKUP_LIMIT);
  const selectedIds = readMultiParam(params, 'selected_id', SELECTED_PRODUCTS_LIMIT);
  const availability = (params.get('availability') || 'show_all') as PriceListProductAvailability;
  const needsAvailabilityFilter = availability !== 'show_all';
  const limit = parseRowsLimit(params.get('limit'), DEFAULT_COMPOSER_LIMIT);
  const offset = parseOffsetCursor(params.get('cursor'));

  const [brandLookupRes, categoryLookupRes] = await Promise.all([
    brandLabels.length > 0
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .in('display_name_override', brandLabels)
          .limit(METADATA_LOOKUP_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    categoryLabels.length > 0
      ? db
          .schema('app')
          .from('tenant_categories')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .in('name', categoryLabels)
          .limit(METADATA_LOOKUP_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (brandLookupRes.error || categoryLookupRes.error) {
    console.error('[GET /api/tenant/products/composer] lookup error:', brandLookupRes.error || categoryLookupRes.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const brandIds = Array.from(new Set([
    ...brandIdsFromParams,
    ...((brandLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  ]));
  const categoryIds = Array.from(new Set([
    ...categoryIdsFromParams,
    ...((categoryLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  ]));
  const [productsResult, selectedResult, facetResult] = await Promise.all([
    searchScopedProducts({
      db,
      tenantId,
      query: search,
      limit,
      offset,
      brandIds,
      categoryIds,
      availability,
      sort: search ? 'relevance' : 'name_asc',
    }),
    selectedIds.length > 0
      ? Promise.all(chunkIds(selectedIds, PAGE_SIZE.MAX).map((ids) => searchScopedProducts({
          db,
          tenantId,
          limit: ids.length,
          ids,
          sort: 'name_asc',
        }))).then((pages) => ({
          rows: pages.flatMap((page) => page.rows),
          total: pages.reduce((sum, page) => sum + page.total, 0),
        }))
      : Promise.resolve({ rows: [], total: 0 }),
    db.schema('app').rpc('get_product_composer_facets', { p_tenant_id: tenantId }),
  ]);
  if (facetResult.error) {
    console.error('[GET /api/tenant/products/composer] facet error:', facetResult.error);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const products = productsResult.rows;
  const total = productsResult.total;
  const selectedRows = selectedResult.rows;
  const facetRows = (facetResult.data ?? []) as Array<{
    facet_type: 'brand' | 'category';
    facet_id: string;
    facet_label: string;
    product_count: number;
  }>;

  const facets = {
    brands: facetRows
      .filter((row) => row.facet_type === 'brand')
      .map((row) => ({ id: row.facet_id, label: row.facet_label, count: Number(row.product_count) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    categories: facetRows
      .filter((row) => row.facet_type === 'category')
      .map((row) => ({ id: row.facet_id, label: row.facet_label, count: Number(row.product_count) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };

  const mapProduct = (p: (typeof products)[number]) => ({
    id: p.tenant_product_id,
    internal_sku: p.sku ?? p.product_name,
    display_name: p.product_name,
    brand_name: p.brand_name,
    category_name: p.category_name || null,
    tenant_brand_id: p.brand_id,
    tenant_category_id: p.category_id,
    mrp: p.mrp,
    base_selling_price: p.base_selling_price,
    cost_price: canViewCost ? p.cost_price : null,
  });

  const productList = products.map(mapProduct);
  const selectedById = new Map(selectedRows.map((product) => [product.tenant_product_id, mapProduct(product)]));

  const selectedProducts = selectedIds.length > 0
    ? selectedIds.map((id) => selectedById.get(id)).filter(Boolean)
    : [];
  const nextCursor = offset + productList.length < total ? String(offset + productList.length) : null;

  return NextResponse.json(
    { products: productList, selected_products: selectedProducts, facets, total, nextCursor },
    { headers: SELLER_CACHE_PERSONAL },
  );
}
