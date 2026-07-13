import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { FEATURE_FLAGS } from '@/constants';
import { WhatsAppBroadcastCreateSchema } from '@/lib/zod';
import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { buildBroadcastMessageQueue } from '@/lib/server/whatsapp-broadcast-send';
import { enqueueWhatsAppMessage, triggerWhatsAppDispatch } from '@/lib/server/whatsapp-enqueue';

/**
 * WhatsApp Broadcast Phase E — broadcast job list + create.
 *
 * Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.2, §8, §9.
 *
 * GET  — lightweight broadcast history (last ~20 rows) for the Customers page
 *        secondary tab. Both seller_admin and seller_assistant can read.
 * POST — create a broadcast row. seller_admin only (§8), re-verified here at
 *        the API layer in addition to the RLS INSERT policy (belt+suspenders,
 *        same pattern as app/api/customers/import/route.ts).
 *
 * POST now performs the enqueue-first send handoff:
 * resolves audience, creates the broadcast row, snapshots the buyer/template
 * payloads into app.whatsapp_messages + app.whatsapp_send_queue, and triggers
 * the dispatch worker for immediate sends.
 */
export async function GET(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag(FEATURE_FLAGS.WHATSAPP_BROADCAST, claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .select(
      'id, name, use_case, target_type, status, scheduled_for, estimated_recipient_count, actual_recipient_count, created_at',
    )
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[GET /api/whatsapp/broadcasts] DB error:', error.code, error.message);
    return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: rows ?? [] }, { headers: SELLER_CACHE_PERSONAL });
}

export async function POST(request: NextRequest) {
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only send/create (spec §8) — checked here at the API layer in
  // addition to the RLS INSERT policy on app.whatsapp_broadcasts.
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = WhatsAppBroadcastCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  if (input.scheduled_for && new Date(input.scheduled_for).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: template, error: templateError } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_template_name, meta_category, approval_status, use_case, locale, variables, button_config, buttons_config, header_config, is_broadcast_template')
    .eq('id', input.whatsapp_template_id)
    .or(`tenant_id.is.null,tenant_id.eq.${claims.tenant_id}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (templateError || !template) {
    return NextResponse.json({ error: 'Invalid or inaccessible template' }, { status: 400 });
  }
  if (template.approval_status !== 'approved') {
    return NextResponse.json({ error: 'Template is not approved for sending yet' }, { status: 400 });
  }
  if (!template.is_broadcast_template) {
    return NextResponse.json({ error: 'This template cannot be used for broadcasts' }, { status: 400 });
  }

  try {
    const eligibleBuyerIds = await resolveBroadcastAudience(db, {
      tenantId: claims.tenant_id,
      targetType: input.target_type,
      targetCohortId: input.target_cohort_id,
      targetFilter: input.target_filter,
      targetBuyerIds: input.target_buyer_ids,
    });

    const { data: broadcast, error: insertError } = await db
      .schema('app')
      .from('whatsapp_broadcasts')
      .insert({
        tenant_id: claims.tenant_id,
        name: input.name,
        whatsapp_template_id: input.whatsapp_template_id,
        use_case: input.use_case,
        target_type: input.target_type,
        target_cohort_id: input.target_cohort_id ?? null,
        target_filter: input.target_filter ?? null,
        target_buyer_ids: input.target_buyer_ids ?? null,
        linked_campaign_id: input.linked_campaign_id ?? null,
        variable_bindings: input.variable_bindings ?? {},
        status: input.scheduled_for ? 'scheduled' : 'sending',
        scheduled_for: input.scheduled_for ?? null,
        estimated_recipient_count: eligibleBuyerIds.length,
        actual_recipient_count: 0,
        daily_cap_at_creation: null,
        created_by: claims.sub,
        updated_by: claims.sub,
      })
      .select('id, name, status, estimated_recipient_count, actual_recipient_count, scheduled_for, created_at')
      .single();

    if (insertError) {
      console.error('[POST /api/whatsapp/broadcasts] insert error:', insertError.code, insertError.message);
      return NextResponse.json({ error: 'Failed to create broadcast' }, { status: 500 });
    }

    const queueInputs = await buildBroadcastMessageQueue(db, {
      tenantId: claims.tenant_id,
      whatsappBroadcastId: broadcast.id as string,
      buyerIds: eligibleBuyerIds,
      template: template as {
        id: string;
        meta_template_name: string;
        meta_category: 'marketing' | 'utility' | 'authentication';
        approval_status: 'pending' | 'approved' | 'rejected' | 'disabled';
        use_case: string;
        locale: string | null;
        variables: Array<{ key: string; description?: string }>;
        button_config: { type?: 'url'; variable_source?: string } | null;
      },
      variableBindings: input.variable_bindings ?? {},
      linkedCampaignId: input.linked_campaign_id ?? null,
      scheduledSendAt: input.scheduled_for ?? null,
    });

    const messageIds: string[] = [];
    for (const queueInput of queueInputs) {
      const result = await enqueueWhatsAppMessage(queueInput);
      if (!result.enqueued) {
        throw new Error('Failed to enqueue one or more broadcast messages');
      }
      if (result.messageId) messageIds.push(result.messageId);
    }

    await db
      .schema('app')
      .from('whatsapp_broadcasts')
      .update({
        actual_recipient_count: queueInputs.length,
        estimated_recipient_count: queueInputs.length,
        updated_by: claims.sub,
      })
      .eq('id', broadcast.id);

    if (!input.scheduled_for) {
      await triggerWhatsAppDispatch(messageIds);
    }

    return NextResponse.json({
      broadcast: {
        ...broadcast,
        actual_recipient_count: queueInputs.length,
        estimated_recipient_count: queueInputs.length,
      },
      recipient_count: queueInputs.length,
      note: input.scheduled_for
        ? 'Broadcast scheduled. Messages are queued and will start sending at the selected time.'
        : 'Broadcast queued. Messages are now in the WhatsApp dispatch pipeline.',
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/whatsapp/broadcasts] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create broadcast' },
      { status: 500 },
    );
  }
}
