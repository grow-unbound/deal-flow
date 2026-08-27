import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import type { LocationPeriodBuyersResponse } from '@/hooks/useLocations';

export const dynamic = 'force-dynamic';

type PeriodBuyerRow = {
  buyer_id: string;
  business_name: string;
  phone: string | null;
  buyer_app_enabled: boolean | null;
  invoice_value: number | string | null;
  invoice_count: number | string | null;
};

type NowRow = {
  buyer_id: string;
  receivable_amount: number | string | null;
  overdue_amount: number | string | null;
  credit_limit: number | string | null;
  credit_available: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('location_buyers'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return timedJson({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as any;
  const tenantId = claims.tenant_id;

  // Same "this month" window the Locations landing table uses for its
  // Active Buyers column (metrics_location_period_summary, grain='month'),
  // so this list's buyer count matches that column for the same location.
  const period = getSellerLandingPeriodMeta('month');
  const periodStart = period.current_start.slice(0, 10);
  const periodEndExclusive = period.current_end_exclusive.slice(0, 10);

  const { data: location, error: locationError } = await db
    .schema('app')
    .from('locations')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (locationError || !location) return timedJson({ error: 'Not found' }, { status: 404 });

  const { data, error } = await db.schema('app').rpc('get_location_period_buyers', {
    p_tenant_id: tenantId,
    p_location_id: id,
    p_period_start: periodStart,
    p_period_end_exclusive: periodEndExclusive,
  });
  if (error) {
    console.error('[GET /api/tenant/locations/[id]/buyers]', error.code, error.message);
    return timedJson({ error: 'Failed to fetch location buyers' }, { status: 500 });
  }

  const periodRows = (data ?? []) as PeriodBuyerRow[];
  const buyerIds = periodRows.map((row) => row.buyer_id);

  // Credit/outstanding/overdue are buyer-wide (tenant), not location-scoped —
  // same source the Customers landing table reads, so these columns match.
  const nowById = new Map<string, NowRow>();
  if (buyerIds.length > 0) {
    const { data: nowData, error: nowError } = await db
      .schema('app')
      .from('metrics_buyer_now_summary')
      .select('buyer_id, receivable_amount, overdue_amount, credit_limit, credit_available')
      .eq('tenant_id', tenantId)
      .in('buyer_id', buyerIds)
      .is('deleted_at', null);
    if (nowError) {
      console.error('[GET /api/tenant/locations/[id]/buyers]', nowError.code, nowError.message);
      return timedJson({ error: 'Failed to fetch location buyers' }, { status: 500 });
    }
    for (const row of (nowData ?? []) as NowRow[]) nowById.set(row.buyer_id, row);
  }

  const rows = periodRows.map((row) => {
    const now = nowById.get(row.buyer_id);
    const creditLimit = toNumber(now?.credit_limit);
    const creditAvailable = toNumber(now?.credit_available);
    return {
      buyer_id: row.buyer_id,
      business_name: row.business_name,
      phone: row.phone,
      buyer_app_enabled: Boolean(row.buyer_app_enabled),
      invoice_value: toNumber(row.invoice_value),
      invoice_count: toNumber(row.invoice_count),
      receivable_amount: toNumber(now?.receivable_amount),
      overdue_amount: toNumber(now?.overdue_amount),
      credit_limit: creditLimit,
      credit_available: creditAvailable,
      credit_used: Math.max(0, creditLimit - creditAvailable),
    };
  });

  const response: LocationPeriodBuyersResponse = {
    buyers: rows,
    period_key: 'this_month',
    period_start: periodStart,
  };

  return timedJson(response);
}
