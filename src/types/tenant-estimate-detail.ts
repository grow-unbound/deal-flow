import type { EstimateDbStatus, EstimateStatusTone } from '@/types/tenant-estimates';

import type { EstimateComposerDocument } from './estimate-composer';

export interface EstimateDetailBuyer {
  id: string;
  name: string;
  payment_terms_days: number;
  credit_limit: number;
}

export interface EstimateDetailLineItem {
  id: string;
  tenant_product_id: string;
  product_name: string;
  sku: string;
  brand_name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
}

export interface EstimateDetailActivity {
  id: string;
  at: string;
  action: string;
  summary: string;
  diff: Record<string, unknown> | null;
}

export interface EstimateDetailPayload {
  id: string;
  estimate_number: string;
  status: EstimateDbStatus;
  status_label: string;
  status_tone: EstimateStatusTone;
  buyer: EstimateDetailBuyer;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  currency: string;
  notes: string | null;
  seller_note: string | null;
  expires_at: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  viewed_at: string | null;
  viewed_by_name: string | null;
  voided_at: string | null;
  estimate_version: number;
  converted_to_order_id: string | null;
  converted_to_invoice_id: string | null;
  linked_order_number: string | null;
  linked_invoice_number: string | null;
  items: EstimateDetailLineItem[];
  credit_used: number;
  credit_available: number;
  activity: EstimateDetailActivity[];
  /** JWT role for UI gating (e.g. seller_note edit). */
  viewer_role: string | null;
}

/** Merged GET `/api/tenant/estimates/[id]` payload (detail KPIs + composer document). */
export type TenantEstimateDetailResponse = Omit<EstimateDetailPayload, 'items'> & EstimateComposerDocument & {
  historical_items?: EstimateDetailLineItem[];
};
