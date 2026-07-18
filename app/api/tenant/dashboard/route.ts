import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { getSellerDashboardData } from '@/lib/server/seller-dashboard';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { createTimer } from '@/lib/server-timing';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('dashboard_api'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    const period = getSellerLandingPeriodMeta('month');
    const fullCalloutId = request.nextUrl.searchParams.get('callout')?.trim() || undefined;
    const dashboard = await getSellerDashboardData(claims.tenant_id, claims, period, { fullCalloutId });
    return timedJson(dashboard);
  } catch (error) {
    console.error('[GET /api/tenant/dashboard]', error);
    return timedJson({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
