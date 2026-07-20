import {
  estimateStatusPresentation,
  nextEstimateStatusAfterSend,
  normalizeEstimateStatus,
} from '@/lib/estimates/estimate-status-presentation';
import { effectiveInvoiceStatus } from '@/lib/invoice-status';
import { toSalesOrderUiStatus } from '@/lib/sales-orders/tenant-order-detail';
import type { EstimateComposerDocument, EstimateSendChannel } from '@/types/estimate-composer';
import type { TenantEstimateDetailResponse } from '@/types/tenant-estimate-detail';
import type { InvoiceDetailResponse } from '@/types/tenant-invoices';
import type { SalesOrderDetail } from '@/types/tenant-sales-orders';

function pickString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function patchEstimateDetailFromRow(
  prev: TenantEstimateDetailResponse,
  record: Record<string, unknown>,
): TenantEstimateDetailResponse {
  const status = normalizeEstimateStatus(pickString(record.status) ?? prev.status);
  const meta = estimateStatusPresentation(status);

  return {
    ...prev,
    status,
    status_label: meta.label,
    status_tone: meta.tone,
    sent_at: pickString(record.sent_at) ?? prev.sent_at,
    sent_channel: (pickString(record.sent_channel) as EstimateSendChannel | null) ?? prev.sent_channel,
    accepted_at: pickString(record.accepted_at) ?? prev.accepted_at,
    voided_at: pickString(record.voided_at) ?? prev.voided_at,
  };
}

export function patchEstimateComposerFromRow(
  prev: EstimateComposerDocument,
  record: Record<string, unknown>,
): EstimateComposerDocument {
  const status = normalizeEstimateStatus(pickString(record.status) ?? prev.status);

  return {
    ...prev,
    status,
    sent_at: pickString(record.sent_at) ?? prev.sent_at,
    sent_channel: (pickString(record.sent_channel) as EstimateSendChannel | null) ?? prev.sent_channel,
  };
}

export function patchEstimateSentOptimistic(
  prev: TenantEstimateDetailResponse,
  channel: EstimateSendChannel,
  sentAt = new Date().toISOString(),
): TenantEstimateDetailResponse {
  const status = nextEstimateStatusAfterSend(prev.status);
  const meta = estimateStatusPresentation(status);

  return {
    ...prev,
    status,
    status_label: meta.label,
    status_tone: meta.tone,
    sent_at: sentAt,
    sent_channel: channel,
  };
}

export function patchEstimateComposerSentOptimistic(
  prev: EstimateComposerDocument,
  channel: EstimateSendChannel,
  sentAt = new Date().toISOString(),
): EstimateComposerDocument {
  return {
    ...prev,
    status: nextEstimateStatusAfterSend(prev.status),
    sent_at: sentAt,
    sent_channel: channel,
  };
}

export function patchInvoiceDetailFromRow(
  prev: InvoiceDetailResponse,
  record: Record<string, unknown>,
): InvoiceDetailResponse {
  const dbStatus = pickString(record.status) ?? prev.db_status;
  const effectiveStatus = effectiveInvoiceStatus({
    status: dbStatus,
    due_date: prev.due_date,
    outstanding_balance: prev.amount_outstanding,
  });

  return {
    ...prev,
    db_status: dbStatus,
    status: effectiveStatus,
    sent_at: pickString(record.sent_at) ?? prev.sent_at,
    paid_at: pickString(record.paid_at) ?? prev.paid_at,
    voided_at: pickString(record.voided_at) ?? prev.voided_at,
  };
}

export function patchInvoiceSentOptimistic(
  prev: InvoiceDetailResponse,
  sentAt = new Date().toISOString(),
): InvoiceDetailResponse {
  if (prev.db_status !== 'draft') return prev;

  return {
    ...prev,
    db_status: 'sent',
    status: 'sent',
    sent_at: sentAt,
  };
}

export function patchSalesOrderDetailFromRow(
  prev: SalesOrderDetail,
  record: Record<string, unknown>,
): SalesOrderDetail {
  const dbStatus = pickString(record.status) ?? prev.db_status;
  const uiStatus = toSalesOrderUiStatus(dbStatus) ?? prev.ui_status;

  return {
    ...prev,
    db_status: dbStatus,
    ui_status: uiStatus,
    received_at: pickString(record.received_at) ?? prev.received_at,
    confirmed_at: pickString(record.confirmed_at) ?? prev.confirmed_at,
    dispatched_at: pickString(record.dispatched_at) ?? prev.dispatched_at,
    delivered_at: pickString(record.delivered_at) ?? prev.delivered_at,
    cancelled_at: pickString(record.cancelled_at) ?? prev.cancelled_at,
  };
}
