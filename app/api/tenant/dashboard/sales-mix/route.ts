import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming } from '@/lib/server/bounded-get';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import type { SellerDashboardSalesMixDimension, SellerDashboardSalesMixV4 } from '@/types/seller-dashboard';

export const dynamic = 'force-dynamic';

function emptySalesMix(): SellerDashboardSalesMixV4 {
  return { items: [] };
}

function parseDimension(value: string | null): SellerDashboardSalesMixDimension {
  return value === 'categories' ? 'categories' : 'brands';
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: SellerDashboardSalesMixV4 | { error: string }, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'dashboard_sales_mix_api', init, APP_GET_CACHE_CONTROL);

  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return timedJson({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  const dimension = parseDimension(request.nextUrl.searchParams.get('dimension'));

  try {
    const { data, error } = await supabaseAdmin.schema('app').rpc('get_seller_dashboard_sales_mix_v4', {
      p_tenant_id: claims.tenant_id,
      p_dimension: dimension,
    });

    if (error) {
      console.error('[GET /api/tenant/dashboard/sales-mix] rpc failed', error);
      return timedJson({ error: 'Failed to fetch sales mix' }, { status: 500 });
    }

    if (!data || typeof data !== 'object') return timedJson(emptySalesMix());

    const payload = data as SellerDashboardSalesMixV4;
    return timedJson({ items: Array.isArray(payload.items) ? payload.items : [] });
  } catch (error) {
    console.error('[GET /api/tenant/dashboard/sales-mix] unexpected error', error);
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
