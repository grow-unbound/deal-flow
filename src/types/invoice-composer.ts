import type { EstimateComposerBuyerContext, EstimateComposerProductSearchRow } from './estimate-composer';

export type { EstimateComposerBuyerContext as InvoiceComposerBuyerContext };
export type { EstimateComposerProductSearchRow as InvoiceComposerProductSearchRow };

export interface InvoiceComposerLineInput {
  id: string;
  tenant_product_id: string;
  product_name: string;
  sku: string;
  brand_name: string;
  brand_initials: string;
  brand_hue: 'teal' | 'ember' | 'cream';
  hsn_code: string | null;
  on_hand: number;
  qty: number;
  unit_price: number;
  disc_pct: number;
  tax_pct: number;
  line_total: number;
  scheme_tag: string | null;
}

export interface InvoiceComposerDocument {
  id: string;
  invoice_number: string;
  status: string;
  buyer_id: string | null;
  invoice_date: string;
  due_date: string | null;
  buyer_po_ref: string;
  place_of_supply: string;
  seller_note: string;
  freight: number;
  discount_flat: number;
  round_off: number;
  sent_at: string | null;
  sent_channel: string | null;
  items: InvoiceComposerLineInput[];
  buyer_context: EstimateComposerBuyerContext | null;
  order_id: string | null;
  estimate_id: string | null;
  linked_order_number: string | null;
  linked_estimate_number: string | null;
}

export interface InvoiceComposerTotals {
  subtotal: number;
  discount_flat: number;
  freight: number;
  taxable_amount: number;
  tax_amount: number;
  round_off: number;
  grand_total: number;
  total_units: number;
}

export interface InvoiceComposerSavePayload {
  invoice_number?: string;
  buyer_id?: string | null;
  invoice_date?: string;
  due_date?: string | null;
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
    scheme_tag?: string | null;
  }>;
}
