import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';
import { DispatchSalesOrderBodySchema } from '@/types/tenant-sales-orders';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = DispatchSalesOrderBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;

    const { data: order, error: orderError } = await db
      .schema('app')
      .from('orders')
      .select('id, tenant_id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['confirmed', 'partially_dispatched'].includes(order.status)) {
      return NextResponse.json({ error: 'Order must be confirmed before dispatch.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await db
      .schema('app')
      .from('orders')
      .update({
        status: 'dispatched',
        dispatched_at: nowIso,
        carrier: parsed.data.carrier?.trim() || null,
        dispatch_notes: parsed.data.notes?.trim() || null,
        updated_at: nowIso,
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (updateError) {
      console.error('[PATCH dispatch]', updateError);
      return NextResponse.json({ error: 'Failed to dispatch order' }, { status: 500 });
    }

    const { error: auditError } = await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'order',
      entity_id: id,
      action: 'status_change',
      diff: {
        status: 'dispatched',
        carrier: parsed.data.carrier ?? null,
        notify_buyer: parsed.data.notify_buyer ?? false,
      },
      ts: nowIso,
    });
    if (auditError) {
      console.error('[PATCH dispatch] audit', auditError);
    }

    return NextResponse.json({ data: { id, status: 'dispatched' } });
  } catch (error) {
    console.error('[PATCH /api/tenant/orders/[id]/dispatch]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
