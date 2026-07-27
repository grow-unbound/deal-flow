'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  patchEstimateComposerFromRow,
  patchEstimateDetailFromRow,
  patchInvoiceDetailFromRow,
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

// WhatsApp delivery-status realtime (whatsapp_messages) was decommissioned along with
// the rest of the whatsapp/integration realtime path — no more live "sent/delivered"
// toast or optimistic patch here; the next manual refresh of the document shows the
// current status. Document-row-update realtime is kept, re-plumbed onto the single
// consolidated app.realtime_notifications table.
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

  useEffect(() => {
    if (!enabled || !tenantId || !documentId) return;

    const channel = supabaseBrowser
      .channel(`document-whatsapp:${kind}:${documentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'app',
          table: 'realtime_notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const row = payload.new as { entity_type: string; entity_id: string; payload: Record<string, unknown> };
          if (row.entity_type !== DOCUMENT_CONFIG[kind].table) return;
          if (row.entity_id !== documentId) return;
          handleDocumentRowUpdate(qc, kind, documentId, tenantId, row.payload);
        },
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [documentId, enabled, kind, qc, tenantId]);
}
