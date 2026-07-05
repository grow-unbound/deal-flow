import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_NONE } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export async function GET(request: NextRequest) {
  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id || !claims.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, salesOrders] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
    ]);
    if (!orderMgmt || !salesOrders) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as DbClient;
    const tenantId = claims.tenant_id;

    const { data: existingOrders, error: countError } = await db
      .schema('app')
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (countError) {
      console.error('[GET /api/tenant/orders/next-number]', countError);
      return NextResponse.json({ error: 'Failed to resolve next order number' }, { status: 500 });
    }

    const orderNumber = `SO-${new Date().getFullYear()}-${String((existingOrders ?? []).length + 1).padStart(5, '0')}`;
    return NextResponse.json({ order_number: orderNumber }, { headers: SELLER_CACHE_NONE });
  } catch (error) {
    console.error('[GET /api/tenant/orders/next-number]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
