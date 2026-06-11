import { effectiveInvoiceStatus } from '@/lib/invoice-status';

import type { EstimateViewBandStatus, InvoiceViewBandStatus, SalesOrderViewBandStatus } from './doc-status-types';

export type { EstimateViewBandStatus, InvoiceViewBandStatus, SalesOrderViewBandStatus } from './doc-status-types';

export function resolveEstimateBandStatus(status: string, validUntilYmd: string | null): EstimateViewBandStatus {
  if (status === 'void') return 'void';
  if (status === 'converted' || status === 'invoiced') return 'converted';
  if (status === 'expired') return 'expired';
  if (validUntilYmd) {
    const end = new Date(`${validUntilYmd}T23:59:59.000Z`).getTime();
    if (!Number.isNaN(end) && end < Date.now() && (status === 'sent' || status === 'accepted')) return 'expired';
  }
  if (status === 'accepted') return 'accepted';
  if (status === 'sent') return 'sent';
  if (status === 'declined') return 'declined';
  return 'draft';
}

export function estimateBandChipClass(status: EstimateViewBandStatus): string {
  switch (status) {
    case 'sent':
    case 'accepted':
      return 'doc-status--sent';
    case 'converted':
    case 'invoiced':
      return 'doc-status--converted';
    case 'expired':
      return 'doc-status--expired';
    case 'void':
      return 'doc-status--void';
    case 'declined':
      return 'doc-status--expired';
    default:
      return 'doc-status--draft';
  }
}

export function resolveInvoiceBandStatus(dbStatus: string, dueDate: string | null): InvoiceViewBandStatus {
  return effectiveInvoiceStatus({ status: dbStatus, due_date: dueDate });
}

export function invoiceBandChipClass(status: InvoiceViewBandStatus): string {
  switch (status) {
    case 'sent':
      return 'doc-status--sent';
    case 'paid':
      return 'doc-status--paid';
    case 'overdue':
      return 'doc-status--overdue';
    case 'void':
      return 'doc-status--void';
    default:
      return 'doc-status--draft';
  }
}

export function resolveSalesOrderBandStatus(dbStatus: string, uiStatus: string): SalesOrderViewBandStatus {
  if (dbStatus === 'draft') return 'draft';
  if (uiStatus === 'cancelled' || dbStatus === 'cancelled') return 'cancelled';
  if (uiStatus === 'delivered') return 'delivered';
  if (uiStatus === 'dispatched') return 'dispatched';
  if (uiStatus === 'confirmed') return 'confirmed';
  if (uiStatus === 'received') return 'received';
  return 'received';
}

export function salesOrderBandChipClass(s: SalesOrderViewBandStatus): string {
  switch (s) {
    case 'received':
      return 'doc-status--received';
    case 'confirmed':
      return 'doc-status--confirmed';
    case 'dispatched':
      return 'doc-status--dispatched';
    case 'delivered':
      return 'doc-status--delivered';
    case 'cancelled':
      return 'doc-status--cancelled';
    default:
      return 'doc-status--draft';
  }
}
