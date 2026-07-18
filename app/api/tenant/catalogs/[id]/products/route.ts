import { NextRequest, NextResponse } from 'next/server';
import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';

// SELLER_CACHE_PERSONAL is applied by detailSearchResponse.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const { data, error } = await context.db.schema('app').rpc('search_catalog_products_detail', {
    p_tenant_id: context.tenantId, p_catalog_id: id, p_query: context.query,
    p_stock: request.nextUrl.searchParams.get('stock') || null,
    p_sort: request.nextUrl.searchParams.get('sort') || 'catalog_order', p_limit: context.limit, p_offset: context.offset,
  });
  if (error) return NextResponse.json({ error: 'Failed to search catalog products' }, { status: 500 });
  return detailSearchResponse(data ?? [], context.limit, context.offset);
}
