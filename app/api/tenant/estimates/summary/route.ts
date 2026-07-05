import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedClaims } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';

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

    const { data, error } = await supabaseAdmin
      .schema('app')
      .from('estimates_snapshot')
      .select('total_count, draft_count, sent_count, accepted_count, total_value, accepted_value, expiring_soon, refreshed_at')
      .eq('tenant_id', claims.tenant_id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/tenant/estimates/summary]', error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ total_count: null }, { status: 404 });
    }

    return NextResponse.json(data, { headers: SELLER_CACHE_PERSONAL });
  } catch (e) {
    console.error('[GET /api/tenant/estimates/summary]', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
