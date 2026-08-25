import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { getPostHogClient } from '@/lib/posthog-server';
import { createBroadcastRow } from '@/lib/server/whatsapp-broadcast-create';

/**
 * Re-target the not-notified recipients of a completed/paced broadcast as a
 * new follow-up broadcast, reusing the original template + variable
 * bindings. "Not notified" defaults to queued-only (still waiting their
 * turn, e.g. deferred by the daily cap); the caller can opt in to also
 * include real 'failed' rows via include_failed. opted_out/blocked
 * recipients are never included — re-messaging them is a compliance
 * problem, not just wasted spend.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (claims.role !== 'seller_admin') {
    return NextResponse.json({ error: 'Forbidden: seller_admin only' }, { status: 403 });
  }

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const includeFailed = Boolean((body as { include_failed?: unknown } | null)?.include_failed);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: original, error: originalError } = await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .select('id, name, whatsapp_template_id, use_case, linked_campaign_id, variable_bindings')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (originalError || !original) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  }

  const targetStatuses = includeFailed ? ['queued', 'failed'] : ['queued'];

  const { data: messageRows, error: messagesError } = await db
    .schema('app')
    .from('whatsapp_messages')
    .select('buyer_id')
    .eq('whatsapp_broadcast_id', id)
    .eq('tenant_id', claims.tenant_id)
    .in('status', targetStatuses)
    .not('buyer_id', 'is', null)
    .is('deleted_at', null);

  if (messagesError) {
    console.error('[POST /api/whatsapp/broadcasts/[id]/retarget] messages error:', messagesError.message);
    return NextResponse.json({ error: 'Failed to resolve not-notified recipients' }, { status: 500 });
  }

  const buyerIds = [...new Set(((messageRows ?? []) as Array<{ buyer_id: string }>).map((r) => r.buyer_id))];

  if (buyerIds.length === 0) {
    return NextResponse.json({ error: 'No not-notified recipients to re-target' }, { status: 400 });
  }

  const { data: template, error: templateError } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_template_name, meta_category, approval_status, use_case, locale, variables, button_config, buttons_config, header_config, is_broadcast_template')
    .eq('id', original.whatsapp_template_id)
    .or(`tenant_id.is.null,tenant_id.eq.${claims.tenant_id}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (templateError || !template || template.approval_status !== 'approved') {
    return NextResponse.json({ error: 'Original template is no longer approved for sending' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const { broadcast, recipientCount, messageIds } = await createBroadcastRow(db, {
      tenantId: claims.tenant_id,
      createdBy: claims.sub,
      name: `${original.name} — retarget (${today})`,
      template,
      useCase: original.use_case,
      targetType: 'buyer_selection',
      targetBuyerIds: buyerIds,
      linkedCampaignId: original.linked_campaign_id ?? null,
      variableBindings: original.variable_bindings ?? {},
      scheduledFor: null,
    });

    getPostHogClient()?.capture({
      distinctId: claims.sub ?? claims.tenant_id,
      event: 'whatsapp_broadcast_retargeted',
      properties: {
        tenant_id: claims.tenant_id,
        original_broadcast_id: id,
        new_broadcast_id: broadcast.id,
        include_failed: includeFailed,
        recipient_count: recipientCount,
        message_count: messageIds.length,
        role: claims.role,
      },
    });

    return NextResponse.json({
      broadcast,
      recipient_count: recipientCount,
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/whatsapp/broadcasts/[id]/retarget] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create retarget broadcast' },
      { status: 500 },
    );
  }
}
