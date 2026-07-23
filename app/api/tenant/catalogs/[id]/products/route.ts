import { NextRequest, NextResponse } from 'next/server';
import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';
import { r2Url } from '@/lib/r2-url';

// SELLER_CACHE_PERSONAL is applied by detailSearchResponse.

function readMultiParam(params: URLSearchParams, key: string) {
  return params.getAll(key).map((value) => value.trim()).filter(Boolean);
}

function imageUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return r2Url(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const { data, error } = await context.db.schema('app').rpc('search_catalog_products_detail', {
    p_tenant_id: context.tenantId,
    p_catalog_id: id,
    p_query: context.query,
    p_member: searchParams.get('member') || 'yes',
    p_brand: readMultiParam(searchParams, 'brand'),
    p_category: readMultiParam(searchParams, 'category'),
    p_stock: readMultiParam(searchParams, 'stock'),
    p_sort: searchParams.get('sort') || 'catalog_order',
    p_limit: context.limit,
    p_offset: context.offset,
  });
  if (error) return NextResponse.json({ error: 'Failed to search catalog products' }, { status: 500 });
  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const next = { ...row, image_url: imageUrl(row.image_url) };
    return context.role === 'seller_admin' ? next : { ...next, cost_price: null, margin_pct: null };
  });
  return detailSearchResponse(rows, context.limit, context.offset);
}
