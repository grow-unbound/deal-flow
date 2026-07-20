import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { sendBuyerDocumentWhatsApp } from '@/lib/server/whatsapp-document-send';
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

    const [orderMgmt, estimatesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
    ]);
    if (!orderMgmt || !estimatesFlag) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = SendSchema.safeParse(body);
    const isLegacyPayload = parsed.success;
    if (!isLegacyPayload && body && typeof body === 'object' && Object.keys(body as Record<string, unknown>).length > 0) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const { data: estimate, error: estimateError } = await db
      .schema('app')
      .from('estimates')
      .select('id, tenant_id')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (estimateError || !estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }
    if (estimate.tenant_id !== claims.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (isLegacyPayload && parsed.data.channel !== 'whatsapp') {
      const { error: updateError } = await db
        .schema('app')
        .from('estimates')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_channel: parsed.data.channel,
          updated_at: new Date().toISOString(),
          updated_by: claims.sub,
        })
        .eq('id', id)
        .eq('tenant_id', claims.tenant_id);

      if (updateError) {
        console.error('[PATCH /api/tenant/estimates/[id]/send] legacy update error', updateError);
        return NextResponse.json({ error: 'Failed to send estimate' }, { status: 500 });
      }

      await db.schema('app').from('audit_log').insert({
        tenant_id: claims.tenant_id,
        actor_user_id: claims.sub,
        entity_type: 'estimate',
        entity_id: id,
        action: 'estimate_sent',
        diff: {
          channel: parsed.data.channel,
          recipient: parsed.data.recipient,
        },
        ts: new Date().toISOString(),
      });

      return NextResponse.json({ data: { id } });
    }

    const { data: fullEstimate, error: fullEstimateError } = await db
      .schema('app')
      .from('estimates')
      .select('id, tenant_id, buyer_id, estimate_number, total_amount')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (fullEstimateError || !fullEstimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
    }

    const { count: itemCount } = await db
      .schema('app')
      .from('estimate_items')
      .select('id', { count: 'exact', head: true })
      .eq('estimate_id', id)
      .is('deleted_at', null);

    const sendResult = await sendBuyerDocumentWhatsApp(db, {
      kind: 'estimate',
      tenantId: claims.tenant_id,
      buyerId: (fullEstimate.buyer_id as string | null) ?? null,
      documentId: id,
      documentNumber: String(fullEstimate.estimate_number ?? ''),
      totalAmount: Number(fullEstimate.total_amount ?? 0),
      itemCount: itemCount ?? 0,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        { error: sendResult.state.block_message ?? 'Failed to send estimate', code: sendResult.state.block_reason },
        { status: 409 },
      );
    }

    const { error: sentUpdateError } = await db
      .schema('app')
      .from('estimates')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_channel: 'whatsapp',
        updated_at: new Date().toISOString(),
        updated_by: claims.sub,
      })
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id);

    if (sentUpdateError) {
      console.error('[PATCH /api/tenant/estimates/[id]/send] whatsapp update error', sentUpdateError);
      return NextResponse.json({ error: 'Failed to mark estimate as sent' }, { status: 500 });
    }

    await db.schema('app').from('audit_log').insert({
      tenant_id: claims.tenant_id,
      actor_user_id: claims.sub,
      entity_type: 'estimate',
      entity_id: id,
      action: 'estimate_sent',
      diff: {
        channel: 'whatsapp',
        recipient: sendResult.recipientPhone,
      },
      ts: new Date().toISOString(),
    });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error('[PATCH /api/tenant/estimates/[id]/send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
