import { describe, expect, it } from 'vitest';
import { computeStrategyPrice, formatStrategySummary } from '@/lib/price-list-strategy';

describe('price-list-strategy', () => {
  it('computes percent discount off base (legacy margin_from_mrp key)', () => {
    const product = { base_selling_price: 1000, mrp: 1200 };
    expect(computeStrategyPrice(product, 'margin_from_mrp', '10')).toBe(900);
    expect(computeStrategyPrice(product, 'margin_from_mrp', '0')).toBe(1000);
  });

  it('formats strategy summaries', () => {
    expect(formatStrategySummary('edit_each', null)).toBe('Independent product pricing');
    expect(formatStrategySummary('margin_from_mrp', 12)).toBe('12% off base price');
    expect(formatStrategySummary('flat_off_base', 50)).toBe('Flat ₹50 off base price');
  });
});
