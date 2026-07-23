import { NextRequest, NextResponse } from 'next/server';
import { detailSearchResponse, getDetailSearchContext } from '@/lib/server/detail-tab-search-route';

function readMultiParam(params: URLSearchParams, key: string) {
  return params.getAll(key).map((value) => value.trim()).filter(Boolean);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getDetailSearchContext(request);
  if (context instanceof NextResponse) return context;

  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const { data, error } = await context.db.schema('app').rpc('search_cohort_buyers_detail', {
    p_tenant_id: context.tenantId,
    p_cohort_id: id,
    p_query: context.query,
    p_member: searchParams.get('member') || 'yes',
    p_last_sale: readMultiParam(searchParams, 'last_sale'),
    p_sales_90d: readMultiParam(searchParams, 'sales_90d'),
    p_buyer_app: readMultiParam(searchParams, 'buyer_app'),
    p_sort: searchParams.get('sort') || 'spend_desc',
    p_limit: context.limit,
    p_offset: context.offset,
  });

  if (error) {
    console.error('[GET /api/cohorts/[id]/buyers]', error);
    return NextResponse.json({ error: 'Failed to search cohort buyers' }, { status: 500 });
  }

  return detailSearchResponse(data ?? [], context.limit, context.offset);
}
