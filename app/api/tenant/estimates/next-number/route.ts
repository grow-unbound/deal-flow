import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

function formatEstimateNumber(sequence: number): string {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
  }).format(new Date());
  return `EST-${year}-${String(sequence).padStart(5, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
    ]);
    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const estimateCountRes = await db
      .schema('app')
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', claims.tenant_id);

    if (estimateCountRes.error) {
      console.error('[GET /api/tenant/estimates/next-number]', estimateCountRes.error);
      return NextResponse.json({ error: 'Failed to resolve next estimate number' }, { status: 500 });
    }

    return NextResponse.json({
      estimate_number: formatEstimateNumber((estimateCountRes.count ?? 0) + 1),
    });
  } catch (error) {
    console.error('[GET /api/tenant/estimates/next-number]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
