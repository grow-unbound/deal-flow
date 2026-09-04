import type { ImportAnomaly, ImportAnomalyKind } from '@/lib/onboarding/types';
import { uniqueSlugForName } from '@/lib/onboarding/import-rows';

export const REVIEWABLE_ANOMALY_KINDS = ['missing_sku', 'missing_gst', 'zero_price'] as const;

export type ReviewableAnomalyKind = (typeof REVIEWABLE_ANOMALY_KINDS)[number];

export function isReviewableAnomalyKind(kind: ImportAnomalyKind): kind is ReviewableAnomalyKind {
  return (REVIEWABLE_ANOMALY_KINDS as readonly string[]).includes(kind);
}

export function filterReviewAnomalies(anomalies: ImportAnomaly[]): ImportAnomaly[] {
  return anomalies.filter((row) => isReviewableAnomalyKind(row.kind));
}

export function reviewCountLabel(count: number): string {
  if (count === 1) return '1 item needs review';
  return `${count} items need review`;
}

export function reviewIssueLabel(kind: ImportAnomalyKind): string {
  if (kind === 'missing_sku') return 'SKU missing';
  if (kind === 'missing_gst') return 'GST missing';
  if (kind === 'zero_price') return 'Base selling rate missing';
  return rowMessageFallback(kind);
}

function rowMessageFallback(kind: ImportAnomalyKind): string {
  return kind.replace(/_/g, ' ');
}

/** Prefill only for missing SKU. GST and price stay empty. Mutates `taken`. */
export function recommendedSku(productName: string, taken: Set<string>): string {
  return uniqueSlugForName(productName, taken);
}

export function skuRecommendations(
  anomalies: ImportAnomaly[],
  existingSkus: string[],
): Map<string, string> {
  const taken = new Set(existingSkus.map((sku) => sku.trim()).filter(Boolean));
  const recs = new Map<string, string>();
  for (const row of anomalies) {
    if (row.kind !== 'missing_sku') continue;
    recs.set(reviewRowKey(row), recommendedSku(row.productName, taken));
  }
  return recs;
}

export function reviewRowKey(row: ImportAnomaly): string {
  return `${row.productId ?? row.sku}::${row.kind}`;
}
