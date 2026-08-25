/**
 * Shared broadcast-row creation, extracted from POST /api/whatsapp/broadcasts
 * so the retarget-not-notified flow (POST /api/whatsapp/broadcasts/[id]/retarget)
 * reuses the exact same audience resolution, cap-snapshot, enqueue, and
 * capped-dispatch logic instead of a second copy that could drift.
 */

import { resolveBroadcastAudience } from '@/lib/server/whatsapp-broadcast-audience';
import { buildBroadcastMessageQueue } from '@/lib/server/whatsapp-broadcast-send';
import { enqueueWhatsAppMessage, triggerWhatsAppDispatch, triggerWhatsAppQueueSweepSoon } from '@/lib/server/whatsapp-enqueue';
import type { WhatsAppBroadcastTargetType } from '@/lib/zod';

// The dispatch worker only ever attempts up to MAX_MESSAGE_IDS per request
// (supabase/functions/whatsapp-dispatch-worker/index.ts) — cap the initial
// synchronous kick to match it explicitly. Anything beyond this is already
// a durable 'pending' row; the whatsapp-queue-sweep-worker cron drains it.
const INITIAL_DISPATCH_BATCH = 50;

export interface TemplateForBroadcast {
  id: string;
  meta_template_name: string;
  meta_category: 'marketing' | 'utility' | 'authentication';
  approval_status: 'pending' | 'approved' | 'rejected' | 'disabled';
  use_case: string;
  locale: string | null;
  variables: Array<{ key: string; description?: string }>;
  button_config: { type?: 'url'; variable_source?: string } | null;
  buttons_config?: Array<{ type?: 'url'; index?: string; variable_source?: string; url_template?: string }> | null;
  header_config?: { format?: string } | null;
}

export interface CreateBroadcastRowInput {
  tenantId: string;
  createdBy?: string | null;
  name: string;
  template: TemplateForBroadcast;
  useCase: string;
  targetType: WhatsAppBroadcastTargetType;
  targetCohortId?: string | null;
  targetFilter?: Record<string, string | number> | null;
  targetBuyerIds?: string[] | null;
  linkedCampaignId?: string | null;
  variableBindings?: Record<string, string>;
  scheduledFor?: string | null;
}

export interface CreateBroadcastRowResult {
  broadcast: {
    id: string;
    name: string;
    status: string;
    estimated_recipient_count: number;
    actual_recipient_count: number;
    scheduled_for: string | null;
    created_at: string;
  };
  recipientCount: number;
  messageIds: string[];
}

/**
 * Resolves the audience, inserts the app.whatsapp_broadcasts row (with the
 * tenant's current daily_broadcast_cap snapshotted onto it), snapshots
 * per-recipient app.whatsapp_messages + app.whatsapp_send_queue rows, and
 * kicks off the first synchronous dispatch batch. Throws on any failure —
 * callers decide how to surface it (matches the original POST handler's
 * try/catch shape).
 */
export async function createBroadcastRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: CreateBroadcastRowInput,
): Promise<CreateBroadcastRowResult> {
  const eligibleBuyerIds = await resolveBroadcastAudience(db, {
    tenantId: input.tenantId,
    targetType: input.targetType,
    targetCohortId: input.targetCohortId,
    targetFilter: input.targetFilter,
    targetBuyerIds: input.targetBuyerIds,
  });

  const { data: limitsRow } = await db
    .schema('app')
    .from('tenant_broadcast_limits')
    .select('daily_broadcast_cap')
    .eq('tenant_id', input.tenantId)
    .maybeSingle();
  // Same fallback prepare_whatsapp_message_for_send uses when no row exists.
  const dailyCapAtCreation = limitsRow?.daily_broadcast_cap ?? 100;

  const { data: broadcast, error: insertError } = await db
    .schema('app')
    .from('whatsapp_broadcasts')
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      whatsapp_template_id: input.template.id,
      use_case: input.useCase,
      target_type: input.targetType,
      target_cohort_id: input.targetCohortId ?? null,
      target_filter: input.targetFilter ?? null,
      target_buyer_ids: input.targetBuyerIds ?? null,
      linked_campaign_id: input.linkedCampaignId ?? null,
      variable_bindings: input.variableBindings ?? {},
      status: input.scheduledFor ? 'scheduled' : 'sending',
      scheduled_for: input.scheduledFor ?? null,
      estimated_recipient_count: eligibleBuyerIds.length,
      actual_recipient_count: 0,
      daily_cap_at_creation: dailyCapAtCreation,
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null,
    })
    .select('id, name, status, estimated_recipient_count, actual_recipient_count, scheduled_for, created_at')
    .single();

  if (insertError || !broadcast) {
    throw new Error(insertError?.message ?? 'Failed to create broadcast');
  }

  const queueInputs = await buildBroadcastMessageQueue(db, {
    tenantId: input.tenantId,
    whatsappBroadcastId: broadcast.id as string,
    buyerIds: eligibleBuyerIds,
    template: input.template,
    variableBindings: input.variableBindings ?? {},
    linkedCampaignId: input.linkedCampaignId ?? null,
    scheduledSendAt: input.scheduledFor ?? null,
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
      updated_by: input.createdBy ?? null,
    })
    .eq('id', broadcast.id);

  if (!input.scheduledFor) {
    await triggerWhatsAppDispatch(messageIds.slice(0, INITIAL_DISPATCH_BATCH));

    // Overflow beyond the first batch — drain it now instead of waiting on
    // the rare cron backstop. Fire-and-forget: don't hold the HTTP response
    // for however long a large broadcast's sweep takes.
    if (messageIds.length > INITIAL_DISPATCH_BATCH) {
      triggerWhatsAppQueueSweepSoon();
    }
  }

  return {
    broadcast: {
      ...broadcast,
      actual_recipient_count: queueInputs.length,
      estimated_recipient_count: queueInputs.length,
    },
    recipientCount: queueInputs.length,
    messageIds,
  };
}
