import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { createTimer } from '@/lib/server-timing';
import { getCohortsLandingPayload } from '../../cohorts/route';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('cohorts_api'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return timedJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return timedJson({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) {
    return timedJson({ error: 'Feature not enabled' }, { status: 403 });
  }

  try {
    const payload = await getCohortsLandingPayload(claims.tenant_id, request.nextUrl.searchParams.get('period'));
    return timedJson(payload);
  } catch (error: any) {
    console.error('[GET /api/tenant/cohorts] DB error:', error?.code, error?.message);
    return timedJson({ error: 'Failed to fetch cohorts landing' }, { status: 500 });
  }
}
