import { formatInr } from '@/lib/utils';
import type { EstimateComposerDocument, EstimateComposerTotals } from '@/types/estimate-composer';
import type { InvoiceComposerDocument } from '@/types/invoice-composer';
import type { SalesOrderComposerDocument } from '@/types/sales-order-composer';

export type ComposerStagedLine = { diff?: 'clean' | 'added' | 'changed' | 'removed' };

function countLineDiffs(lines: ComposerStagedLine[]) {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const line of lines) {
    if (line.diff === 'added') added += 1;
    else if (line.diff === 'removed') removed += 1;
    else if (line.diff === 'changed') changed += 1;
  }
  return { added, removed, changed };
}

function formatLineDiffSummary(lines: ComposerStagedLine[]): string | null {
  const { added, removed, changed } = countLineDiffs(lines);
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (changed) parts.push(`${changed} changed`);
  return parts.length > 0 ? parts.join(', ') : null;
}

function normalizeSecondDate(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  return value;
}

export interface ComposerStagedDocSlice {
  buyerId: string | null;
  buyerBusinessName: string | null | undefined;
  buyerPoRef: string;
  dateIssued: string;
  secondDate: string | null;
  placeOfSupply: string;
  sellerNote: string;
  freight: number;
  discountFlat: number;
  roundOff: number;
}

export function stagedSliceFromEstimate(doc: EstimateComposerDocument): ComposerStagedDocSlice {
  return {
    buyerId: doc.buyer_id,
    buyerBusinessName: doc.buyer_context?.business_name,
    buyerPoRef: doc.buyer_po_ref,
    dateIssued: doc.date_issued,
    secondDate: doc.valid_until,
    placeOfSupply: doc.place_of_supply,
    sellerNote: doc.seller_note,
    freight: doc.freight,
    discountFlat: doc.discount_flat,
    roundOff: doc.round_off,
  };
}

export function stagedSliceFromInvoice(doc: InvoiceComposerDocument): ComposerStagedDocSlice {
  return {
    buyerId: doc.buyer_id,
    buyerBusinessName: doc.buyer_context?.business_name,
    buyerPoRef: doc.buyer_po_ref,
    dateIssued: doc.invoice_date,
    secondDate: doc.due_date,
    placeOfSupply: doc.place_of_supply,
    sellerNote: doc.seller_note,
    freight: doc.freight,
    discountFlat: doc.discount_flat,
    roundOff: doc.round_off,
  };
}

export function stagedSliceFromSalesOrder(doc: SalesOrderComposerDocument): ComposerStagedDocSlice {
  return {
    buyerId: doc.buyer_id,
    buyerBusinessName: doc.buyer_context?.business_name,
    buyerPoRef: doc.buyer_po_ref,
    dateIssued: doc.order_date,
    secondDate: doc.expected_delivery,
    placeOfSupply: doc.place_of_supply,
    sellerNote: doc.seller_note,
    freight: doc.freight,
    discountFlat: doc.discount_flat,
    roundOff: doc.round_off,
  };
}

/**
 * When editing and dirty, lists only fields that differ from the loaded snapshot.
 * Used by document composers for the TotalsCard “Staged changes” panel.
 */
export function buildComposerStagedChanges(args: {
  mode: 'create' | 'edit';
  dirty: boolean;
  originalDoc: ComposerStagedDocSlice | null;
  currentDoc: ComposerStagedDocSlice;
  diffLines: ComposerStagedLine[];
  originalTotals: EstimateComposerTotals | null;
  currentTotals: EstimateComposerTotals;
}): Array<{ label: string; value: string }> | undefined {
  const { mode, dirty, originalDoc, currentDoc, diffLines, originalTotals, currentTotals } = args;
  if (mode !== 'edit' || !dirty || !originalDoc || !originalTotals) return undefined;

  const rows: Array<{ label: string; value: string }> = [];

  if (
    originalDoc.buyerId !== currentDoc.buyerId
    || (originalDoc.buyerBusinessName ?? '') !== (currentDoc.buyerBusinessName ?? '')
  ) {
    const name = currentDoc.buyerBusinessName?.trim() || (currentDoc.buyerId ? 'Buyer updated' : 'Unassigned buyer');
    rows.push({ label: 'Buyer', value: name });
  }

  const origSecond = normalizeSecondDate(originalDoc.secondDate);
  const curSecond = normalizeSecondDate(currentDoc.secondDate);
  if (originalDoc.dateIssued !== currentDoc.dateIssued || origSecond !== curSecond) {
    let value = currentDoc.dateIssued;
    if (curSecond) {
      value = `${currentDoc.dateIssued} → ${curSecond}`;
    } else if (origSecond) {
      value = `${currentDoc.dateIssued} (second date cleared)`;
    }
    rows.push({ label: 'Dates', value });
  }

  if ((originalDoc.placeOfSupply ?? '') !== (currentDoc.placeOfSupply ?? '')) {
    rows.push({ label: 'Place of supply', value: currentDoc.placeOfSupply.trim() || '—' });
  }

  if ((originalDoc.buyerPoRef ?? '') !== (currentDoc.buyerPoRef ?? '')) {
    rows.push({ label: 'Buyer PO ref', value: currentDoc.buyerPoRef.trim() || '—' });
  }

  if ((originalDoc.sellerNote ?? '') !== (currentDoc.sellerNote ?? '')) {
    rows.push({ label: 'Notes', value: currentDoc.sellerNote.trim() ? 'Updated' : 'Cleared' });
  }

  const lineSummary = formatLineDiffSummary(diffLines);
  if (lineSummary) {
    rows.push({ label: 'Lines', value: lineSummary });
  }

  if (originalDoc.freight !== currentDoc.freight) {
    rows.push({ label: 'Freight & packing', value: formatInr(currentDoc.freight) });
  }
  if (originalDoc.discountFlat !== currentDoc.discountFlat) {
    rows.push({ label: 'Document discount', value: formatInr(currentDoc.discountFlat) });
  }
  if (originalDoc.roundOff !== currentDoc.roundOff) {
    rows.push({ label: 'Round-off', value: formatInr(currentDoc.roundOff) });
  }

  if (Math.abs(originalTotals.grand_total - currentTotals.grand_total) > 0.005) {
    rows.push({ label: 'Grand total', value: formatInr(currentTotals.grand_total) });
  }

  return rows.length > 0 ? rows : undefined;
}
