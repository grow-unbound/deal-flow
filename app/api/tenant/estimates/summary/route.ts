import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { GET as getEstimatesLanding } from '@/app/api/tenant/estimates/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const estimatesEnabled = await getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id);
    if (!estimatesEnabled) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const landingRes = await getEstimatesLanding(request);
    if (!landingRes.ok) {
      const body = await landingRes.json().catch(() => ({ error: 'Failed to fetch summary' }));
      return NextResponse.json(body, { status: landingRes.status });
    }

    const landing = await landingRes.json();
    const kpis = landing.kpis ?? {};

    return NextResponse.json(
      {
        total_count: kpis.total_estimates_this_period ?? 0,
        draft_count: kpis.open_drafts ?? 0,
        sent_count: kpis.open_sent ?? 0,
        accepted_count: kpis.open_accepted ?? 0,
        total_value: kpis.total_gmv_this_period ?? 0,
        accepted_value: null,
        expiring_soon: kpis.expiring_soon ?? 0,
        refreshed_at: null,
      },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (e) {
    console.error('[GET /api/tenant/estimates/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
