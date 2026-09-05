import { describe, expect, it } from 'vitest';
import {
  filterReviewAnomalies,
  recommendedSku,
  reviewCountLabel,
  reviewIssueLabel,
  skuRecommendations,
} from '@/lib/onboarding/review-anomalies';
import type { ImportAnomaly } from '@/lib/onboarding/types';

describe('onboarding review anomalies', () => {
  it('keeps SKU, GST, and base rate issues and drops HSN/brand/category', () => {
    const rows: ImportAnomaly[] = [
      { sku: '', productName: 'Nails', kind: 'missing_sku', message: 'SKU missing', productId: '1' },
      { sku: 'A1', productName: 'Cam', kind: 'missing_gst', message: 'GST rate missing', productId: '2' },
      { sku: 'A1', productName: 'Cam', kind: 'zero_price', message: 'Base selling rate missing', productId: '2' },
      { sku: 'A1', productName: 'Cam', kind: 'missing_hsn', message: 'HSN code missing', productId: '2' },
      { sku: 'A1', productName: 'Cam', kind: 'missing_name', message: 'Product name missing', productId: '2' },
    ];
    expect(filterReviewAnomalies(rows).map((row) => row.kind)).toEqual([
      'missing_sku',
      'missing_gst',
      'zero_price',
    ]);
  });

  it('recommends a unique SKU from the product name and leaves GST/price empty', () => {
    expect(reviewIssueLabel('missing_sku')).toBe('SKU missing');
    expect(reviewIssueLabel('missing_gst')).toBe('GST missing');
    expect(reviewIssueLabel('zero_price')).toBe('Base selling rate missing');
    expect(reviewCountLabel(1)).toBe('1 item needs review');
    expect(reviewCountLabel(17)).toBe('17 items need review');
    const taken = new Set(['nails']);
    expect(recommendedSku('Nails', taken)).toBe('nails-2');
    const recs = skuRecommendations(
      [{ sku: '', productName: 'POCO M7 Pro', kind: 'missing_sku', message: 'SKU missing', productId: 'p1' }],
      ['poco-m7-pro'],
    );
    expect(recs.get('p1::missing_sku')).toBe('poco-m7-pro-2');
  });
});
