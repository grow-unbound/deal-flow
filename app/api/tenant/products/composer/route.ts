import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit } from '@/lib/server/bounded-get';

const DEFAULT_COMPOSER_LIMIT = PAGE_SIZE.COMPOSER;

interface ProductRow {
  id: string;
  internal_sku: string;
  name_override: string | null;
  tenant_brand_id: string | null;
  tenant_category_id: string | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  is_active: boolean;
}

interface TenantBrandRow {
  id: string;
  display_name_override: string | null;
}

type PriceListProductAvailability = 'show_all' | 'in_stock' | 'low_stock' | 'out_of_stock';

type InventoryRow = {
  tenant_product_id: string;
  qty_available: number | null;
  reorder_point: number | null;
};

function readMultiParam(params: URLSearchParams, key: string) {
  return params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function parseOffsetCursor(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function applySearch(query: any, search: string, matchingBrandIds: string[]) {
  if (!search) return query;
  const escaped = escapeLike(search);
  const orParts = [
    `internal_sku.ilike.%${escaped}%`,
    `name_override.ilike.%${escaped}%`,
  ];
  if (matchingBrandIds.length > 0) {
    orParts.push(`tenant_brand_id.in.(${matchingBrandIds.join(',')})`);
  }

  return query.or(orParts.join(','));
}

function buildInventoryByProductId(rows: InventoryRow[]) {
  const inventoryByProductId = new Map<string, { qty_available: number; reorder_point: number }>();
  for (const row of rows) {
    const existing = inventoryByProductId.get(row.tenant_product_id) ?? { qty_available: 0, reorder_point: 0 };
    existing.qty_available += Number(row.qty_available ?? 0);
    existing.reorder_point = Math.max(existing.reorder_point, Number(row.reorder_point ?? 0));
    inventoryByProductId.set(row.tenant_product_id, existing);
  }
  return inventoryByProductId;
}

function matchesAvailability(
  productId: string,
  inventoryByProductId: Map<string, { qty_available: number; reorder_point: number }>,
  availability: PriceListProductAvailability,
) {
  if (availability === 'show_all') return true;
  const inventory = inventoryByProductId.get(productId) ?? { qty_available: 0, reorder_point: 0 };
  if (availability === 'in_stock') return inventory.qty_available > 0;
  if (availability === 'low_stock') return inventory.qty_available > 0 && inventory.reorder_point > 0 && inventory.qty_available <= inventory.reorder_point;
  if (availability === 'out_of_stock') return inventory.qty_available <= 0;
  return true;
}

/**
 * GET /api/tenant/products/composer
 * Returns a bounded, filtered product page plus server-computed full-scope
 * facet counts for composer product pickers.
 */
export async function GET(req: NextRequest) {
  const claims = await getVerifiedClaims(req);
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canViewCost = claims.role === 'seller_admin';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const params = req.nextUrl.searchParams;
  const search = params.get('q')?.trim() ?? '';
  const brandLabels = readMultiParam(params, 'brand');
  const categoryLabels = readMultiParam(params, 'category');
  const brandIdsFromParams = readMultiParam(params, 'brand_id');
  const categoryIdsFromParams = readMultiParam(params, 'category_id');
  const selectedIds = readMultiParam(params, 'selected_id');
  const availability = (params.get('availability') || 'show_all') as PriceListProductAvailability;
  const needsAvailabilityFilter = availability !== 'show_all';
  const limit = parseRowsLimit(params.get('limit'), DEFAULT_COMPOSER_LIMIT);
  const offset = parseOffsetCursor(params.get('cursor'));

  const [brandLookupRes, categoryLookupRes, searchBrandLookupRes] = await Promise.all([
    brandLabels.length > 0
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override')
          .eq('tenant_id', claims.tenant_id)
          .is('deleted_at', null)
          .in('display_name_override', brandLabels)
      : Promise.resolve({ data: [], error: null }),
    categoryLabels.length > 0
      ? db
          .schema('app')
          .from('tenant_categories')
          .select('id, name')
          .eq('tenant_id', claims.tenant_id)
          .is('deleted_at', null)
          .in('name', categoryLabels)
      : Promise.resolve({ data: [], error: null }),
    search
      ? db
          .schema('app')
          .from('tenant_brands')
          .select('id, display_name_override')
          .eq('tenant_id', claims.tenant_id)
          .is('deleted_at', null)
          .ilike('display_name_override', `%${escapeLike(search)}%`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (brandLookupRes.error || categoryLookupRes.error || searchBrandLookupRes.error) {
    console.error('[GET /api/tenant/products/composer] lookup error:', brandLookupRes.error || categoryLookupRes.error || searchBrandLookupRes.error);
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
  const searchBrandIds = ((searchBrandLookupRes.data ?? []) as Array<{ id: string }>).map((row) => row.id);

  let productsQuery = db
    .schema('app')
    .from('tenant_products')
    .select('id, internal_sku, name_override, tenant_brand_id, tenant_category_id, mrp, base_selling_price, cost_price, is_active', { count: 'exact' })
    .eq('tenant_id', claims.tenant_id)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (brandIds.length > 0) productsQuery = productsQuery.in('tenant_brand_id', brandIds);
  if (categoryIds.length > 0) productsQuery = productsQuery.in('tenant_category_id', categoryIds);
  productsQuery = applySearch(productsQuery, search, searchBrandIds);
  productsQuery = productsQuery
    .order('name_override', { ascending: true, nullsFirst: false })
    .order('internal_sku', { ascending: true });
  if (!needsAvailabilityFilter) {
    productsQuery = productsQuery.range(offset, offset + limit - 1);
  }

  const [productsRes, brandFacetRes, categoryFacetRes] = await Promise.all([
    productsQuery,
    // Brand facet counts — all products, no pagination cap
    db
      .schema('app')
      .from('tenant_products')
      .select('tenant_brand_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('tenant_brand_id', 'is', null),
    // Category facet counts — all products, no pagination cap
    db
      .schema('app')
      .from('tenant_products')
      .select('tenant_category_id')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('tenant_category_id', 'is', null),
  ]);

  if (productsRes.error) {
    console.error('[GET /api/tenant/products/composer] products error:', productsRes.error.message);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const matchedProducts = (productsRes.data ?? []) as ProductRow[];
  const availabilityInventoryRes = needsAvailabilityFilter && matchedProducts.length > 0
    ? await db
        .schema('app')
        .from('tenant_inventory')
        .select('tenant_product_id, qty_available, reorder_point')
        .in('tenant_product_id', matchedProducts.map((product) => product.id))
        .is('deleted_at', null)
    : { data: [], error: null };

  if (availabilityInventoryRes.error) {
    console.error('[GET /api/tenant/products/composer] availability inventory error:', availabilityInventoryRes.error.message);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const inventoryByProductId = buildInventoryByProductId((availabilityInventoryRes.data ?? []) as InventoryRow[]);
  const availabilityFilteredProducts = needsAvailabilityFilter
    ? matchedProducts.filter((product) => matchesAvailability(product.id, inventoryByProductId, availability))
    : matchedProducts;
  const total = needsAvailabilityFilter
    ? availabilityFilteredProducts.length
    : typeof productsRes.count === 'number'
      ? productsRes.count
      : availabilityFilteredProducts.length;
  const products = needsAvailabilityFilter
    ? availabilityFilteredProducts.slice(offset, offset + limit)
    : availabilityFilteredProducts;
  const selectedRowsRes = selectedIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_products')
        .select('id, internal_sku, name_override, tenant_brand_id, tenant_category_id, mrp, base_selling_price, cost_price, is_active')
        .eq('tenant_id', claims.tenant_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .in('id', selectedIds)
    : { data: [], error: null };

  if (selectedRowsRes.error) {
    console.error('[GET /api/tenant/products/composer] selected products error:', selectedRowsRes.error.message);
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }

  const selectedRows = (selectedRowsRes.data ?? []) as ProductRow[];
  const rowsForLookup = [...products, ...selectedRows];

  // Build brand + category count maps
  const brandCountMap = new Map<string, number>();
  for (const row of (brandFacetRes.data ?? []) as Array<{ tenant_brand_id: string | null }>) {
    if (row.tenant_brand_id) {
      brandCountMap.set(row.tenant_brand_id, (brandCountMap.get(row.tenant_brand_id) ?? 0) + 1);
    }
  }
  const categoryCountMap = new Map<string, number>();
  for (const row of (categoryFacetRes.data ?? []) as Array<{ tenant_category_id: string | null }>) {
    if (row.tenant_category_id) {
      categoryCountMap.set(row.tenant_category_id, (categoryCountMap.get(row.tenant_category_id) ?? 0) + 1);
    }
  }

  // Resolve brand names for all facet brand IDs
  const allBrandIds = Array.from(new Set([
    ...rowsForLookup.map((p) => p.tenant_brand_id).filter(Boolean) as string[],
    ...brandCountMap.keys(),
  ]));
  const brandsRes = allBrandIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_brands')
        .select('id, display_name_override')
        .in('id', allBrandIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  const brandById = new Map(
    ((brandsRes.data ?? []) as TenantBrandRow[]).map((b) => [b.id, b.display_name_override?.trim() || 'Brand']),
  );

  // Resolve category names for all facet category IDs
  const allCategoryIds = Array.from(new Set([
    ...rowsForLookup.map((p) => p.tenant_category_id).filter(Boolean) as string[],
    ...categoryCountMap.keys(),
  ]));
  const categoriesRes = allCategoryIds.length > 0
    ? await db
        .schema('app')
        .from('tenant_categories')
        .select('id, name')
        .in('id', allCategoryIds)
        .is('deleted_at', null)
    : { data: [], error: null };

  const categoryNameById = new Map(
    ((categoriesRes.data ?? []) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name ?? 'Uncategorized']),
  );

  const facets = {
    brands: Array.from(brandCountMap.entries())
      .map(([id, count]) => ({ id, label: brandById.get(id) ?? 'Brand', count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    categories: Array.from(categoryCountMap.entries())
      .map(([id, count]) => ({ id, label: categoryNameById.get(id) ?? 'Uncategorized', count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };

  const mapProduct = (p: ProductRow) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    display_name: p.name_override?.trim() || p.internal_sku,
    brand_name: p.tenant_brand_id ? (brandById.get(p.tenant_brand_id) ?? 'Brand') : 'Brand',
    category_name: p.tenant_category_id ? (categoryNameById.get(p.tenant_category_id) ?? null) : null,
    tenant_brand_id: p.tenant_brand_id,
    tenant_category_id: p.tenant_category_id,
    mrp: p.mrp,
    base_selling_price: p.base_selling_price,
    cost_price: canViewCost ? p.cost_price : null,
  });

  const productList = products.map(mapProduct);
  const selectedById = new Map(selectedRows.map((product) => [product.id, mapProduct(product)]));

  const selectedProducts = selectedIds.length > 0
    ? selectedIds.map((id) => selectedById.get(id)).filter(Boolean)
    : [];
  const nextCursor = offset + products.length < total ? String(offset + products.length) : null;

  return NextResponse.json({ products: productList, selected_products: selectedProducts, facets, total, nextCursor });
}
