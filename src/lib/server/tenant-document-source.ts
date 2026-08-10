export type TenantDocumentSourceKind = 'buyer_app' | 'converted' | 'direct' | 'seller';

export interface TenantDocumentSourceFields {
  source_kind: TenantDocumentSourceKind;
  source_label: string | null;
  source_detail: string | null;
  is_buyer_app: boolean;
}

export function mapEstimateDocumentSource(row: {
  is_buyer_app_estimate?: boolean | null;
  source?: string | null;
}): TenantDocumentSourceFields {
  const isBuyerApp = Boolean(row.is_buyer_app_estimate || row.source === 'buyer_app');
  return {
    source_kind: isBuyerApp ? 'buyer_app' : 'seller',
    source_label: null,
    source_detail: null,
    is_buyer_app: isBuyerApp,
  };
}

export function mapOrderDocumentSource(
  row: {
    is_buyer_app_order?: boolean | null;
    source?: string | null;
    estimate_id?: string | null;
  },
  estimateNumber: string | null | undefined,
): TenantDocumentSourceFields {
  const isBuyerAppOrder = Boolean(row.is_buyer_app_order || row.source === 'buyer_app');
  const convertedEstimateNumber = estimateNumber?.trim() || null;
  const hasConvertedEstimate = Boolean(convertedEstimateNumber);
  const sourceKind = hasConvertedEstimate ? 'converted' : isBuyerAppOrder ? 'buyer_app' : 'direct';
  const sourceDetail = hasConvertedEstimate && isBuyerAppOrder ? 'BUYER_APP' : null;

  return {
    source_kind: sourceKind,
    source_label: convertedEstimateNumber,
    source_detail: sourceDetail,
    is_buyer_app: sourceKind === 'buyer_app' || sourceDetail === 'BUYER_APP',
  };
}

export function resolveInvoiceLinkedLabel(
  row: { order_id?: string | null; estimate_id?: string | null },
  orderNumberById: Map<string, string>,
  estimateNumberById: Map<string, string>,
): string | null {
  if (row.order_id) {
    return orderNumberById.get(String(row.order_id)) ?? null;
  }
  if (row.estimate_id) {
    return estimateNumberById.get(String(row.estimate_id)) ?? null;
  }
  return null;
}

export function mapInvoiceDocumentSource(
  row: {
    is_buyer_app_invoice?: boolean | null;
    order_id?: string | null;
    estimate_id?: string | null;
  },
  linkedLabel: string | null,
): TenantDocumentSourceFields {
  const convertedLabel = linkedLabel?.trim() || null;
  const sourceKind = convertedLabel ? 'converted' : row.is_buyer_app_invoice ? 'buyer_app' : 'direct';
  const sourceDetail = convertedLabel && row.is_buyer_app_invoice ? 'BUYER_APP' : null;

  return {
    source_kind: sourceKind,
    source_label: convertedLabel,
    source_detail: sourceDetail,
    is_buyer_app: sourceKind === 'buyer_app' || sourceDetail === 'BUYER_APP',
  };
}
