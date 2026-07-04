/**
 * Instrumentation-only ledger writer for app.whatsapp_messages.
 *
 * Phase A (see DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.3 / §5.4): every
 * WhatsApp send — OTP, order notification, dispatch, or (later) broadcast —
 * writes exactly one row here so utility/auth consumption is tracked
 * identically to broadcast consumption once billing (Phase B) lands.
 *
 * This must never change existing send behavior: callers fire-and-forget
 * this after the real Meta send already happened (or failed), and any error
 * writing the ledger row is swallowed (logged, not thrown) so instrumentation
 * failures can't break a transactional message flow.
 *
 * Phase F addition (§4.7, §7.1): every ledger row this module writes also
 * gets a sibling app.whatsapp_send_queue row, so the pacing worker
 * (app.process_whatsapp_send_queue) has a priority lane to pull from.
 * priority=1 for OTP/transactional trigger sources, priority=5 for
 * broadcast-originated sends — this is derived automatically from
 * triggerSource so existing callers (Phase A's sendWhatsappTemplate /
 * sendLoginOtpWhatsapp in whatsapp.ts) don't need to change their call
 * signature. The queue row is only written when the message row itself was
 * written successfully and status is 'queued' or 'sent' — a 'failed' ledger
 * row (Meta send already failed) has nothing left to queue.
 */

export type WhatsAppMetaCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export type WhatsAppTriggerSource =
  | 'order_placed'
  | 'enquiry_received'
  | 'otp_login'
  | 'dispatch_notice'
  | 'broadcast';

// Trigger sources that must always jump the queue ahead of broadcasts
// (§7.1) — every other trigger source is treated as broadcast-priority.
const TRANSACTIONAL_TRIGGER_SOURCES: ReadonlySet<WhatsAppTriggerSource> = new Set([
  'otp_login',
  'order_placed',
  'enquiry_received',
  'dispatch_notice',
]);

const QUEUE_PRIORITY_TRANSACTIONAL = 1;
const QUEUE_PRIORITY_BROADCAST = 5;

function queuePriorityForTriggerSource(triggerSource: WhatsAppTriggerSource): number {
  return TRANSACTIONAL_TRIGGER_SOURCES.has(triggerSource)
    ? QUEUE_PRIORITY_TRANSACTIONAL
    : QUEUE_PRIORITY_BROADCAST;
}

export interface LogWhatsAppMessageInput {
  tenantId: string;
  buyerId?: string | null;
  recipientPhone: string;
  metaCategory: WhatsAppMetaCategory;
  triggerSource: WhatsAppTriggerSource;
  status: 'queued' | 'sent' | 'failed';
  providerMessageId?: string | null;
  failureReason?: string | null;
}

export async function logWhatsAppMessage(input: LogWhatsAppMessageInput): Promise<void> {
  try {
    // Imported lazily (not at module top-level) so environments without
    // Supabase credentials configured (e.g. unit tests that only exercise
    // the Meta send path) don't crash just by importing this module —
    // src/lib/supabase.ts throws at import time if credentials are missing.
    const { supabaseAdmin } = await import('@/lib/supabase');
    if (!supabaseAdmin) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: inserted, error } = await db
      .schema('app')
      .from('whatsapp_messages')
      .insert({
        tenant_id: input.tenantId,
        buyer_id: input.buyerId ?? null,
        recipient_phone: input.recipientPhone,
        meta_category: input.metaCategory,
        trigger_source: input.triggerSource,
        status: input.status,
        provider_message_id: input.providerMessageId ?? null,
        failure_reason: input.failureReason ?? null,
        sent_at: input.status === 'sent' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error || !inserted?.id) return;
    if (input.status === 'failed') return; // nothing left to enqueue

    await db
      .schema('app')
      .from('whatsapp_send_queue')
      .insert({
        tenant_id: input.tenantId,
        whatsapp_message_id: inserted.id,
        priority: queuePriorityForTriggerSource(input.triggerSource),
      });
  } catch (error) {
    // Instrumentation only — never let a ledger-write failure affect the
    // actual message send path.
    console.error('[whatsapp-ledger] failed to write app.whatsapp_messages row', error);
  }
}
