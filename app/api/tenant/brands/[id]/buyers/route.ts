import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

const ParamsSchema = z.object({ id: z.string().uuid() });
const SortSchema = z.enum(['spend_desc', 'spend_asc', 'orders_desc']).catch('spend_desc');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  const claims = await getVerifiedClaims(request);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid brand id' }, { status: 400 });
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), 50);
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get('offset') ?? 0) || 0);
  const { data, error } = await (supabaseAdmin as any).schema('app').rpc('search_brand_buyers', {
    p_tenant_id: claims.tenant_id,
    p_brand_id: parsed.data.id,
    p_query: request.nextUrl.searchParams.get('q')?.trim() || null,
    p_segment: request.nextUrl.searchParams.get('segment') || null,
    p_sort: SortSchema.parse(request.nextUrl.searchParams.get('sort')),
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('[GET /api/tenant/brands/[id]/buyers]', error);
    return NextResponse.json({ error: 'Failed to load brand buyers' }, { status: 500 });
  }

  const rows = (data ?? []).map((row: any) => ({
    id: String(row.buyer_id),
    name: String(row.buyer_name),
    city: String(row.city ?? ''),
    cohort: String(row.cohort_label ?? '—'),
    status: row.is_active ? 'Active' : 'Inactive',
    spend: Number(row.spend ?? 0),
    orders: Number(row.orders ?? 0),
    last_order: row.last_order_at ?? null,
  }));

  return NextResponse.json({ rows, total: Number(data?.[0]?.total_count ?? 0), limit, offset }, { headers: SELLER_CACHE_PERSONAL });
}
