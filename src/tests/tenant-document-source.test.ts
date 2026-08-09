import { describe, expect, it } from 'vitest';

import {
  mapEstimateDocumentSource,
  mapInvoiceDocumentSource,
  mapOrderDocumentSource,
  resolveInvoiceLinkedLabel,
} from '@/lib/server/tenant-document-source';

describe('tenant-document-source', () => {
  it('maps zoho-import orders as direct without exposing raw source labels', () => {
    const result = mapOrderDocumentSource(
      { is_buyer_app_order: false, source: 'zoho_import', estimate_id: null },
      null,
    );

    expect(result).toEqual({
      source_kind: 'direct',
      source_label: null,
      source_detail: null,
      is_buyer_app: false,
    });
  });

  it('maps converted orders to estimate numbers and buyer-app converted detail', () => {
    const result = mapOrderDocumentSource(
      { is_buyer_app_order: true, source: 'buyer_app', estimate_id: 'est-1' },
      'EST-1001',
    );

    expect(result).toEqual({
      source_kind: 'converted',
      source_label: 'EST-1001',
      source_detail: 'BUYER_APP',
      is_buyer_app: true,
    });
  });

  it('maps invoices linked to orders without raw backend source text', () => {
    const linkedLabel = resolveInvoiceLinkedLabel(
      { order_id: 'order-1', estimate_id: null },
      new Map([['order-1', 'SO-2001']]),
      new Map(),
    );

    const result = mapInvoiceDocumentSource(
      { is_buyer_app_invoice: false, order_id: 'order-1', estimate_id: null },
      linkedLabel,
    );

    expect(result).toEqual({
      source_kind: 'converted',
      source_label: 'SO-2001',
      source_detail: null,
      is_buyer_app: false,
    });
  });

  it('maps buyer-app estimates without seller source labels', () => {
    const result = mapEstimateDocumentSource({ is_buyer_app_estimate: true, source: 'buyer_app' });

    expect(result).toEqual({
      source_kind: 'buyer_app',
      source_label: null,
      source_detail: null,
      is_buyer_app: true,
    });
  });
});
