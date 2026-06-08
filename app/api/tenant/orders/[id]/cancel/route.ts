import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS, ROLES } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';
import { CancelSalesOrderBodySchema } from '@/types/tenant-sales-orders';

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
    if (claims.role === ROLES.SELLER_ASSISTANT) {
      return NextResponse.json({ error: 'Only seller admins can cancel orders.' }, { status: 403 });
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
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = CancelSalesOrderBodySchema.safeParse(body);
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
    if (!['received', 'confirmed'].includes(order.status)) {
      return NextResponse.json({ error: 'This order can no longer be cancelled.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const reasonLabel = parsed.data.reason;
    const notes = parsed.data.notes?.trim() || null;

    const { error: updateError } = await db
      .schema('app')
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: nowIso,
        cancel_reason: [reasonLabel, notes].filter(Boolean).join(' — ') || reasonLabel,
        updated_at: nowIso,
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (updateError) {
      console.error('[PATCH cancel]', updateError);
      return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
    }

    const { error: rpcError } = await db.schema('app').rpc('release_order_reservation', { p_order_id: id });
    if (rpcError) {
      console.error('[PATCH cancel] release_order_reservation', rpcError);
    }

    const { error: auditError } = await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'order',
      entity_id: id,
      action: 'status_change',
      diff: { status: 'cancelled', reason: reasonLabel, notes },
      ts: nowIso,
    });
    if (auditError) {
      console.error('[PATCH cancel] audit', auditError);
    }

    return NextResponse.json({ data: { id, status: 'cancelled' } });
  } catch (error) {
    console.error('[PATCH /api/tenant/orders/[id]/cancel]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
