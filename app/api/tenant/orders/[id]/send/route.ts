import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { getPostHogClient } from '@/lib/posthog-server';
import { fetchWhatsappNotificationContext } from '@/lib/server/notification-context';
import { sendOrderReceivedBuyer } from '@/lib/server/whatsapp';
import { supabaseAdmin } from '@/lib/supabase';

const SendSchema = z.object({
  channel: z.enum(['whatsapp', 'email', 'download']),
  recipient: z.string().min(1),
  message: z.string().min(1),
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

    const parsed = SendSchema.safeParse(body);
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
      .select('id, tenant_id, status, buyer_id, location_id, order_number, total_amount')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (order.status === 'cancelled' || order.status === 'delivered') {
      return NextResponse.json({ error: 'Cannot send a cancelled or delivered order.' }, { status: 400 });
    }

    const { count: itemCount } = await db
      .schema('app')
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', id)
      .is('deleted_at', null);

    if (parsed.data.channel === 'whatsapp') {
      const buyerId = (order.buyer_id as string | null) ?? null;
      if (!buyerId) {
        return NextResponse.json({ error: 'This order does not have a buyer linked yet.' }, { status: 400 });
      }

      const ctx = await fetchWhatsappNotificationContext(
        claims.tenant_id,
        buyerId,
        (order.location_id as string | null) ?? null,
        'order_placed',
      );
      if (!ctx) {
        return NextResponse.json({ error: 'WhatsApp send is unavailable for this order.' }, { status: 409 });
      }

      const sent = await sendOrderReceivedBuyer(
        ctx,
        id,
        String(order.order_number ?? ''),
        Number(order.total_amount ?? 0),
        itemCount ?? 0,
      );

      if (!sent) {
        return NextResponse.json({ error: 'Failed to send sales order via WhatsApp' }, { status: 409 });
      }
    }

    const { error: auditError } = await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'order',
      entity_id: id,
      action: 'order_sent',
      diff: {
        channel: parsed.data.channel,
        recipient: parsed.data.recipient,
        message: parsed.data.message,
      },
      ts: new Date().toISOString(),
    });

    if (auditError) {
      console.error('[PATCH /api/tenant/orders/[id]/send] audit', auditError);
      return NextResponse.json({ error: 'Failed to send sales order' }, { status: 500 });
    }

    getPostHogClient()?.capture({
      distinctId: claims.sub,
      event: 'seller_document_sent',
      properties: {
        tenant_id: claims.tenant_id,
        document_type: 'sales_order',
        document_id: id,
        buyer_id: order.buyer_id ?? null,
        location_id: order.location_id ?? null,
        channel: parsed.data.channel,
        status: order.status,
        total_amount: Number(order.total_amount ?? 0),
        item_count: itemCount ?? 0,
        role: claims.role,
      },
    });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('[PATCH /api/tenant/orders/[id]/send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
