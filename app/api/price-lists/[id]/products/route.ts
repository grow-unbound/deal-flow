import { NextRequest, NextResponse } from 'next/server';
import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';

// SELLER_CACHE_PERSONAL is applied by detailSearchResponse.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data, error } = await context.db.schema('app').rpc('search_price_list_products_detail', {
    p_tenant_id: context.tenantId, p_price_list_id: id, p_query: context.query,
    p_price_position: request.nextUrl.searchParams.get('position') || null,
    p_sort: request.nextUrl.searchParams.get('sort') || 'product_asc', p_limit: context.limit, p_offset: context.offset,
  });
  if (error) return NextResponse.json({ error: 'Failed to search price-list products' }, { status: 500 });
  const rows = (data ?? []).map((row: Record<string, unknown>) => context.role === 'seller_admin' ? row : { ...row, cost_price: null, margin_pct: null });
  return detailSearchResponse(rows, context.limit, context.offset);
}
