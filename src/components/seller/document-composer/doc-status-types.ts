export type EstimateViewBandStatus =
  | 'draft'
  | 'sent'
  | 'converted'
  | 'expired'
  | 'void'
  | 'accepted'
  | 'declined'
  | 'invoiced';

export type InvoiceViewBandStatus = 'draft' | 'sent' | 'overdue' | 'paid' | 'void';

export type SalesOrderViewBandStatus =
  | 'draft'
  | 'received'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';
