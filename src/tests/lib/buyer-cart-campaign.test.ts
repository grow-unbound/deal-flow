import { describe, expect, it } from 'vitest';

import { resolveBuyerCartCampaignId } from '@/lib/buyer-cart-campaign';

describe('resolveBuyerCartCampaignId', () => {
  it('prefers explicit cart campaign id', () => {
    expect(resolveBuyerCartCampaignId('campaign-a', [{ campaign_id: 'campaign-b' }])).toBe('campaign-a');
  });

  it('falls back to item campaign id', () => {
    expect(resolveBuyerCartCampaignId(null, [{ campaign_id: 'campaign-b' }])).toBe('campaign-b');
  });
});
