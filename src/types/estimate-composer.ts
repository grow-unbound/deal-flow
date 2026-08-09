export type EstimateComposerCreditTone = 'success' | 'warning' | 'danger';

export type EstimateComposerMode = 'create' | 'edit';

export type EstimateComposerKind = 'estimate' | 'so' | 'invoice';

export type EstimateSendChannel = 'whatsapp' | 'email' | 'download';

export interface ComposerLocationOption {
  id: string;
  name: string;
  is_default: boolean;
}

export interface EstimateComposerBuyerContext {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  bill_address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  place_of_supply: string;
  seller_state: string | null;
  payment_terms_days: number;
  credit_limit: number | null;
  credit_used: number;
  credit_available: number;
  active_pricelist: {
    id: string;
    name: string;
  } | null;
  sales_agent_name: string | null;
}

export interface EstimateComposerPriceListOption {
  id: string;
  name: string;
}

export interface EstimateComposerProductSearchRow {
  tenant_product_id: string;
  product_name: string;
  sku: string;
  brand_name: string;
  brand_initials: string;
  brand_hue: 'teal' | 'ember' | 'cream';
  hsn_code: string | null;
  tax_pct: number | null;
  on_hand: number;
  unit_price: number;
  mrp: number;
  base_selling_price: number;
  default_uom: string | null;
  pack_size: number | null;
}

export interface EstimateComposerLineInput {
  id: string;
  tenant_product_id: string;
  product_name: string;
  sku: string;
  brand_name: string;
  brand_initials: string;
  brand_hue: 'teal' | 'ember' | 'cream';
  image_url?: string | null;
  hsn_code: string | null;
  on_hand: number;
  qty: number;
  unit_price: number;
  mrp: number;
  base_selling_price: number;
  disc_pct: number;
  tax_pct: number;
  line_total: number;
  item_order?: number | null;
  scheme_tag: string | null;
}

export interface EstimateComposerDocument {
  id: string;
  estimate_number: string;
  status: string;
  buyer_id: string | null;
  location_id: string | null;
  location_name: string | null;
  available_locations: ComposerLocationOption[];
  estimate_date: string;
  valid_until: string;
  buyer_po_ref: string;
  place_of_supply: string;
  seller_note: string;
  freight: number;
  discount_flat: number;
  round_off: number;
  sent_at: string | null;
  sent_channel: EstimateSendChannel | null;
  items: EstimateComposerLineInput[];
  buyer_context: EstimateComposerBuyerContext | null;
  estimate_version: number;
  viewed_at: string | null;
  viewed_by_name: string | null;
  voided_at: string | null;
  converted_to_order_id: string | null;
  linked_order_number: string | null;
  is_buyer_app: boolean;
}

export interface EstimateComposerTotals {
  subtotal: number;
  discount_flat: number;
  freight: number;
  taxable_amount: number;
  tax_amount: number;
  round_off: number;
  grand_total: number;
  total_units: number;
}

export function hasEstimateComposerCreditLimit(
  creditLimit: number | null | undefined,
): creditLimit is number {
  return creditLimit != null && creditLimit > 0;
}

/** Used-credit fill: % of limit when configured, otherwise a full bar. */
export function resolveEstimateComposerCreditUsedPct(
  creditUsed: number,
  creditLimit: number | null | undefined,
): number {
  if (!hasEstimateComposerCreditLimit(creditLimit)) {
    return 100;
  }

  const used = Math.max(0, creditUsed);
  if (used === 0) {
    return 0;
  }

  return Math.min(100, (used / creditLimit) * 100);
}

export function resolveEstimateComposerCreditTone(
  creditUsed: number,
  creditLimit: number | null | undefined,
  previewAmount = 0,
): EstimateComposerCreditTone {
  if (!hasEstimateComposerCreditLimit(creditLimit)) {
    return Math.max(0, creditUsed) + Math.max(0, previewAmount) > 0 ? 'danger' : 'success';
  }

  const projectedPct =
    ((Math.max(0, creditUsed) + Math.max(0, previewAmount)) / creditLimit) * 100;
  if (projectedPct > 100) return 'danger';
  if (projectedPct >= 80) return 'warning';
  return 'success';
}

export function resolveEstimateComposerCreditPreviewPct(
  creditUsed: number,
  creditLimit: number | null | undefined,
  previewAmount: number,
  usedPct: number,
): number {
  if (!hasEstimateComposerCreditLimit(creditLimit) || previewAmount <= 0) {
    return 0;
  }

  const projectedPct =
    ((Math.max(0, creditUsed) + Math.max(0, previewAmount)) / creditLimit) * 100;
  if (projectedPct >= 100) {
    return Math.max(0, 100 - usedPct);
  }

  return Math.max(0, projectedPct - usedPct);
}

export interface EstimateComposerSavePayload {
  estimate_number?: string;
  buyer_id?: string | null;
  location_id?: string | null;
  estimate_date?: string;
  valid_until?: string;
  buyer_po_ref?: string;
  place_of_supply?: string;
  seller_note?: string;
  freight?: number;
  discount_flat?: number;
  round_off?: number;
  items?: Array<{
    id?: string;
    tenant_product_id: string;
    qty: number;
    unit_price: number;
    disc_pct: number;
    tax_pct: number;
    item_order?: number | null;
    scheme_tag?: string | null;
  }>;
}
