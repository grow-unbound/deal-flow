import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

const ParamsSchema = z.object({ id: z.string().uuid() });
const SortSchema = z.enum(['gmv_desc', 'conversions_desc', 'recently_opened', 'name_asc']).catch('gmv_desc');

function readMultiParam(params: URLSearchParams, key: string) {
  return params.getAll(key).map((value) => value.trim()).filter(Boolean);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  const claims = await getVerifiedClaims(request);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid catalog id' }, { status: 400 });
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), 50);
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get('offset') ?? 0) || 0);
  const searchParams = request.nextUrl.searchParams;
  const { data, error } = await (supabaseAdmin as any).schema('app').rpc('search_catalog_buyers', {
    p_tenant_id: claims.tenant_id,
    p_catalog_id: parsed.data.id,
    p_query: searchParams.get('q')?.trim() || null,
    p_member: searchParams.get('member') || 'yes',
    p_status: readMultiParam(searchParams, 'status'),
    p_invoice_this_quarter: readMultiParam(searchParams, 'invoice_this_quarter'),
    p_demand_this_quarter: readMultiParam(searchParams, 'demand_this_quarter'),
    p_buyer_app: readMultiParam(searchParams, 'buyer_app'),
    p_sort: SortSchema.parse(searchParams.get('sort')),
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('[GET /api/tenant/catalogs/[id]/buyers]', error);
    return NextResponse.json({ error: 'Failed to load catalog buyers' }, { status: 500 });
  }

  const rows = (data ?? []).map((row: any) => ({
    buyer_id: String(row.buyer_id),
    buyer_name: String(row.buyer_name),
    city: String(row.city ?? ''),
    geography_label: String(row.geography_label ?? row.city ?? '—'),
    cohort_label: String(row.cohort_label ?? 'Targeted buyers'),
    opened_status: row.opened_status as 'NOT YET OPENED' | 'OPENED' | 'CONVERTED',
    spend: Number(row.demand_value ?? 0),
    orders: Number(row.demand_count ?? 0),
    demand_value: Number(row.demand_value ?? 0),
    demand_count: Number(row.demand_count ?? 0),
    last_opened_at: row.last_opened_at ?? null,
    last_order_at: row.last_conversion_at ?? null,
    last_conversion_at: row.last_conversion_at ?? null,
    last_primary_demand_at: row.last_primary_demand_at ?? null,
    is_member: Boolean(row.is_member),
    buyer_app_status: row.buyer_app_status ?? 'not_enabled',
    primary_demand_kind: row.primary_demand_kind ?? 'orders',
  }));
  const first = data?.[0];

  return NextResponse.json({
    rows,
    total: Number(first?.total_count ?? 0),
    totals: {
      opens: Number(first?.opens_count ?? 0),
      converted: Number(first?.converted_count ?? 0),
      gmv: Number(first?.attributed_gmv ?? 0),
    },
    limit,
    offset,
  }, { headers: SELLER_CACHE_PERSONAL });
}
