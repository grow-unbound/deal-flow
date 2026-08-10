import { NextRequest, NextResponse } from 'next/server';
import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';

// SELLER_CACHE_PERSONAL is applied by detailSearchResponse.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;
  // Brands is a Growth-section module scoped to seller_admin only — see the same
  // comment in ../products/route.ts.
  if (context.role !== 'seller_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { data, error } = await context.db.schema('app').rpc('search_brand_catalogs_detail', {
    p_tenant_id: context.tenantId, p_brand_id: id, p_query: context.query,
    p_status: request.nextUrl.searchParams.get('status') || null,
    p_sort: request.nextUrl.searchParams.get('sort') || 'sent_desc', p_limit: context.limit, p_offset: context.offset,
  });
  if (error) return NextResponse.json({ error: 'Failed to search brand catalogs' }, { status: 500 });
  return detailSearchResponse(data ?? [], context.limit, context.offset);
}
