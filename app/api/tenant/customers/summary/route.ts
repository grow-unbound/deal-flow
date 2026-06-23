import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * O(1) KPI snapshot for the customers landing page header cards.
 * Reads from app.customers_snapshot which is kept current by DB triggers.
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

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .schema('app')
      .from('customers_snapshot')
      .select('active_count, tier_a_count, tier_b_count, tier_c_count, refreshed_at')
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/tenant/customers/summary]', error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ total: null }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error('[GET /api/tenant/customers/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
