export type WhatsAppDocumentSendBlockReason =
  | 'insufficient_credits'
  | 'missing_buyer_phone'
  | 'invalid_buyer_phone'
  | 'missing_seller_phone'
  | 'missing_template'
  | 'unavailable';

export interface WhatsAppDocumentSendState {
  can_send: boolean;
  block_reason: WhatsAppDocumentSendBlockReason | null;
  block_message: string | null;
  credits_balance: number;
  required_credits: number;
  recipient_phone: string | null;
  template_name: string;
  seller_name: string | null;
  seller_phone_display: string | null;
}

export interface WhatsAppInvoiceReminderState extends WhatsAppDocumentSendState {
  due_invoice_count: string;
  outstanding_amount: string;
  due_status: string;
  preview_message: string;
}
