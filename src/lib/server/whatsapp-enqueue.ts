/**
 * Enqueue-first WhatsApp send pipeline.
 * Spec: DealFlow_WhatsApp-Broadcast-Spec_v4.md §5
 *
 * Callers insert app.whatsapp_messages (status=queued) + app.whatsapp_send_queue,
 * then synchronously invoke the dispatch worker with explicit message ids.
 */

import type { WhatsAppMetaCategory, WhatsAppTriggerSource } from '@/lib/server/whatsapp-ledger';

export interface WhatsAppSendPayload {
  meta_template_name: string;
  locale: string;
  body_params: Array<{ text: string; parameter_name?: string }>;
  header_params?: { type: 'image'; media_id?: string; link?: string };
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

async function lookupApprovedTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  metaTemplateName: string,
): Promise<{ id: string; locale: string } | null> {
  const { data, error } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, locale')
    .eq('meta_template_name', metaTemplateName)
    .eq('approval_status', 'approved')
    .is('tenant_id', null)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data?.id) return null;
  return {
    id: data.id as string,
    locale: (data.locale as string | null) ?? 'en',
  };
}

export async function lookupApprovedTemplateMeta(
  metaTemplateName: string,
): Promise<{ id: string; locale: string } | null> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    if (!supabaseAdmin) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return lookupApprovedTemplate(supabaseAdmin as any, metaTemplateName);
  } catch {
    return null;
  }
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

    const db = supabaseAdmin as any;
    const { data, error } = await db
      .schema('app')
      .rpc('enqueue_whatsapp_message', {
        p_tenant_id: input.tenantId,
        p_buyer_id: input.buyerId ?? null,
        p_recipient_phone: input.recipientPhone,
        p_meta_category: input.metaCategory,
        p_trigger_source: input.triggerSource,
        p_send_payload: input.sendPayload,
        p_whatsapp_broadcast_id: input.whatsappBroadcastId ?? null,
        p_related_entity_type: input.relatedEntityType ?? null,
        p_related_entity_id: input.relatedEntityId ?? null,
        p_priority: queuePriorityForTriggerSource(input.triggerSource, input.priority),
        p_scheduled_send_at: input.scheduledSendAt ?? null,
      });

    if (error) {
      console.error('[whatsapp-enqueue] insert failed', error);
      return { messageId: null, enqueued: false, skipped: 'no_db' };
    }

    const result = (data ?? null) as {
      message_id?: string | null;
      enqueued?: boolean;
      skipped?: 'duplicate' | 'no_db' | 'no_template';
    } | null;
    if (!result) return { messageId: null, enqueued: false, skipped: 'no_db' };

    return {
      messageId: result.message_id ?? null,
      enqueued: result.enqueued === true,
      skipped: result.skipped,
    };
  } catch (err) {
    console.error('[whatsapp-enqueue] unexpected error', err);
    return { messageId: null, enqueued: false, skipped: 'no_db' };
  }
}

export interface WhatsAppDispatchResult {
  ok: boolean;
  dispatched: number;
  failed: number;
  skipped: number;
}

/**
 * Synchronously POST explicit messages to the Supabase Edge sender. The DB
 * prepares/debits each row; the Edge Function only performs Meta HTTP.
 */
export async function triggerWhatsAppDispatch(
  messageIds: Array<string | null | undefined>,
): Promise<WhatsAppDispatchResult | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const ids = [...new Set(messageIds.filter((id): id is string => Boolean(id)))];

  if (!supabaseUrl || ids.length === 0) return null;

  const url = `${supabaseUrl}/functions/v1/whatsapp-dispatch-worker`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { 'Authorization': `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({ message_ids: ids }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('[whatsapp-enqueue] dispatch trigger non-ok', res.status, text);
      return null;
    }

    return (text ? JSON.parse(text) : null) as WhatsAppDispatchResult | null;
  } catch (err) {
    console.error('[whatsapp-enqueue] dispatch trigger failed', err);
    return null;
  }
}

export function triggerWhatsAppDispatchSoon(messageIds: Array<string | null | undefined>): void {
  void triggerWhatsAppDispatch(messageIds);
}
