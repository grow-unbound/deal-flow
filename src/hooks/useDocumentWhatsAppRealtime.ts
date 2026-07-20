'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  patchEstimateComposerFromRow,
  patchEstimateComposerSentOptimistic,
  patchEstimateDetailFromRow,
  patchEstimateSentOptimistic,
  patchInvoiceDetailFromRow,
  patchInvoiceSentOptimistic,
  patchSalesOrderDetailFromRow,
} from '@/lib/documents/document-detail-cache-patches';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { EstimateComposerDocument } from '@/types/estimate-composer';
import type { TenantEstimateDetailResponse } from '@/types/tenant-estimate-detail';
import type { InvoiceDetailResponse } from '@/types/tenant-invoices';
import type { SalesOrderDetail } from '@/types/tenant-sales-orders';

export type TransactionalDocumentKind = 'estimate' | 'invoice' | 'order';

const DOCUMENT_CONFIG = {
  estimate: {
    table: 'estimates',
    relatedEntityType: 'estimates',
    detailQueryKey: (id: string) => ['tenant-estimate-detail', id] as const,
    composerQueryKey: (id: string) => ['tenant-estimate-composer', id] as const,
    listQueryKeys: [['tenant-estimates'], ['tenant-estimates-infinite']] as const,
  },
  invoice: {
    table: 'invoices',
    relatedEntityType: 'invoices',
    detailQueryKey: (id: string) => ['tenant-invoice', id] as const,
    composerQueryKey: (id: string) => ['tenant-invoice-composer', id] as const,
    listQueryKeys: [['tenant-invoices']] as const,
  },
  order: {
    table: 'orders',
    relatedEntityType: 'orders',
    detailQueryKey: (id: string) => ['tenant-sales-order', id] as const,
    composerQueryKey: (id: string) => ['tenant-sales-order-composer', id] as const,
    listQueryKeys: [['tenant-orders']] as const,
  },
} as const;

const TERMINAL_WHATSAPP_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

function invalidateDocumentListQueries(qc: QueryClient, kind: TransactionalDocumentKind) {
  const cfg = DOCUMENT_CONFIG[kind];
  for (const queryKey of cfg.listQueryKeys) {
    void qc.invalidateQueries({ queryKey });
  }
}

function patchDocumentCachesFromRow(
  qc: QueryClient,
  kind: TransactionalDocumentKind,
  documentId: string,
  record: Record<string, unknown>,
) {
  const cfg = DOCUMENT_CONFIG[kind];

  if (kind === 'estimate') {
    const detail = qc.getQueryData<TenantEstimateDetailResponse>(cfg.detailQueryKey(documentId));
    if (detail) {
      qc.setQueryData(cfg.detailQueryKey(documentId), patchEstimateDetailFromRow(detail, record));
    }

    const composer = qc.getQueryData<EstimateComposerDocument>(cfg.composerQueryKey(documentId));
    if (composer) {
      qc.setQueryData(cfg.composerQueryKey(documentId), patchEstimateComposerFromRow(composer, record));
    }
    return;
  }

  if (kind === 'invoice') {
    const detail = qc.getQueryData<InvoiceDetailResponse>(cfg.detailQueryKey(documentId));
    if (detail) {
      qc.setQueryData(cfg.detailQueryKey(documentId), patchInvoiceDetailFromRow(detail, record));
    }
    return;
  }

  const detail = qc.getQueryData<SalesOrderDetail>(cfg.detailQueryKey(documentId));
  if (detail) {
    qc.setQueryData(cfg.detailQueryKey(documentId), patchSalesOrderDetailFromRow(detail, record));
  }
}

function patchSentCachesFromWhatsApp(
  qc: QueryClient,
  kind: TransactionalDocumentKind,
  documentId: string,
  sentAt: string,
) {
  const cfg = DOCUMENT_CONFIG[kind];

  if (kind === 'estimate') {
    const detail = qc.getQueryData<TenantEstimateDetailResponse>(cfg.detailQueryKey(documentId));
    if (detail) {
      qc.setQueryData(
        cfg.detailQueryKey(documentId),
        patchEstimateSentOptimistic(detail, 'whatsapp', sentAt),
      );
    }

    const composer = qc.getQueryData<EstimateComposerDocument>(cfg.composerQueryKey(documentId));
    if (composer) {
      qc.setQueryData(
        cfg.composerQueryKey(documentId),
        patchEstimateComposerSentOptimistic(composer, 'whatsapp', sentAt),
      );
    }
    return;
  }

  if (kind === 'invoice') {
    const detail = qc.getQueryData<InvoiceDetailResponse>(cfg.detailQueryKey(documentId));
    if (detail) {
      qc.setQueryData(cfg.detailQueryKey(documentId), patchInvoiceSentOptimistic(detail, sentAt));
    }
  }
}

function handleDocumentRowUpdate(
  qc: QueryClient,
  kind: TransactionalDocumentKind,
  documentId: string,
  tenantId: string,
  record: Record<string, unknown>,
) {
  if (record.tenant_id !== tenantId) return;

  patchDocumentCachesFromRow(qc, kind, documentId, record);
  invalidateDocumentListQueries(qc, kind);
}

function handleWhatsAppMessageUpdate(
  qc: QueryClient,
  kind: TransactionalDocumentKind,
  documentId: string,
  tenantId: string,
  record: Record<string, unknown>,
  handledKeys: Set<string>,
) {
  if (record.tenant_id !== tenantId) return;
  if (record.related_entity_id !== documentId) return;
  if (record.related_entity_type !== DOCUMENT_CONFIG[kind].relatedEntityType) return;

  const messageId = typeof record.id === 'string' ? record.id : null;
  const status = typeof record.status === 'string' ? record.status : null;
  if (!messageId || !status || !TERMINAL_WHATSAPP_STATUSES.has(status)) return;

  const dedupeKey = `${messageId}:${status}`;
  if (handledKeys.has(dedupeKey)) return;
  handledKeys.add(dedupeKey);

  if (status === 'failed') {
    const reason = typeof record.failure_reason === 'string'
      ? record.failure_reason
      : 'WhatsApp send failed';
    toast.error(reason);
    invalidateDocumentListQueries(qc, kind);
    return;
  }

  const sentAt = typeof record.sent_at === 'string' ? record.sent_at : new Date().toISOString();
  if (kind === 'estimate' || kind === 'invoice') {
    patchSentCachesFromWhatsApp(qc, kind, documentId, sentAt);
  }

  invalidateDocumentListQueries(qc, kind);
}

export function useDocumentWhatsAppRealtime({
  kind,
  documentId,
  tenantId,
  enabled = true,
}: {
  kind: TransactionalDocumentKind;
  documentId: string;
  tenantId: string | null | undefined;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const handledKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !tenantId || !documentId) return;

    const cfg = DOCUMENT_CONFIG[kind];
    const handledKeys = handledKeysRef.current;

    const channel = supabaseBrowser
      .channel(`document-whatsapp:${kind}:${documentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'app',
          table: cfg.table,
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          handleDocumentRowUpdate(
            qc,
            kind,
            documentId,
            tenantId,
            payload.new as Record<string, unknown>,
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'app',
          table: 'whatsapp_messages',
          filter: `related_entity_id=eq.${documentId}`,
        },
        (payload) => {
          handleWhatsAppMessageUpdate(
            qc,
            kind,
            documentId,
            tenantId,
            payload.new as Record<string, unknown>,
            handledKeys,
          );
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [documentId, enabled, kind, qc, tenantId]);
}
