import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

export const dynamic = 'force-dynamic';

/**
 * O(1) KPI snapshot for the invoices landing page header cards.
 * Reads from app.invoices_snapshot which is kept current by DB triggers.
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

    const { data, error } = await supabaseAdmin
      .schema('app')
      .from('invoices_snapshot')
      .select('total_count, outstanding_amt, overdue_count, overdue_amt, paid_count, refreshed_at')
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/tenant/invoices/summary]', error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ total: null }, { status: 404 });
    }

    return NextResponse.json(data, { headers: SELLER_CACHE_PERSONAL });
  } catch (e) {
    console.error('[GET /api/tenant/invoices/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
