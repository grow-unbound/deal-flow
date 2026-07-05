import { effectiveInvoiceStatus } from '@/lib/invoice-status';

export type BuyerOrderStatusChip = 'All' | 'Received' | 'Confirmed' | 'In Transit' | 'Delivered' | 'Cancelled';
export type BuyerEstimateStatusChip = 'All' | 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Expired' | 'Converted';
export type BuyerInvoiceStatusChip = 'All' | 'Due' | 'Overdue' | 'Paid' | 'Void';

export const BUYER_ORDER_STATUS_CHIPS: BuyerOrderStatusChip[] = [
  'All', 'Received', 'Confirmed', 'In Transit', 'Delivered', 'Cancelled',
];

export const BUYER_ESTIMATE_STATUS_CHIPS: BuyerEstimateStatusChip[] = [
  'All', 'Draft', 'Sent', 'Accepted', 'Declined', 'Expired', 'Converted',
];

export const BUYER_INVOICE_STATUS_CHIPS: BuyerInvoiceStatusChip[] = [
  'All', 'Due', 'Overdue', 'Paid', 'Void',
];

const ORDER_CHIP_STATUSES: Record<Exclude<BuyerOrderStatusChip, 'All'>, string[]> = {
  Received: ['received'],
  Confirmed: ['confirmed'],
  'In Transit': ['partially_dispatched', 'dispatched'],
  Delivered: ['delivered'],
  Cancelled: ['cancelled'],
};

const ESTIMATE_CHIP_STATUSES: Record<Exclude<BuyerEstimateStatusChip, 'All'>, string[]> = {
  Draft: ['draft'],
  Sent: ['sent'],
  Accepted: ['accepted'],
  Declined: ['declined'],
  Expired: ['expired'],
  Converted: ['converted', 'invoiced'],
};

export function matchesOrderStatusChip(status: string, chip: BuyerOrderStatusChip): boolean {
  if (chip === 'All') return true;
  return ORDER_CHIP_STATUSES[chip].includes(status);
}

export function matchesEstimateStatusChip(status: string, chip: BuyerEstimateStatusChip): boolean {
  if (chip === 'All') return true;
  return ESTIMATE_CHIP_STATUSES[chip].includes(status);
}

export function matchesInvoiceStatusChip(
  invoice: { status: string; due_date: string | null; outstanding_balance: number | null },
  chip: BuyerInvoiceStatusChip,
): boolean {
  if (chip === 'All') return true;
  const effective = effectiveInvoiceStatus({ status: invoice.status, due_date: invoice.due_date });
  if (chip === 'Paid') return effective === 'paid';
  if (chip === 'Void') return effective === 'void';
  if (chip === 'Overdue') return effective === 'overdue';
  return effective === 'sent' && (invoice.outstanding_balance ?? 0) > 0;
}
