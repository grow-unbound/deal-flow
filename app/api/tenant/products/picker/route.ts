import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getProductPickerResultset, getProductPickerFilterLookups } from '@/lib/server/product-picker';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { supabaseAdmin } from '@/lib/supabase';

const SELECTED_PRODUCTS_LIMIT = 250;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readArrayParam(params: URLSearchParams, key: string) {
  return params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Shared product-picker endpoint for the Price List and Campaign Add/Edit forms' product
 * search-overlay pickers. Deliberately separate from /api/tenant/products/composer and
 * /api/tenant/catalogs/composer/products, which stay on their existing
 * search_products_scoped / get_catalog_composer_product_metrics data path because they're
 * also shared with PriceListComposer.tsx / CatalogComposer.tsx's merchandising grids
 * (freshness tags, stock tone) -- out of scope for this picker-overlay task.
 */
export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims?.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = supabaseAdmin ?? (await getRequestSupabaseClient());
    const params = request.nextUrl.searchParams;
    const allSelectedIds = readArrayParam(params, 'selected_id');
    const selectedIds = allSelectedIds.filter((id) => {
      const valid = isValidUuid(id);
      if (!valid) console.warn(`[GET /api/tenant/products/picker] Invalid UUID in selected_id: "${id}"`);
      return valid;
    }).slice(0, SELECTED_PRODUCTS_LIMIT);

    const brandIds = readArrayParam(params, 'brand_id').filter((id) => {
      const valid = isValidUuid(id);
      if (!valid) console.warn(`[GET /api/tenant/products/picker] Invalid UUID in brand_id: "${id}"`);
      return valid;
    });
    const categoryIds = readArrayParam(params, 'category_id').filter((id) => {
      const valid = isValidUuid(id);
      if (!valid) console.warn(`[GET /api/tenant/products/picker] Invalid UUID in category_id: "${id}"`);
      return valid;
    });

    const [payload, selectedPayload, lookups] = await Promise.all([
      getProductPickerResultset(db as any, claims.tenant_id, {
        q: params.get('q')?.trim() ?? '',
        limit: parseRowsLimit(params.get('limit'), PAGE_SIZE.COMPOSER),
        cursor: params.get('cursor'),
        brandIds,
        categoryIds,
        stockBucket: (params.get('stock') || null) as any,
        status: (params.get('status') || null) as any,
        quickFilters: readArrayParam(params, 'quick') as any,
      }),
      selectedIds.length > 0
        ? getProductPickerResultset(db as any, claims.tenant_id, { ids: selectedIds })
        : Promise.resolve(null),
      getProductPickerFilterLookups(db as any, claims.tenant_id),
    ]);

    return NextResponse.json(
      { ...payload, selected_products: selectedPayload?.products ?? [], filters: lookups },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (error: any) {
    console.error('[GET /api/tenant/products/picker]', error?.code, error?.message);
    return NextResponse.json({ error: 'Failed to load product picker' }, { status: 500 });
  }
}
