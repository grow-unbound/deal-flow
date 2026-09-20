import { describe, expect, it } from 'vitest';

import { formatNumberValue } from '@/lib/number-format';
import { dedupeBuyerCatalogItems, hasBuyerCampaignPrice } from '@/lib/buyer-ui';

describe('buyer-ui helpers', () => {
  it('formats buyer currency as absolute INR without compacting', () => {
    expect(formatNumberValue(15430, 'CURRENCY_EXACT')).toBe('₹15,430');
    expect(formatNumberValue(52300000, 'CURRENCY_EXACT')).toBe('₹5,23,00,000');
  });

  it('preserves decimal amounts instead of rounding to whole rupees', () => {
    expect(formatNumberValue(15430.75, 'CURRENCY_EXACT')).toBe('₹15,430.75');
    expect(formatNumberValue(99.5, 'CURRENCY_EXACT')).toBe('₹99.50');
  });

  it('shows campaign strike-through only when campaign price is distinct', () => {
    expect(hasBuyerCampaignPrice({ has_campaign_price: true, price: 950, resolved_price: 1200 })).toBe(true);
    expect(hasBuyerCampaignPrice({ has_campaign_price: true, price: 950, resolved_price: 950 })).toBe(false);
    expect(hasBuyerCampaignPrice({ has_campaign_price: false, price: 950, resolved_price: 1200 })).toBe(false);
    expect(hasBuyerCampaignPrice({ has_campaign_price: true, price: null, resolved_price: 1200 })).toBe(false);
  });

  it('dedupes repeated public product-family cards by family identity', () => {
    const items = dedupeBuyerCatalogItems([
      {
        id: 'family-1',
        item_type: 'family',
        tenant_product_id: 'sku-1',
        display_name: 'Dewatering Pump',
        brand_id: 'brand-1',
        category_id: 'cat-1',
      },
      {
        id: 'family-2',
        item_type: 'family',
        tenant_product_id: 'sku-2',
        display_name: 'Dewatering Pump',
        brand_id: 'brand-1',
        category_id: 'cat-1',
      },
      {
        id: 'sku-1',
        item_type: 'sku',
        tenant_product_id: 'sku-1',
        display_name: 'Dewatering Pump 1HP',
      },
    ]);

    expect(items.map((item) => item.id)).toEqual(['family-1', 'sku-1']);
  });
});
