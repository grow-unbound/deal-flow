import { z } from 'zod';

export const SalesOrderUiStatusSchema = z.enum([
  'received',
  'confirmed',
  'dispatched',
  'delivered',
  'cancelled',
]);

export type SalesOrderUiStatus = z.infer<typeof SalesOrderUiStatusSchema>;

export const SalesOrderActivityKindSchema = z.enum([
  'placed',
  'line_edited',
  'confirmed',
  'short_stock',
  'dispatched',
  'delivered',
  'payment_received',
  'cancelled',
  'audit',
]);

export type SalesOrderActivityKind = z.infer<typeof SalesOrderActivityKindSchema>;

export const SalesOrderActivityRowSchema = z.object({
  id: z.string(),
  kind: SalesOrderActivityKindSchema,
  title: z.string(),
  detail: z.string(),
  who: z.string(),
  at: z.string(),
  tone: z.enum(['neutral', 'accent', 'warn', 'success', 'danger']).optional(),
});

export const SalesOrderLineSchema = z.object({
  id: z.string(),
  tenant_product_id: z.string().uuid(),
  name: z.string(),
  brand: z.string(),
  brand_initials: z.string(),
  brand_hue: z.enum(['teal', 'ember', 'cream']),
  image_url: z.string().nullable().optional(),
  sku: z.string(),
  qty: z.number(),
  unit_price: z.number(),
  tax_rate: z.number().nullable(),
  tax_pct: z.number().nullable(),
  disc_pct: z.number(),
  hsn_code: z.string().nullable(),
  unit: z.string().nullable(),
  line_total: z.number(),
  on_hand: z.number(),
  on_hand_at_confirm: z.number().nullable().optional(),
  scheme_tag: z.string().nullable().optional(),
});

export const SalesOrderInvoiceSchema = z.object({
  invoice_number: z.string(),
  invoice_date: z.string(),
  terms_label: z.string(),
  subtotal: z.number(),
  tax_amount: z.number(),
  total_amount: z.number(),
  status: z.string(),
});

export const SalesOrderEstimateSchema = z.object({
  id: z.string(),
  estimate_number: z.string().nullable(),
});

export const SalesOrderStepperTimestampsSchema = z.object({
  received: z.string().optional(),
  confirmed: z.string().optional(),
  dispatched: z.string().optional(),
  delivered: z.string().optional(),
  cancelled: z.string().optional(),
});

const BuyerContextSchema = z.object({
  id: z.string(),
  business_name: z.string(),
  contact_name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  bill_address: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  place_of_supply: z.string(),
  seller_state: z.string().nullable(),
  payment_terms_days: z.number(),
  credit_limit: z.number(),
  credit_used: z.number(),
  credit_available: z.number(),
  active_pricelist: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  sales_agent_name: z.string().nullable(),
});

export const SalesOrderDetailSchema = z.object({
  id: z.string(),
  order_number: z.string(),
  location_id: z.string().nullable(),
  location_name: z.string().nullable(),
  db_status: z.string(),
  ui_status: SalesOrderUiStatusSchema,
  placed_at: z.string().nullable(),
  source: z.string().nullable(),
  catalog_name: z.string().nullable(),
  subtotal: z.number(),
  tax_amount: z.number(),
  total_amount: z.number(),
  currency: z.string(),
  notes: z.string().nullable(),
  cancel_reason: z.string().nullable(),
  viewer_role: z.string().nullable(),
  buyer_context: BuyerContextSchema.nullable(),
  discount_flat: z.number(),
  freight: z.number(),
  round_off: z.number(),
  has_backorder: z.boolean(),
  expected_delivery: z.string().nullable(),
  buyer_po_ref: z.string().nullable(),
  place_of_supply: z.string().nullable(),
  seller_note: z.string().nullable(),
  received_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  dispatched_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  carrier: z.string().nullable(),
  dispatch_notes: z.string().nullable(),
  buyer: z.object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    state: z.string().nullable(),
    gstin: z.string().nullable(),
    credit_limit: z.number(),
    payment_terms_days: z.number(),
    contact_name: z.string().nullable(),
    phone: z.string().nullable(),
    geography: z.record(z.unknown()).nullable().optional(),
  }),
  lines: z.array(SalesOrderLineSchema),
  invoice: SalesOrderInvoiceSchema.nullable(),
  estimate: SalesOrderEstimateSchema.nullable(),
  activity: z.array(SalesOrderActivityRowSchema),
  stepper_timestamps: SalesOrderStepperTimestampsSchema,
});

export type SalesOrderDetail = z.infer<typeof SalesOrderDetailSchema>;
export type SalesOrderLine = z.infer<typeof SalesOrderLineSchema>;
export type SalesOrderActivityRow = z.infer<typeof SalesOrderActivityRowSchema>;

export const CancelSalesOrderReasonSchema = z.enum([
  'buyer_requested',
  'stock_unavailable',
  'pricing_dispute',
  'duplicate',
  'other',
]);

export const CancelSalesOrderBodySchema = z.object({
  reason: CancelSalesOrderReasonSchema,
  notes: z.string().max(2000).optional(),
});

export type CancelSalesOrderBody = z.infer<typeof CancelSalesOrderBodySchema>;

export const DispatchSalesOrderBodySchema = z.object({
  carrier: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  notify_buyer: z.boolean().optional(),
});

export type DispatchSalesOrderBody = z.infer<typeof DispatchSalesOrderBodySchema>;

export const DeliverSalesOrderBodySchema = z.object({
  notify_buyer: z.boolean().optional(),
});

export type DeliverSalesOrderBody = z.infer<typeof DeliverSalesOrderBodySchema>;
