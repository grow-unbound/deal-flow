import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { createTimer } from '@/lib/server-timing';
import { parseRowsLimit, SELLER_GET_CACHE_CONTROL } from '@/lib/server/bounded-get';
import { getCategoriesLandingPayload } from '@/lib/server/categories-landing';
import { readArrayParam } from '@/lib/landing-filter-params';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { assertSellerAdmin } from '@/lib/server/seller-auth';
import { PAGE_SIZE } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const timer = createTimer();
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set('Server-Timing', timer.header('categories_landing'));
    if (!init?.status || (init.status >= 200 && init.status < 300)) {
      response.headers.set('Cache-Control', SELLER_GET_CACHE_CONTROL);
    }
    return response;
  };

  const claims = await getVerifiedClaims(request);
  const adminCheck = assertSellerAdmin(claims);
  if (!adminCheck.ok) {
    return timedJson({ error: adminCheck.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: adminCheck.status });
  }

  const flagEnabled = await getFlag('df_brand_product_master', claims.tenant_id!);
  if (!flagEnabled) return timedJson({ error: 'Feature not enabled' }, { status: 403 });

  try {
    const db = getRequestSupabaseClient();
    const payload = await getCategoriesLandingPayload(db as any, claims.tenant_id!, request.nextUrl.searchParams.get('period'), {
      search: request.nextUrl.searchParams.get('search')?.trim().toLowerCase() ?? '',
      status: readArrayParam(request.nextUrl.searchParams, 'status'),
      products: readArrayParam(request.nextUrl.searchParams, 'products'),
      limit: parseRowsLimit(request.nextUrl.searchParams.get('limit'), PAGE_SIZE.SELLER),
    });
    return timedJson(payload);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('[GET /api/tenant/categories/landing]', err?.code, err?.message);
    return timedJson({ error: 'Failed to fetch categories landing' }, { status: 500 });
  }
}
