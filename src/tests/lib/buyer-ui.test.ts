import { describe, expect, it } from 'vitest';

import { formatBuyerCurrency, hasBuyerCampaignPrice } from '@/lib/buyer-ui';

describe('buyer-ui helpers', () => {
  it('formats buyer currency as absolute INR without compacting', () => {
    expect(formatBuyerCurrency(15430)).toBe('₹15,430');
    expect(formatBuyerCurrency(52300000)).toBe('₹5,23,00,000');
  });

  it('preserves decimal amounts instead of rounding to whole rupees', () => {
    expect(formatBuyerCurrency(15430.75)).toBe('₹15,430.75');
    expect(formatBuyerCurrency(99.5)).toBe('₹99.5');
  });

  it('shows campaign strike-through only when campaign price is distinct', () => {
    expect(hasBuyerCampaignPrice({ has_campaign_price: true, price: 950, resolved_price: 1200 })).toBe(true);
    expect(hasBuyerCampaignPrice({ has_campaign_price: true, price: 950, resolved_price: 950 })).toBe(false);
    expect(hasBuyerCampaignPrice({ has_campaign_price: false, price: 950, resolved_price: 1200 })).toBe(false);
  });
});
