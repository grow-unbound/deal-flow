import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { GET as getInvoicesLanding } from '../route';

export const dynamic = 'force-dynamic';

/**
 * O(1) KPI snapshot for the invoices landing page header cards.
 * Reads from the v2 landing payload so header cards stay aligned with the
 * same invoice semantics as the main landing page.
 * Fires in parallel with the paginated list fetch — cards render instantly.
 */
export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || !invoicesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const landingRes = await getInvoicesLanding(request);
    if (!landingRes.ok) {
      const body = await landingRes.json().catch(() => ({ error: 'Failed to fetch summary' }));
      return NextResponse.json(body, { status: landingRes.status });
    }

    const landing = await landingRes.json();
    const kpis = landing.kpis ?? {};

    return NextResponse.json(
      {
        total: kpis.invoices_this_period ?? 0,
        total_count: kpis.invoices_this_period ?? 0,
        outstanding_amt: kpis.outstanding_sum ?? 0,
        overdue_count: kpis.overdue_count ?? 0,
        overdue_amt: kpis.overdue_sum ?? 0,
        paid_count: null,
        refreshed_at: landing.as_of ?? null,
        as_of: landing.as_of ?? null,
        commercial_horizon_days: landing.commercial_horizon_days ?? null,
        table_period: landing.table_period ?? null,
      },
      { headers: SELLER_CACHE_PERSONAL },
    );
  } catch (e) {
    console.error('[GET /api/tenant/invoices/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
