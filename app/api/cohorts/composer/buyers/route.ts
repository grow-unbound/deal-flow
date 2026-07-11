import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getCohortComposerBuyerResultset } from '@/lib/server/cohort-composer';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { supabaseAdmin } from '@/lib/supabase';

function readArrayParam(params: URLSearchParams, key: string) {
  return params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims?.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });

  try {
    const db = supabaseAdmin ?? getRequestSupabaseClient();
    const params = request.nextUrl.searchParams;
    const payload = await getCohortComposerBuyerResultset(db as any, claims.tenant_id, {
      q: params.get('q')?.trim() ?? '',
      geographies: readArrayParam(params, 'geography'),
      lastOrderBucket: (params.get('last_order') || undefined) as any,
      gmvBuckets: readArrayParam(params, 'gmv') as any,
      limit: parseRowsLimit(params.get('limit'), PAGE_SIZE.COMPOSER),
      cursor: params.get('cursor'),
    });
    return NextResponse.json(payload, { headers: SELLER_CACHE_PERSONAL });
  } catch (error: any) {
    console.error('[GET /api/cohorts/composer/buyers]', error?.code, error?.message);
    return NextResponse.json({ error: 'Failed to load cohort composer buyers' }, { status: 500 });
  }
}
