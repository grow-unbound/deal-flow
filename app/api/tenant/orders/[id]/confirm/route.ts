import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';
import { getPostHogClient } from '@/lib/posthog-server';
import { withTenantSellerIds } from '@/lib/analytics-identity-server';

const ConfirmSchema = z.object({
  has_backorder: z.boolean().default(false),
  notify_buyer: z.boolean().optional(),
  qty_overrides: z.record(z.string().uuid(), z.number().positive()).optional(),
});

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
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = ConfirmSchema.safeParse(body);
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
    if (!['draft', 'received', 'confirmed'].includes(order.status)) {
      return NextResponse.json({ error: "Can't edit after dispatch." }, { status: 400 });
    }

    const qtyOverrides = parsed.data.qty_overrides;
    if (qtyOverrides && Object.keys(qtyOverrides).length > 0) {
      for (const [lineId, qty] of Object.entries(qtyOverrides)) {
        const { error: lineErr } = await db
          .schema('app')
          .from('order_items')
          .update({ qty, updated_at: new Date().toISOString(), updated_by: claims.sub })
          .eq('id', lineId)
          .eq('order_id', id);
        if (lineErr) {
          console.error('[PATCH confirm] qty_override update failed', lineErr);
          return NextResponse.json({ error: 'Failed to update line quantities' }, { status: 500 });
        }
      }
    }

    const rpcRes = await db.schema('app').rpc('confirm_order', { p_order_id: id });
    if (rpcRes.error) {
      console.error('[PATCH /api/tenant/orders/[id]/confirm] rpc', rpcRes.error);
      return NextResponse.json({ error: 'Failed to confirm sales order' }, { status: 500 });
    }

    const { error: updateError } = await db
      .schema('app')
      .from('orders')
      .update({
        has_backorder: parsed.data.has_backorder,
        updated_at: new Date().toISOString(),
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to confirm sales order' }, { status: 500 });
    }

    getPostHogClient()?.capture({
      distinctId: claims.sub ?? claims.tenant_id,
      event: 'sales_order_confirmed',
      properties: { ...withTenantSellerIds(claims), order_id: id },
    });

    return NextResponse.json({
      data: {
        id,
        redirect_path: `/sales-orders/${id}`,
      },
    });
  } catch (error) {
    console.error('[PATCH /api/tenant/orders/[id]/confirm]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
