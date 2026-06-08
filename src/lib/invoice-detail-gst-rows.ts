export type InvoiceGstRowToken = 'cgst' | 'sgst' | 'igst';

export interface InvoiceGstRow {
  label: string;
  rate_pct: number;
  amount: number;
  token: InvoiceGstRowToken;
}

/**
 * Build GST rows for invoice detail / PDF. When intra-state, split total tax into CGST+SGST halves.
 */
export function buildInvoiceGstRows(intraState: boolean, taxable: number, taxAmount: number): InvoiceGstRow[] {
  if (taxable <= 0 || taxAmount <= 0) return [];
  const effRate = (taxAmount / taxable) * 100;
  const r = Math.round(effRate * 100) / 100;
  if (intraState) {
    const halfAmt = taxAmount / 2;
    const halfR = Math.round((r / 2) * 100) / 100;
    return [
      { label: `CGST ${halfR}%`, rate_pct: halfR, amount: halfAmt, token: 'cgst' },
      { label: `SGST ${halfR}%`, rate_pct: halfR, amount: halfAmt, token: 'sgst' },
    ];
  }
  return [{ label: `IGST ${r}%`, rate_pct: r, amount: taxAmount, token: 'igst' }];
}
