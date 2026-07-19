/**
 * @deprecated Post-send ledger logging — superseded by enqueue-first pipeline in
 * whatsapp-enqueue.ts. Kept for type exports and any legacy callers during migration.
 *
 * New sends must use enqueueWhatsAppMessage() which inserts status='queued'.
 */

export type WhatsAppMetaCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export type WhatsAppTriggerSource =
  | 'order_placed'
  | 'enquiry_received'
  | 'estimate_update'
  | 'invoice_update'
  | 'payment_reminder'
  | 'otp_login'
  | 'dispatch_notice'
  | 'broadcast';

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

/** @deprecated Use enqueueWhatsAppMessage from whatsapp-enqueue.ts */
export async function logWhatsAppMessage(_input: LogWhatsAppMessageInput): Promise<void> {
  console.warn('[whatsapp-ledger] logWhatsAppMessage is deprecated — use enqueueWhatsAppMessage');
}
