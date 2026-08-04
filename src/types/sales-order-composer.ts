export type SalesOrderComposerMode = 'create' | 'edit';

import type { ComposerLocationOption } from './estimate-composer';

export interface SalesOrderComposerBuyerContext {
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
  credit_limit: number;
  credit_used: number;
  credit_available: number;
  active_pricelist: {
    id: string;
    name: string;
  } | null;
  sales_agent_name: string | null;
}

export interface SalesOrderComposerProductSearchRow {
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

export interface SalesOrderComposerLineInput {
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

export interface SalesOrderComposerDocument {
  id: string;
  order_number: string;
  status: string;
  buyer_id: string | null;
  location_id: string | null;
  location_name: string | null;
  available_locations: ComposerLocationOption[];
  order_date: string;
  expected_delivery: string;
  buyer_po_ref: string;
  place_of_supply: string;
  seller_note: string;
  freight: number;
  discount_flat: number;
  round_off: number;
  has_backorder: boolean;
  estimate_id: string | null;
  source_estimate_number: string | null;
  buyer_context: SalesOrderComposerBuyerContext | null;
  items: SalesOrderComposerLineInput[];
}

export interface SalesOrderComposerTotals {
  subtotal: number;
  discount_flat: number;
  freight: number;
  taxable_amount: number;
  tax_amount: number;
  round_off: number;
  grand_total: number;
  total_units: number;
}

export interface SalesOrderComposerSavePayload {
  order_number?: string;
  buyer_id?: string | null;
  location_id?: string | null;
  order_date?: string;
  expected_delivery?: string;
  buyer_po_ref?: string;
  place_of_supply?: string;
  seller_note?: string;
  freight?: number;
  discount_flat?: number;
  round_off?: number;
  estimate_id?: string | null;
  has_backorder?: boolean;
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

export interface SalesOrderStockCheckRow {
  line_id: string;
  sku: string;
  product_name: string;
  on_hand: number;
  qty: number;
  is_short: boolean;
  shortfall: number;
}
