import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { PAGE_SIZE } from '@/lib/pagination';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { getCohortComposerBuyerResultset } from '@/lib/server/cohort-composer';
import { getRequestSupabaseClient } from '@/lib/server/request-supabase';
import { supabaseAdmin } from '@/lib/supabase';

const SELECTED_BUYERS_LIMIT = 250;

function readArrayParam(params: URLSearchParams, key: string) {
  return params.getAll(key).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

/**
 * Shared buyer-picker endpoint for the Cohort, Price List (buyer assignment), and
 * Campaign Add/Edit forms — a plain tenant-buyer-directory search, not cohort-specific
 * despite the URL. No feature-flag gate: any seller_ role on the tenant can search its
 * own buyers.
 */
export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);
  if (!claims?.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = supabaseAdmin ?? (await getRequestSupabaseClient());
    const params = request.nextUrl.searchParams;
    const selectedIds = readArrayParam(params, 'selected_id').slice(0, SELECTED_BUYERS_LIMIT);

    const [payload, selectedPayload] = await Promise.all([
      getCohortComposerBuyerResultset(db as any, claims.tenant_id, {
        q: params.get('q')?.trim() ?? '',
        geographies: readArrayParam(params, 'geography'),
        lastOrderBucket: (params.get('last_order') || undefined) as any,
        gmvBuckets: readArrayParam(params, 'gmv') as any,
        limit: parseRowsLimit(params.get('limit'), PAGE_SIZE.COMPOSER),
        cursor: params.get('cursor'),
        quickFilters: readArrayParam(params, 'quick') as any,
        status: (params.get('status') || null) as any,
        buyerAppFilter: (params.get('buyer_app') || null) as any,
        outstandingFilter: (params.get('outstanding') || null) as any,
        locationId: params.get('location_id') || null,
      }),
      selectedIds.length > 0
        ? getCohortComposerBuyerResultset(db as any, claims.tenant_id, { ids: selectedIds })
        : Promise.resolve(null),
    ]);

    return NextResponse.json(
      { ...payload, selected_buyers: selectedPayload?.buyers ?? [] },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (error: any) {
    console.error('[GET /api/cohorts/composer/buyers]', error?.code, error?.message);
    return NextResponse.json({ error: 'Failed to load cohort composer buyers' }, { status: 500 });
  }
}
