import { NextRequest } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { APP_GET_CACHE_CONTROL, jsonWithServerTiming } from '@/lib/server/bounded-get';
import { createTimer } from '@/lib/server-timing';
import { supabaseAdmin } from '@/lib/supabase';
import type { SellerDashboardCustomerActivityV4 } from '@/types/seller-dashboard';

export const dynamic = 'force-dynamic';

function emptyCustomerActivity(): SellerDashboardCustomerActivityV4 {
  return { purchasing: 0, repeat: 0, inactive: 0, overdue: 0 };
}

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: SellerDashboardCustomerActivityV4 | { error: string }, init?: ResponseInit) =>
    jsonWithServerTiming(body, timer, 'dashboard_customer_activity_api', init, APP_GET_CACHE_CONTROL);

  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return timedJson({ error: 'Unauthorized' }, { status: 401 });
  if (claims.role !== 'seller_admin') return timedJson({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return timedJson({ error: 'Server configuration error' }, { status: 500 });

  try {
    const { data, error } = await supabaseAdmin.schema('app').rpc('get_seller_dashboard_customer_activity_v4', {
      p_tenant_id: claims.tenant_id,
    });

    if (error) {
      console.error('[GET /api/tenant/dashboard/customer-activity] rpc failed', error);
      return timedJson({ error: 'Failed to fetch customer activity' }, { status: 500 });
    }

    if (!data || typeof data !== 'object') return timedJson(emptyCustomerActivity());

    const payload = data as SellerDashboardCustomerActivityV4;
    return timedJson({
      purchasing: Number(payload.purchasing ?? 0),
      repeat: Number(payload.repeat ?? 0),
      inactive: Number(payload.inactive ?? 0),
      overdue: Number(payload.overdue ?? 0),
    });
  } catch (error) {
    console.error('[GET /api/tenant/dashboard/customer-activity] unexpected error', error);
    return timedJson({ error: 'Unexpected server error' }, { status: 500 });
  }
}
