import type { SellerLandingPeriodMeta } from '@/lib/seller-period';
import type { LandingFilterMeta } from '@/lib/landing-filter-params';

export type InvoiceStatusValue = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type InvoiceStatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type InvoiceAvatarHue = 'teal' | 'ember' | 'cream';

export type InvoiceFilterChip = 'All' | 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Void';

export interface InvoiceLinkedDoc {
  type: 'order' | 'estimate' | 'direct';
  label: string;
  href?: string;
}

export interface InvoiceLandingRow {
  id: string;
  location_id: string | null;
  location_name: string | null;
  invoice_number: string;
  buyer_id: string;
  buyer_name: string;
  place_of_supply: string | null;
  buyer_city: string | null;
  buyer_state: string | null;
  buyer_initials: string;
  buyer_hue: InvoiceAvatarHue;
  order_id: string | null;
  estimate_id: string | null;
  source_kind: 'buyer_app' | 'converted' | 'direct';
  source_label: string;
  source_detail: string;
  campaign_name: string | null;
  created_by_label: string | null;
  items_count: number;
  total_amount: number;
  outstanding_amount: number;
  invoice_date: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  status: {
    value: InvoiceStatusValue;
    label: string;
    tone: InvoiceStatusTone;
    filter_chip: InvoiceFilterChip;
  };
  linked: InvoiceLinkedDoc;
}

export interface InvoiceCalloutRow {
  id: string;
  invoice_number: string;
  buyer_id: string;
  buyer_name: string;
  buyer_initials: string;
  buyer_hue: InvoiceAvatarHue;
  buyer_city: string | null;
  buyer_state: string | null;
  items_count: number;
  total_amount: number;
  outstanding_amount: number;
  due_date: string | null;
  paid_at: string | null;
  invoice_date: string;
  effective: InvoiceStatusValue;
}

export interface InvoiceTopRiserRow {
  buyer_id: string;
  buyer_name: string;
  buyer_initials: string;
  buyer_hue: InvoiceAvatarHue;
  buyer_city: string | null;
  buyer_state: string | null;
  current_gmv: number;
  previous_gmv: number;
  delta_gmv: number;
}

export interface InvoicesKpis {
  invoices_this_period: number;
  invoices_prev_period: number;
  invoices_growth_pct: number;
  gmv_this_period: number;
  gmv_prev_period: number;
  aov: number;
  overdue_count: number;
  overdue_sum: number;
  outstanding_count: number;
  outstanding_sum: number;
}

export interface InvoicesTodaysRead {
  needs_attention: InvoiceCalloutRow[];
  top_spenders: InvoiceCalloutRow[];
  top_risers: InvoiceTopRiserRow[];
}

export interface TenantInvoicesResponse {
  period: SellerLandingPeriodMeta;
  kpis: InvoicesKpis;
  todays_read: InvoicesTodaysRead;
  invoices: InvoiceLandingRow[];
  filters?: LandingFilterMeta;
}

/** --- Detail (EP-16-002) --- */

export interface InvoiceDetailBuyer {
  business_name: string;
  contact_name: string | null;
  gstin: string | null;
  geography: Record<string, unknown> | null;
  credit_limit: number;
  payment_terms_days: number;
}

export interface InvoiceDetailTenant {
  business_name: string;
  gstin: string | null;
  primary_state: string | null;
  payment_instructions: string;
  inventory_hold_point: string | null;
}

export interface InvoiceDetailLine {
  id: string;
  product_name: string;
  hsn_code: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number | null;
  line_total: number | null;
}

export interface InvoiceDetailTaxBreakdown {
  taxable_value: number;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  is_intra_state: boolean;
}

export interface InvoiceDetailLinkedOrder {
  type: 'order';
  order_id: string;
  order_number: string;
  placed_at: string | null;
}

export interface InvoiceDetailLinkedEstimate {
  type: 'estimate';
  estimate_id: string;
  estimate_number: string | null;
}

export interface InvoiceDetailLinkedDirect {
  type: 'direct';
}

export type InvoiceDetailLinked = InvoiceDetailLinkedOrder | InvoiceDetailLinkedEstimate | InvoiceDetailLinkedDirect;

export type InvoiceActivityKind =
  | 'created'
  | 'sent'
  | 'reminder'
  | 'payment'
  | 'overdue'
  | 'pdf'
  | 'void';

export interface InvoiceDetailActivity {
  kind: InvoiceActivityKind;
  title: string;
  detail: string;
  who: string;
  at: string;
}

export interface InvoiceDetailCredit {
  used: number;
  limit: number;
  pct: number;
  available: number;
}

/** GET /api/tenant/invoices/[id] — EP-17-006 flat composer detail (preferred). Legacy nested shape remains as `InvoiceDetailPayload` for older consumers. */
export type InvoiceDetailViewerRole = 'seller_admin' | 'seller_assistant';

export interface InvoiceDetailGstRowDto {
  label: string;
  rate_pct: number;
  amount: number;
  token: 'cgst' | 'sgst' | 'igst';
}

export interface InvoiceDetailTotalsDto {
  subtotal: number;
  discount_amt: number;
  taxable: number;
  tax_amount: number;
  freight: number;
  round_off: number;
  grand_total: number;
  gst_rows: InvoiceDetailGstRowDto[];
}

export interface InvoiceDetailItemDto {
  id?: string;
  tenant_product_id: string;
  product_name: string;
  sku: string;
  brand_name: string;
  brand_initials: string;
  brand_hue: 'teal' | 'ember' | 'cream';
  hsn: string | null;
  qty: number;
  unit: string;
  rate: number;
  mrp: number;
  discount_pct: number;
  line_total: number;
  tax_pct: number | null;
}

export interface InvoiceDetailBuyerDto {
  id: string;
  name: string;
  gstin: string | null;
  gstin_state_code: string | null;
  city: string | null;
  credit_limit: number;
  credit_used: number;
  payment_terms_days: number;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  bill_address: string;
  state: string | null;
  pincode: string | null;
  place_of_supply: string;
  seller_state: string | null;
  active_pricelist: { id: string; name: string } | null;
  sales_agent_name: string | null;
}

export interface InvoicePaymentRecordDto {
  id: string;
  amount: number;
  paid_at: string;
  payment_method: string | null;
  payment_reference: string | null;
}

export interface InvoiceDetailResponse {
  id: string;
  doc_number: string;
  location_id: string | null;
  location_name: string | null;
  db_status: string;
  status: InvoiceStatusValue;
  version: number;
  invoice_date: string;
  due_date: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  viewed_by_name: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  amount_outstanding: number;
  amount_paid: number;
  voided_at: string | null;
  last_reminder_at: string | null;
  gstin_locked: boolean;
  hsn_locked: boolean;
  place_of_supply: string;
  buyer_po_ref: string | null;
  intra_state_tax: boolean;
  buyer_id: string | null;
  buyer: InvoiceDetailBuyerDto;
  items: InvoiceDetailItemDto[];
  totals: InvoiceDetailTotalsDto;
  order_id: string | null;
  estimate_id: string | null;
  linked_order_number: string | null;
  linked_estimate_number: string | null;
  viewer_role: InvoiceDetailViewerRole;
  seller_note: string;
  payments: InvoicePaymentRecordDto[];
}

export interface InvoiceDetailPayload {
  delivery_label: string;
  fleet_mode: string;
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    effective_status: InvoiceStatusValue;
    invoice_date: string;
    due_date: string | null;
    paid_at: string | null;
    payment_reference: string | null;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    outstanding_balance: number;
    order_id: string | null;
    estimate_id: string | null;
    created_at: string;
  };
  buyer: InvoiceDetailBuyer;
  tenant: InvoiceDetailTenant;
  items: InvoiceDetailLine[];
  tax_breakdown: InvoiceDetailTaxBreakdown;
  linked: InvoiceDetailLinked;
  credit: InvoiceDetailCredit;
  activity: InvoiceDetailActivity[];
}
