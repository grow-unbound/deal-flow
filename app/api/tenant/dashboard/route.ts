import { NextRequest, NextResponse } from 'next/server';

import { getVerifiedClaims } from '@/lib/auth';
import { getSellerLandingPeriodMeta } from '@/lib/server/seller-period';
import { getSellerDashboardData } from '@/lib/server/seller-dashboard';
import { createTimer } from '@/lib/server-timing';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('dashboard_api'));
    return response;
  };

  try {
    const claims = await getVerifiedClaims(request);

    if (!claims.tenant_id || !claims.role?.startsWith('seller_')) {
      return timedJson({ error: 'Forbidden' }, { status: 403 });
    }

    const period = getSellerLandingPeriodMeta(request.nextUrl.searchParams.get('period'));
    const dashboard = await getSellerDashboardData(claims.tenant_id, claims, period);
    return timedJson(dashboard);
  } catch (error) {
    console.error('[GET /api/tenant/dashboard]', error);
    return timedJson({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
