import type { NextRequest } from 'next/server';
import { getPostHogClient } from '@/lib/posthog-server';

export function postHogCorrelationFromRequest(request: NextRequest) {
  return {
    browser_distinct_id: request.headers.get('x-posthog-distinct-id')?.trim() || null,
    posthog_session_id: request.headers.get('x-posthog-session-id')?.trim() || null,
  };
}

export function captureAuthoritativeBuyerDemand(params: {
  request: NextRequest;
  event: 'inquiry_created' | 'order_placed';
  tenantId: string;
  buyerId: string;
  documentId: string;
  documentNumber: string | null;
  documentType: 'estimate' | 'order';
  totalAmount: number;
  itemCount: number;
  lineProductIds: string[];
  campaignId?: string | null;
  estimateType?: string | null;
}): void {
  try {
    const ph = getPostHogClient();
    const correlation = postHogCorrelationFromRequest(params.request);
    ph.capture({
      distinctId: correlation.browser_distinct_id ?? params.buyerId,
      event: params.event,
      properties: {
        tenant_id: params.tenantId,
        buyer_id: params.buyerId,
        document_id: params.documentId,
        document_number: params.documentNumber,
        document_type: params.documentType,
        estimate_id: params.documentType === 'estimate' ? params.documentId : undefined,
        estimate_number: params.documentType === 'estimate' ? params.documentNumber : undefined,
        order_id: params.documentType === 'order' ? params.documentId : undefined,
        order_number: params.documentType === 'order' ? params.documentNumber : undefined,
        item_count: params.itemCount,
        total_amount: params.totalAmount,
        line_product_ids: params.lineProductIds,
        source: 'buyer_app',
        source_channel: 'storefront',
        campaign_id: params.campaignId ?? null,
        estimate_type: params.estimateType ?? null,
        buyer_distinct_id: params.buyerId,
        posthog_distinct_id: correlation.browser_distinct_id,
        posthog_session_id: correlation.posthog_session_id,
      },
    });
    void ph.flush().catch(() => {});
  } catch {
    // non-blocking
  }
}
