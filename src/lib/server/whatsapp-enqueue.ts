/**
 * Enqueue-first WhatsApp send pipeline.
 * Spec: DealFlow_WhatsApp-Broadcast-Spec_v4.md §5
 *
 * Callers insert app.whatsapp_messages (status=queued) + app.whatsapp_send_queue,
 * then trigger the dispatch worker — never call Meta directly.
 */

import type { WhatsAppMetaCategory, WhatsAppTriggerSource } from '@/lib/server/whatsapp-ledger';

export interface WhatsAppSendPayload {
  meta_template_name: string;
  locale: string;
  body_params: Array<{ text: string; parameter_name?: string }>;
  button_params?: Array<{ type: 'url'; index: string; text: string }>;
}

export interface EnqueueWhatsAppMessageInput {
  tenantId: string;
  buyerId?: string | null;
  recipientPhone: string;
  metaCategory: WhatsAppMetaCategory;
  triggerSource: WhatsAppTriggerSource;
  sendPayload: WhatsAppSendPayload;
  whatsappBroadcastId?: string | null;
  relatedEntityType?: 'estimates' | 'orders' | null;
  relatedEntityId?: string | null;
  priority?: 1 | 5;
  scheduledSendAt?: string | null;
}

export interface EnqueueWhatsAppMessageResult {
  messageId: string | null;
  enqueued: boolean;
  skipped?: 'duplicate' | 'no_db' | 'no_template';
}

const TRANSACTIONAL_TRIGGER_SOURCES: ReadonlySet<WhatsAppTriggerSource> = new Set([
  'otp_login',
  'order_placed',
  'enquiry_received',
  'dispatch_notice',
]);

const QUEUE_PRIORITY_TRANSACTIONAL = 1;
const QUEUE_PRIORITY_BROADCAST = 5;

function queuePriorityForTriggerSource(
  triggerSource: WhatsAppTriggerSource,
  override?: 1 | 5,
): number {
  if (override !== undefined) return override;
  return TRANSACTIONAL_TRIGGER_SOURCES.has(triggerSource)
    ? QUEUE_PRIORITY_TRANSACTIONAL
    : QUEUE_PRIORITY_BROADCAST;
}

async function lookupTemplateId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  metaTemplateName: string,
): Promise<string | null> {
  const { data, error } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id')
    .eq('meta_template_name', metaTemplateName)
    .eq('approval_status', 'approved')
    .is('tenant_id', null)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

export function getPlatformTenantId(): string | null {
  return process.env.WHATSAPP_PLATFORM_TENANT_ID?.trim() || null;
}

export async function enqueueWhatsAppMessage(
  input: EnqueueWhatsAppMessageInput,
): Promise<EnqueueWhatsAppMessageResult> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    if (!supabaseAdmin) return { messageId: null, enqueued: false, skipped: 'no_db' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const whatsappTemplateId = await lookupTemplateId(
      db,
      input.sendPayload.meta_template_name,
    );

    const insertRow: Record<string, unknown> = {
      tenant_id: input.tenantId,
      buyer_id: input.buyerId ?? null,
      recipient_phone: input.recipientPhone,
      whatsapp_template_id: whatsappTemplateId,
      whatsapp_broadcast_id: input.whatsappBroadcastId ?? null,
      meta_category: input.metaCategory,
      trigger_source: input.triggerSource,
      status: 'queued',
      send_payload: input.sendPayload,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    };

    const { data: inserted, error } = await db
      .schema('app')
      .from('whatsapp_messages')
      .insert(insertRow)
      .select('id')
      .single();

    if (error) {
      // Idempotency: duplicate transaction notification for same entity+recipient
      if (error.code === '23505' && input.relatedEntityId) {
        const { data: existing } = await db
          .schema('app')
          .from('whatsapp_messages')
          .select('id')
          .eq('tenant_id', input.tenantId)
          .eq('trigger_source', input.triggerSource)
          .eq('related_entity_id', input.relatedEntityId)
          .eq('recipient_phone', input.recipientPhone)
          .not('status', 'eq', 'failed')
          .maybeSingle();

        return {
          messageId: (existing?.id as string | undefined) ?? null,
          enqueued: false,
          skipped: 'duplicate',
        };
      }
      console.error('[whatsapp-enqueue] insert failed', error);
      return { messageId: null, enqueued: false, skipped: 'no_db' };
    }

    if (!inserted?.id) return { messageId: null, enqueued: false, skipped: 'no_db' };

    const priority = queuePriorityForTriggerSource(input.triggerSource, input.priority);
    await db
      .schema('app')
      .from('whatsapp_send_queue')
      .insert({
        tenant_id: input.tenantId,
        whatsapp_message_id: inserted.id,
        priority,
        scheduled_send_at: input.scheduledSendAt ?? new Date().toISOString(),
      });

    return { messageId: inserted.id as string, enqueued: true };
  } catch (err) {
    console.error('[whatsapp-enqueue] unexpected error', err);
    return { messageId: null, enqueued: false, skipped: 'no_db' };
  }
}

/**
 * Fire-and-forget POST to the dispatch edge function so priority-1 messages
 * don't wait for the 2-minute pg_cron pacing tick.
 */
export function triggerWhatsAppDispatch(): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const secret = process.env.INTEGRATIONS_PUSH_SECRET?.trim()
    ?? process.env.INTEGRATIONS_DISPATCH_SECRET?.trim();

  if (!supabaseUrl) return;

  const url = `${supabaseUrl}/functions/v1/whatsapp-dispatch-worker`;
  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-push-secret': secret } : {}),
    },
    body: JSON.stringify({ trigger: 'transactional' }),
  })
    .then(async (res) => {
      // #region agent log
      fetch('http://127.0.0.1:7499/ingest/42159701-4a5a-4229-9bc0-a9348f871657', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e901a3' },
        body: JSON.stringify({
          sessionId: 'e901a3',
          location: 'whatsapp-enqueue.ts:triggerWhatsAppDispatch',
          message: 'dispatch worker response',
          data: {
            status: res.status,
            ok: res.ok,
            hasSecret: Boolean(secret),
            hypothesisId: 'H1-auth',
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!res.ok) {
        console.error('[whatsapp-enqueue] dispatch trigger non-ok', res.status);
      }
    })
    .catch((err) => {
      console.error('[whatsapp-enqueue] dispatch trigger failed', err);
    });
}
