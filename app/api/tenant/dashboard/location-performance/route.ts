import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming } from '@/lib/server/bounded-get';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import type { SellerDashboardLocationPerformanceV4 } from '@/types/seller-dashboard';

export const dynamic = 'force-dynamic';

function emptyLocationPerformance(): SellerDashboardLocationPerformanceV4 {
  return { locations: [] };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: SellerDashboardLocationPerformanceV4 | { error: string }, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'dashboard_location_performance_api', init, APP_GET_CACHE_CONTROL);

  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return timedJson({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  try {
    const { data, error } = await supabaseAdmin.schema('app').rpc('get_seller_dashboard_location_performance_v4', {
      p_tenant_id: claims.tenant_id,
    });

    if (error) {
      console.error('[GET /api/tenant/dashboard/location-performance] rpc failed', error);
      return timedJson({ error: 'Failed to fetch location performance' }, { status: 500 });
    }

    if (!data || typeof data !== 'object') return timedJson(emptyLocationPerformance());

    const payload = data as SellerDashboardLocationPerformanceV4;
    return timedJson({ locations: Array.isArray(payload.locations) ? payload.locations : [] });
  } catch (error) {
    console.error('[GET /api/tenant/dashboard/location-performance] unexpected error', error);
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
