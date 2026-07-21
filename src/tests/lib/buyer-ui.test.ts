import { describe, expect, it } from 'vitest';

import { formatNumberValue } from '@/lib/number-format';
import { hasBuyerCampaignPrice } from '@/lib/buyer-ui';

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
  });
});
