import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag, salesOrdersFlag, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
      getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || (!estimatesFlag && !salesOrdersFlag && !invoicesFlag)) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '8'), 12);
    const db = supabaseAdmin as any;

    let builder = db
      .schema('app')
      .from('buyers')
      .select('id, business_name, geography')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('business_name', { ascending: true })
      .limit(limit);

    if (query.length > 0) {
      builder = builder.ilike('business_name', `%${query}%`);
    }

    const { data, error } = await builder;
    if (error) {
      console.error('[GET /api/tenant/buyers/search]', error);
      return NextResponse.json({ error: 'Failed to search buyers' }, { status: 500 });
    }

    const buyers = ((data ?? []) as Array<{
      id: string;
      business_name: string;
      geography: Record<string, unknown> | null;
    }>).map((row) => ({
      id: row.id,
      business_name: row.business_name,
      place_of_supply: typeof row.geography?.state === 'string' && row.geography.state.trim()
        ? row.geography.state.trim()
        : 'Unknown',
    }));

    return NextResponse.json({ buyers });
  } catch (error) {
    console.error('[GET /api/tenant/buyers/search]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
