/** Minimal line shape for totals (matches estimate/invoice/SO line rows). */
export interface DocumentLineForTotals {
  qty: number;
  unit_price: number;
  disc_pct: number;
  tax_pct: number;
  diff?: 'clean' | 'added' | 'changed' | 'removed';
}

export interface DocumentComposerTotals {
  subtotal: number;
  discount_flat: number;
  freight: number;
  taxable_amount: number;
  tax_amount: number;
  round_off: number;
  grand_total: number;
  total_units: number;
  gst_inclusive: boolean;
}

export function defaultPaymentTerms(days: number | null | undefined): string {
  const n = Number(days ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 'Not defined';
  return `${n} days`;
}

/**
 * Computes the line total for a single line item.
 *
 * When gstInclusive is true, the unit_price already includes GST so no
 * additional tax multiplication is applied — the taxable amount IS the total.
 */
export function computeLineTotal(
  line: Pick<DocumentLineForTotals, 'qty' | 'unit_price' | 'disc_pct' | 'tax_pct'>,
  gstInclusive = false,
): number {
  const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
  if (gstInclusive) return Number(taxable.toFixed(2));
  return Number((taxable + taxable * (line.tax_pct / 100)).toFixed(2));
}

export function computeTotals(
  lines: DocumentLineForTotals[],
  discountFlat: number,
  freight: number,
  roundOff: number,
  gstInclusive = false,
): DocumentComposerTotals {
  const activeLines = lines.filter((line) => line.diff !== 'removed');
  const subtotal = activeLines.reduce(
    (sum, line) => sum + line.qty * line.unit_price * (1 - line.disc_pct / 100),
    0,
  );
  const taxAmount = gstInclusive
    ? 0
    : activeLines.reduce((sum, line) => {
        const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
        return sum + taxable * (line.tax_pct / 100);
      }, 0);

  return {
    subtotal,
    discount_flat: discountFlat,
    freight,
    taxable_amount: Math.max(subtotal - discountFlat, 0),
    tax_amount: taxAmount,
    round_off: roundOff,
    grand_total: Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff,
    total_units: activeLines.reduce((sum, line) => sum + line.qty, 0),
    gst_inclusive: gstInclusive,
  };
}
