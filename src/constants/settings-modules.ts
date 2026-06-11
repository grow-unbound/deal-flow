export const GST_RATE_OPTIONS = [
  { value: 0 as const, label: '0% — Exempt' },
  { value: 5 as const, label: '5% — Essential goods' },
  { value: 12 as const, label: '12% — Standard goods' },
  { value: 18 as const, label: '18% — Standard services' },
  { value: 28 as const, label: '28% — Luxury / demerit' },
] as const;

export const UOM_OPTIONS = [
  { value: 'PCS', label: 'PCS — Piece' },
  { value: 'BOX', label: 'BOX — Box' },
  { value: 'CASE', label: 'CASE — Case' },
  { value: 'KG', label: 'KG — Kilogram' },
  { value: 'LTR', label: 'LTR — Litre' },
  { value: 'MTR', label: 'MTR — Metre' },
] as const;

export const INVENTORY_LOCK_STAGE_OPTIONS = [
  { value: 'enquiry' as const, label: 'Buyer Enquiry' },
  { value: 'sales_order' as const, label: 'Sales Order' },
  { value: 'invoice' as const, label: 'Invoice' },
] as const;

export const PRICE_VISIBILITY_OPTIONS = [
  { value: 'discounted_only' as const, label: 'Their discounted price only' },
  { value: 'show_both' as const, label: 'Show base price + their price (highlights the discount)' },
  { value: 'hidden' as const, label: 'Price hidden — show on request' },
] as const;
